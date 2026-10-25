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
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .core.auth import resolve_identity
from .core.config import settings
from .core.logging import configure_logging, install_request_logging
from .schemas.profiles import Profile, ProfileUpdate
from .services.context import build_cue_prompt
from .services.inference import check_provider_auth, demo_cues, generate_text, validate_cues
from .services.summaries import finalize as finalize_conversation
from .services.summaries import summarize as summarize_text

MODE = settings.app_mode
DB = settings.database_path
TABLE = settings.firestore_collection
GEMINI_KEY = settings.gemini_api_key
log = configure_logging(settings)
app = FastAPI(title='Co-Wingman', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=['GET','POST','PUT','DELETE'], allow_headers=['Authorization','Content-Type','X-Request-ID','X-Demo-Owner'], expose_headers=['X-Request-ID'])
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
    if TABLE:
        from google.cloud import firestore
        client = firestore.Client()
        ref = client.collection(TABLE).document(key)
        item = {'body': body, 'version': version+1}
        if guarded:
            item['expires_at'] = datetime.now(timezone.utc) + timedelta(days=1)
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
    if TABLE:
        from google.cloud import firestore
        firestore.Client().collection(TABLE).document(key).delete()
    else:
        with database() as con:
            con.execute('DELETE FROM records WHERE id=?', (key,))

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

@app.post('/session/start')
def start(body: Start, request: Request):
    identity = resolve_identity(settings, request, body.owner)
    sid, token = str(uuid.uuid4()), secrets.token_urlsafe(32)
    ck = contact_key(identity.user_id, body.contact or body.name)
    memory = read(ck) if body.remember else None
    state = {'id':sid,'owner_id':identity.user_id,'name':body.name,'context':body.context,'contact_key':ck,'remember':body.remember,'memory':(memory or {}).get('summary',''),'summary':'','fragments':[],'cues':[],'audio_chunks':{},'token_hash':hashlib.sha256(token.encode()).hexdigest(),'expires':time.time()+7200,'signal':'low','checkpoint_seq':0,'next_checkpoint_at':time.time()+settings.summary_checkpoint_seconds}
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
        write(state['contact_key'],{'summary':merged})
    bucket = settings.summary_bucket
    if bucket:
        try:
            from google.cloud import storage
            storage.Client().bucket(bucket).blob(f'summaries/{sid}/{int(time.time())}.json').upload_from_string(json.dumps({'summary':summary}), content_type='application/json')
        except Exception:
            log.warning('optional_summary_write_failed')
    state.update(ended=True,fragments=[],summary='',cues=[],memory='')
    write('session:'+sid,state)
    return {'summary':summary,'follow_up':final.follow_up,'saved':state['remember']}
