import asyncio
import base64
import hashlib
import hmac
import io
import json
import re
import secrets
import sqlite3
import time
import uuid
import wave
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from .core.auth import resolve_identity
from .core.config import settings
from .core.logging import configure_logging, install_request_logging
from .core.limits import install_edge_limits
from .core.observability import configure_telemetry, observe, safe_attributes
from .schemas.profiles import Profile, ProfileUpdate
from .schemas.cards import Card, CardUpdate, Contact, ContactCreate, ContactUpdate, ConversationNoteLink, PublicCard
from .services.cards import SLUG_PATTERN, card_html, public_projection, qr_svg, vcard
from .services.context import build_cue_prompt
from .services.inference import check_provider_auth, demo_cues, generate_text, validate_cues
from .services.summaries import finalize as finalize_conversation
from .services.summaries import summarize as summarize_text

MODE = settings.app_mode
DB = settings.database_path
TABLE = settings.firestore_collection
GEMINI_KEY = settings.gemini_api_key
log = configure_logging(settings)
configure_telemetry(settings)
app = FastAPI(title='Co-Wingman', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=['GET','POST','PUT','DELETE'], allow_headers=['Authorization','Content-Type','X-Request-ID','X-Demo-Owner'], expose_headers=['X-Request-ID'])
install_edge_limits(app, settings)
install_request_logging(app, log)

@contextmanager
def database():
    con = sqlite3.connect(DB, timeout=10)
    con.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
    try:
        yield con
        con.commit()
    finally:
        con.close()

def read(key):
    provider = 'firestore' if TABLE else 'sqlite'
    with observe('storage.read', component='storage', operation='read', provider=provider):
        if TABLE:
            from google.cloud import firestore
            item = firestore.Client().collection(TABLE).document(key).get()
            return json.loads(item.to_dict()['body']) if item.exists else None
        with database() as con:
            row = con.execute('SELECT body FROM records WHERE id=?', (key,)).fetchone()
            return json.loads(row[0]) if row else None

def write(key, value):
    version = value.get('_version', 0)
    guarded = key.startswith('session:')
    updated = dict(value, _version=version+1)
    body = json.dumps(updated)
    provider = 'firestore' if TABLE else 'sqlite'
    with observe('storage.write', component='storage', operation='write', provider=provider):
        if TABLE:
            from google.cloud import firestore
            client = firestore.Client()
            ref = client.collection(TABLE).document(key)
            item = {'body': body, 'version': version+1}
            if guarded:
                item['expires_at'] = datetime.now(timezone.utc) + timedelta(days=settings.session_storage_ttl_days)
            @firestore.transactional
            def save(transaction):
                old = ref.get(transaction=transaction)
                if guarded and old.exists and old.to_dict().get('version', 0) != version:
                    raise HTTPException(409, 'Session changed. Please try again.')
                transaction.set(ref, item)
            save(client.transaction())
        else:
            with database() as con:
                con.execute('BEGIN IMMEDIATE')
                old = con.execute('SELECT body FROM records WHERE id=?', (key,)).fetchone()
                if guarded and old and json.loads(old[0]).get('_version',0) != version:
                    raise HTTPException(409, 'Session changed. Please try again.')
                con.execute('INSERT OR REPLACE INTO records VALUES (?, ?)', (key, body))
    value['_version'] = version+1

def delete(key):
    provider = 'firestore' if TABLE else 'sqlite'
    with observe('storage.delete', component='storage', operation='delete', provider=provider):
        if TABLE:
            from google.cloud import firestore
            firestore.Client().collection(TABLE).document(key).delete()
        else:
            with database() as con:
                con.execute('DELETE FROM records WHERE id=?', (key,))

def scan_records():
    """Administrative scan used only by authenticated account erasure."""
    if TABLE:
        from google.cloud import firestore
        for item in firestore.Client().collection(TABLE).stream():
            data = item.to_dict() or {}
            try:
                yield item.id, json.loads(data.get('body', '{}'))
            except (TypeError, json.JSONDecodeError):
                continue
    else:
        with database() as con:
            for key, body in con.execute('SELECT id, body FROM records'):
                try:
                    yield key, json.loads(body)
                except json.JSONDecodeError:
                    continue

class Start(BaseModel):
    name: str = Field(default='Someone new', max_length=100)
    context: str = Field(default='', max_length=600)
    contact: str = Field(default='', max_length=300)
    remember: bool = False
    owner: str = Field(default='', max_length=128)

class Fragment(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    pause_count: int = Field(default=0, ge=0, le=100)

class Cue(BaseModel):
    category: Literal['question','transition','talking_point','experience']
    text: str = Field(min_length=1, max_length=160)

class CueResult(BaseModel):
    cues: list[Cue] = Field(min_length=2, max_length=4)

def contact_key(owner, contact):
    return 'contact:'+hashlib.sha256((owner+':'+contact.strip().lower()).encode()).hexdigest()

def profile_key(user_id):
    return 'profile:'+hashlib.sha256(user_id.encode()).hexdigest()

def owner_key(prefix, user_id):
    return prefix+':'+hashlib.sha256(user_id.encode()).hexdigest()

def public_card_url(slug):
    return f'{settings.public_base_url}/c/{slug}'

def new_card(identity):
    profile = read(profile_key(identity.user_id)) or {}
    return {
        'display_name':profile.get('display_name',''), 'headline':profile.get('headline',''),
        'organization':profile.get('organization',''), 'email':identity.email or '',
        'phone':'', 'website':profile.get('portfolio_url',''), 'bio':'', 'published':False,
        'visibility':{field:True for field in ('display_name','headline','organization','email','phone','website','bio')},
        'slug':secrets.token_urlsafe(18), 'updated_at':datetime.now(timezone.utc).isoformat(),
    }

def get_or_create_card(identity):
    key = owner_key('card', identity.user_id)
    record = read(key)
    if not record:
        record = new_card(identity)
        write(key, record)
        write('public-card:'+record['slug'], {'owner_key':key})
    return key, record

_public_reads: dict[str, tuple[int, int]] = {}

def rate_limit_public(request: Request):
    address = request.client.host if request.client else 'unknown'
    minute = int(time.time() // 60)
    old_minute, count = _public_reads.get(address, (minute, 0))
    count = count + 1 if old_minute == minute else 1
    _public_reads[address] = (minute, count)
    if count > 90:
        raise HTTPException(429, 'Too many card requests. Try again shortly.')

def resolve_public_card(slug: str, request: Request) -> dict:
    rate_limit_public(request)
    if not SLUG_PATTERN.fullmatch(slug):
        raise HTTPException(404, 'Card not found')
    pointer = read('public-card:'+slug)
    record = read(pointer['owner_key']) if pointer else None
    if not record or not record.get('published') or record.get('slug') != slug:
        raise HTTPException(404, 'Card not found')
    return public_projection(record, public_card_url(slug))

def authorize(sid, request):
    state = read('session:'+sid)
    raw = request.headers.get('authorization', '').removeprefix('Bearer ')
    if not state or not hmac.compare_digest(state['token_hash'], hashlib.sha256(raw.encode()).hexdigest()):
        raise HTTPException(401, 'Invalid session token')
    if state['expires'] < time.time() or state.get('ended'):
        raise HTTPException(410, 'Session has ended')
    # Stored with the session so the limiter survives worker restarts.
    now = int(time.time() // 60)
    rate = state.get('rate', {'minute': now, 'count': 0})
    if rate['minute'] != now:
        rate = {'minute': now, 'count': 0}
    if rate['count'] >= 40:
        raise HTTPException(429, 'Take a moment, then try again')
    rate['count'] += 1
    state['rate'] = rate
    write('session:'+sid, state)
    return state

async def summarize(text):
    with observe('summary.generate', component='summary', operation='generate', provider=settings.inference_provider):
        return await summarize_text(settings, text)

@app.get('/healthz')
def health():
    return {'status':'ok', 'mode':MODE}

@app.get('/readyz')
async def ready():
    checks = {'storage':False, 'inference_auth':False}
    try:
        if TABLE:
            from google.cloud import firestore
            firestore.Client().collection(TABLE).document('_readiness').get()
        else:
            with database() as con:
                con.execute('SELECT 1')
        checks['storage'] = True
        if MODE == 'demo':
            log.info('readiness_checked', extra={'status_code': 200})
            return {'ready':True,'mode':'demo','checks':{'storage':True,'providers':'simulated'}}
        checks['inference_auth'] = await check_provider_auth(settings)
    except Exception:
        log.warning('readiness_dependency_failure')
    return Response(json.dumps({'ready':all(checks.values()),'checks':checks,'mode':MODE}),status_code=200 if all(checks.values()) else 503,media_type='application/json')

@app.get('/profile/me', response_model=Profile)
def get_profile(request: Request):
    identity = resolve_identity(settings, request)
    record = read(profile_key(identity.user_id)) or {}
    if identity.email and not record.get('email'):
        record['email'] = identity.email
    return Profile.model_validate(record)

@app.put('/profile/me', response_model=Profile)
def put_profile(body: ProfileUpdate, request: Request):
    identity = resolve_identity(settings, request)
    record = body.model_dump()
    record.update(email=identity.email, updated_at=datetime.now(timezone.utc).isoformat())
    write(profile_key(identity.user_id), record)
    return Profile.model_validate(record)

@app.delete('/profile/me')
def delete_profile(request: Request):
    identity = resolve_identity(settings, request)
    delete(profile_key(identity.user_id))
    return {'deleted':True}

@app.get('/privacy/me')
def privacy_inventory(request: Request):
    identity = resolve_identity(settings, request)
    owned_sessions = 0
    remembered_contacts = 0
    for key, value in scan_records():
        if key.startswith('session:') and value.get('owner_id') == identity.user_id:
            owned_sessions += 1
        elif key.startswith('contact:') and value.get('owner_id') == identity.user_id:
            remembered_contacts += 1
    contacts = (read(contact_store(identity)) or {}).get('items', [])
    return {
        'profile': read(profile_key(identity.user_id)) is not None,
        'card': read(owner_key('card', identity.user_id)) is not None,
        'contacts': len(contacts),
        'sessions': owned_sessions,
        'remembered_conversations': remembered_contacts,
        'retention': {
            'session_access_hours': settings.session_access_ttl_hours,
            'session_storage_days': settings.session_storage_ttl_days,
            'summary_object_days': settings.summary_object_ttl_days,
            'profile_card_contacts': 'until_deleted',
        },
    }

@app.delete('/account/me')
def delete_account(request: Request):
    """Erase application data, optional summary objects, then Firebase identity."""
    identity = resolve_identity(settings, request)
    card_key = owner_key('card', identity.user_id)
    card = read(card_key)
    keys = {
        profile_key(identity.user_id), card_key, owner_key('contacts', identity.user_id),
    }
    if card and card.get('slug'):
        keys.add('public-card:'+card['slug'])
    session_ids: list[str] = []
    for key, value in scan_records():
        if key.startswith('session:') and value.get('owner_id') == identity.user_id:
            keys.add(key)
            session_ids.append(key.removeprefix('session:'))
            if value.get('contact_key'):
                keys.add(value['contact_key'])
        elif key.startswith('contact:') and value.get('owner_id') == identity.user_id:
            keys.add(key)
    for key in keys:
        delete(key)

    deleted_objects = 0
    if settings.summary_bucket:
        try:
            from google.cloud import storage
            with observe('storage.summary_delete', component='storage', operation='delete', provider='cloud_storage'):
                bucket = storage.Client().bucket(settings.summary_bucket)
                for sid in session_ids:
                    for blob in bucket.list_blobs(prefix=f'summaries/{sid}/'):
                        blob.delete()
                        deleted_objects += 1
        except Exception as error:
            log.warning('account_summary_delete_failed', extra={'exception_type': type(error).__name__})
            raise HTTPException(503, 'Account data was removed, but summary-object deletion needs operator follow-up.')

    identity_deleted = identity.provider != 'firebase'
    if identity.provider == 'firebase':
        try:
            from firebase_admin import auth
            auth.delete_user(identity.user_id)
            identity_deleted = True
        except Exception as error:
            log.warning('account_identity_delete_failed', extra={'exception_type': type(error).__name__})
            raise HTTPException(503, 'Application data was removed, but identity deletion needs operator follow-up.')
    return {'deleted': True, 'records': len(keys), 'summary_objects': deleted_objects, 'identity_deleted': identity_deleted}

@app.get('/card/me', response_model=Card)
def get_card(request: Request):
    identity = resolve_identity(settings, request)
    _, record = get_or_create_card(identity)
    return Card.model_validate(dict(record, public_url=public_card_url(record['slug'])))

@app.put('/card/me', response_model=Card)
def put_card(body: CardUpdate, request: Request):
    identity = resolve_identity(settings, request)
    key, old = get_or_create_card(identity)
    record = body.model_dump()
    record.update(slug=old['slug'], updated_at=datetime.now(timezone.utc).isoformat())
    if record['published'] and not record.get('display_name'):
        raise HTTPException(422, 'Add a visible name before publishing')
    if record['published'] and not record['visibility'].get('display_name', True):
        raise HTTPException(422, 'Your name must be visible while the card is published')
    write(key, record)
    return Card.model_validate(dict(record, public_url=public_card_url(record['slug'])))

@app.post('/card/me/rotate', response_model=Card)
def rotate_card(request: Request):
    identity = resolve_identity(settings, request)
    key, record = get_or_create_card(identity)
    delete('public-card:'+record['slug'])
    record['slug'] = secrets.token_urlsafe(18)
    record['updated_at'] = datetime.now(timezone.utc).isoformat()
    write(key, record)
    write('public-card:'+record['slug'], {'owner_key':key})
    return Card.model_validate(dict(record, public_url=public_card_url(record['slug'])))

@app.delete('/card/me')
def revoke_card(request: Request):
    identity = resolve_identity(settings, request)
    key, record = get_or_create_card(identity)
    delete('public-card:'+record['slug'])
    record.update(published=False, slug=secrets.token_urlsafe(18), updated_at=datetime.now(timezone.utc).isoformat())
    write(key, record)
    write('public-card:'+record['slug'], {'owner_key':key})
    return {'revoked':True, 'public_url':public_card_url(record['slug'])}

@app.get('/c/{slug}/data', response_model=PublicCard)
def public_card_data(slug: str, request: Request):
    return PublicCard.model_validate(resolve_public_card(slug, request))

@app.get('/c/{slug}/qr.svg')
def public_card_qr(slug: str, request: Request):
    card = resolve_public_card(slug, request)
    return Response(qr_svg(card['public_url']), media_type='image/svg+xml', headers={'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'})

@app.get('/c/{slug}.vcf')
def public_card_vcard(slug: str, request: Request):
    card = resolve_public_card(slug, request)
    filename = re.sub(r'[^A-Za-z0-9_-]+', '-', card.get('display_name') or 'contact').strip('-') or 'contact'
    return Response(vcard(card), media_type='text/vcard; charset=utf-8', headers={'Content-Disposition':f'attachment; filename="{filename}.vcf"','X-Content-Type-Options':'nosniff'})

@app.get('/c/{slug}', response_class=HTMLResponse)
def public_card_page(slug: str, request: Request):
    card = resolve_public_card(slug, request)
    return HTMLResponse(card_html(card), headers={'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})

def contact_store(identity):
    return owner_key('contacts', identity.user_id)

@app.get('/contacts', response_model=list[Contact])
def list_contacts(request: Request, q: str = Query(default='', max_length=100)):
    identity = resolve_identity(settings, request)
    contacts = (read(contact_store(identity)) or {}).get('items', [])
    needle = q.strip().casefold()
    if needle:
        contacts = [item for item in contacts if needle in ' '.join((item['snapshot'].get('display_name',''), item['snapshot'].get('headline',''), item['snapshot'].get('organization',''), item.get('user_notes',''))).casefold()]
    return contacts

@app.post('/contacts', response_model=Contact, status_code=201)
def create_contact(body: ContactCreate, request: Request):
    identity = resolve_identity(settings, request)
    key = contact_store(identity)
    store = read(key) or {'items':[]}
    now = datetime.now(timezone.utc).isoformat()
    item = {'id':str(uuid.uuid4()), 'source':body.source, 'exchanged_at':now, 'snapshot':body.snapshot.model_dump(), 'user_notes':body.user_notes, 'conversation_note':''}
    # Keep the aggregate record comfortably below Firestore's 1 MiB document limit.
    store['items'] = [item] + store['items'][:199]
    write(key, store)
    return Contact.model_validate(item)

def owned_contact(identity, contact_id):
    key = contact_store(identity)
    store = read(key) or {'items':[]}
    item = next((item for item in store['items'] if item['id'] == contact_id), None)
    if not item:
        raise HTTPException(404, 'Contact not found')
    return key, store, item

@app.put('/contacts/{contact_id}', response_model=Contact)
def update_contact(contact_id: str, body: ContactUpdate, request: Request):
    identity = resolve_identity(settings, request)
    key, store, item = owned_contact(identity, contact_id)
    item['user_notes'] = body.user_notes
    write(key, store)
    return Contact.model_validate(item)

@app.post('/contacts/{contact_id}/conversation-note', response_model=Contact)
def link_conversation_note(contact_id: str, body: ConversationNoteLink, request: Request):
    identity = resolve_identity(settings, request)
    key, store, item = owned_contact(identity, contact_id)
    item['conversation_note'] = body.note.strip()
    write(key, store)
    return Contact.model_validate(item)

@app.delete('/contacts/{contact_id}')
def delete_contact(contact_id: str, request: Request):
    identity = resolve_identity(settings, request)
    key, store, _ = owned_contact(identity, contact_id)
    store['items'] = [item for item in store['items'] if item['id'] != contact_id]
    write(key, store)
    return {'deleted':True}

@app.get('/contacts.vcf')
def export_contacts(request: Request):
    identity = resolve_identity(settings, request)
    items = (read(contact_store(identity)) or {}).get('items', [])
    content = ''.join(vcard(item['snapshot']) for item in items)
    return Response(content, media_type='text/vcard; charset=utf-8', headers={'Content-Disposition':'attachment; filename="wings-contacts.vcf"','X-Content-Type-Options':'nosniff'})

@app.post('/session/start')
def start(body: Start, request: Request):
    identity = resolve_identity(settings, request, body.owner)
    sid, token = str(uuid.uuid4()), secrets.token_urlsafe(32)
    ck = contact_key(identity.user_id, body.contact or body.name)
    memory = read(ck) if body.remember else None
    state = {'id':sid,'owner_id':identity.user_id,'name':body.name,'context':body.context,'contact_key':ck,'remember':body.remember,'memory':(memory or {}).get('summary',''),'summary':'','fragments':[],'cues':[],'audio_chunks':{},'token_hash':hashlib.sha256(token.encode()).hexdigest(),'expires':time.time()+(settings.session_access_ttl_hours*3600),'signal':'low','checkpoint_seq':0,'next_checkpoint_at':time.time()+settings.summary_checkpoint_seconds}
    write('session:'+state['id'],state)
    return {'id':sid,'token':token,'memory':state['memory'],'mode':MODE}

async def ingest_fragment(state: dict, body: Fragment, background_tasks: BackgroundTasks | None = None):
    state['fragments'].append(body.text.strip())
    joined = ' '.join(state['fragments'])
    hesitations = len(re.findall(r'\b(um|uh|maybe|sorry|actually)\b',joined,re.I))
    state['signal'] = 'high' if hesitations+body.pause_count > 5 else 'medium' if hesitations+body.pause_count > 2 else 'low'
    if len(joined)>800:
        state['summary'] = await summarize(state['summary']+' '+joined)
        state['fragments'] = [joined[-400:]]
    checkpoint = None
    if time.time() >= state.get('next_checkpoint_at', float('inf')):
        state['checkpoint_seq'] = state.get('checkpoint_seq', 0) + 1
        state['next_checkpoint_at'] = time.time() + settings.summary_checkpoint_seconds
        count = len(state['fragments'])
        checkpoint = (state['checkpoint_seq'], count, state['summary']+' '+' '.join(state['fragments'][:count]))
    write('session:'+state['id'],state)
    if checkpoint:
        if background_tasks:
            background_tasks.add_task(run_summary_checkpoint, state['id'], *checkpoint)
        else:
            task = asyncio.create_task(run_summary_checkpoint(state['id'], *checkpoint))
            _checkpoint_tasks.add(task)
            task.add_done_callback(_checkpoint_tasks.discard)
    return {'text':body.text, 'signal':state['signal'],'window_chars':len(' '.join(state['fragments']))}


_checkpoint_tasks: set[asyncio.Task] = set()


async def run_summary_checkpoint(sid: str, sequence: int, fragment_count: int, source: str):
    """Fold only the claimed fragment prefix; newer fragments remain untouched."""
    result = await summarize(source)
    for _ in range(3):
        latest = read('session:'+sid)
        if not latest or latest.get('ended') or latest.get('checkpoint_seq') != sequence:
            return
        latest['summary'] = result
        latest['fragments'] = latest.get('fragments', [])[fragment_count:]
        latest['last_checkpoint_at'] = time.time()
        try:
            write('session:'+sid, latest)
            return
        except HTTPException as error:
            if error.status_code != 409:
                raise
            await asyncio.sleep(0)
    log.warning('summary_checkpoint_conflict', extra={'checkpoint_seq': sequence})

@app.post('/session/{sid}/transcript')
async def transcript(sid: str, body: Fragment, request: Request, background_tasks: BackgroundTasks):
    state = authorize(sid,request)
    return await ingest_fragment(state, body, background_tasks)

@app.post('/session/{sid}/audio')
async def audio(
    sid: str,
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile=File(...),
    chunk_index: int=Form(default=0, ge=0),
    captured_at_ms: int | None=Form(default=None, ge=0),
):
    state = authorize(sid,request)
    if MODE=='demo':
        raise HTTPException(503,'Transcription is disabled in demo mode. Use the demo transcript instead.')
    cached = state.get('audio_chunks', {}).get(str(chunk_index))
    if cached:
        return dict(cached, duplicate=True)
    allowed_types = {'audio/m4a','audio/mp4','audio/x-m4a','audio/webm','application/octet-stream'}
    if file.content_type and file.content_type not in allowed_types:
        raise HTTPException(415,'Unsupported audio type. Send M4A or WebM audio.')
    data = await file.read(settings.max_audio_bytes+1)
    if len(data)>settings.max_audio_bytes:
        raise HTTPException(413,'Audio chunk exceeds 8 MB')
    started = time.perf_counter()
    try:
        from .speech import transcribe
        try:
            with observe(
                'speech.recognize', component='speech', operation='recognize', provider='google',
                **{'audio.format': (file.content_type or 'unknown').split('/')[-1], 'audio.size_bucket': 'small' if len(data) < 1_000_000 else 'large'},
            ):
                text = await transcribe(data)
        except Exception:
            raise HTTPException(502,'Google transcription unavailable. Check audio format, duration, and Speech API access.')
        if not text:
            raise HTTPException(422,'No speech detected. Try a clearer recording.')
        result = await ingest_fragment(state,Fragment(text=text),background_tasks)
        result.update(chunk_index=chunk_index, duplicate=False)
        chunks = state.setdefault('audio_chunks', {})
        chunks[str(chunk_index)] = result
        for old_index in sorted(chunks, key=int)[:-32]:
            chunks.pop(old_index, None)
        write('session:'+sid,state)
        log.info('audio_chunk_transcribed', extra={
            'request_id': getattr(request.state, 'request_id', None),
            'chunk_index': chunk_index,
            'audio_bytes': len(data),
            'transcription_ms': round((time.perf_counter()-started)*1000, 2),
        })
        return result
    except httpx.HTTPError:
        raise HTTPException(502,'Transcription provider unavailable')
    finally:
        data = b''
        await file.close()

@app.post('/session/{sid}/cue')
async def cues(sid: str, request: Request):
    state = authorize(sid,request)
    live = (state['summary']+' '+' '.join(state['fragments']))[-800:]
    if not live.strip():
        raise HTTPException(409,'Add a little conversation first')
    fallback = MODE=='demo'
    if MODE=='demo':
        items = validate_cues(demo_cues(live))
    else:
        try:
            profile = read(profile_key(state['owner_id'])) or {}
            prompt = build_cue_prompt(state, profile)
            result = CueResult.model_validate_json(await generate_text(settings, prompt, CueResult.model_json_schema()))
            items = validate_cues([c.model_dump() for c in result.cues])
        except Exception:
            items = validate_cues(demo_cues(live))
            fallback = True
    state['cues'] = [dict(c,id=str(uuid.uuid4())) for c in items]
    write('session:'+sid,state)
    return {'cues':state['cues'],'signal':state['signal'],'fallback':fallback}

@app.post('/session/{sid}/cue/{cid}/speak')
async def speak(sid: str, cid: str, request: Request):
    state = authorize(sid,request)
    cue = next((c for c in state['cues'] if c['id']==cid),None)
    if not cue:
        raise HTTPException(404,'Cue not found')
    if MODE=='demo':
        raise HTTPException(503,'Demo voice uses device speech synthesis')
    try:
        with observe('tts.generate', component='tts', operation='generate', provider='gemini', model=settings.tts_model):
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post('https://generativelanguage.googleapis.com/v1beta/models/'+settings.tts_model+':generateContent',headers={'x-goog-api-key':GEMINI_KEY},json={'contents':[{'parts':[{'text':'Say gently: '+cue['text']}]}],'generationConfig':{'responseModalities':['AUDIO'],'speechConfig':{'voiceConfig':{'prebuiltVoiceConfig':{'voiceName':'Kore'}}}}})
                r.raise_for_status()
                pcm = base64.b64decode(r.json()['candidates'][0]['content']['parts'][0]['inlineData']['data'])
        out = io.BytesIO()
        with wave.open(out,'wb') as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(24000); wav.writeframes(pcm)
        return Response(out.getvalue(),media_type='audio/wav')
    except Exception:
        raise HTTPException(502,'Voice unavailable; your text cues are still ready')

@app.delete('/session/{sid}/memory')
def forget(sid: str, request: Request):
    state = authorize(sid,request)
    delete(state['contact_key'])
    state['memory']=''; state['remember']=False
    write('session:'+sid,state)
    return {'deleted':True}

@app.post('/session/{sid}/end')
async def end(sid: str, request: Request):
    state = authorize(sid,request)
    final = await finalize_conversation(settings, state['summary']+' '+' '.join(state['fragments']))
    summary = final.summary
    if state['remember']:
        merged = await summarize(state['memory']+' '+summary)
        write(state['contact_key'],{'summary':merged, 'owner_id':state['owner_id']})
    bucket = settings.summary_bucket
    if bucket:
        try:
            from google.cloud import storage
            with observe('storage.summary_write', component='storage', operation='write', provider='cloud_storage'):
                storage.Client().bucket(bucket).blob(f'summaries/{sid}/{int(time.time())}.json').upload_from_string(
                    json.dumps({'summary':summary}), content_type='application/json'
                )
        except Exception:
            log.warning('optional_summary_write_failed')
    state.update(ended=True,fragments=[],summary='',cues=[],memory='')
    write('session:'+sid,state)
    return {'summary':summary,'follow_up':final.follow_up,'saved':state['remember']}
