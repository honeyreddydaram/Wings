import os
import tempfile
from dataclasses import replace
from unittest.mock import AsyncMock
os.environ['DATABASE_PATH'] = tempfile.mktemp(suffix='.db')
os.environ['APP_MODE'] = 'demo'
from fastapi.testclient import TestClient
from app.core.auth import Identity
import app.core.auth as auth_core
import app.main as main_module
from app.main import app, log, read

client = TestClient(app)
def start(remember=False):
    r=client.post('/session/start',json={'name':'Alex','owner':'test-owner-with-strong-capability-123456','remember':remember})
    assert r.status_code==200
    s=r.json()
    return s,{'Authorization':'Bearer '+s['token']}

def test_full_conversation_and_cleanup():
    s,h=start(True); path='/session/'+s['id']
    assert client.post(path+'/cue').status_code==401
    assert client.post(path+'/cue',headers=h).status_code==409
    r=client.post(path+'/transcript',headers=h,json={'text':'Our product design team learned surprising things in user research.'})
    assert r.status_code==200
    r=client.post(path+'/cue',headers=h)
    assert r.status_code==200
    assert [c['category'] for c in r.json()['cues']]==['question','question','suggestion']
    assert 'users' in r.json()['cues'][0]['text']
    end=client.post(path+'/end',headers=h)
    assert end.status_code==200 and end.json()['saved']
    state=read('session:'+s['id'])
    assert state['fragments']==[] and state['summary']==''
    assert client.post(path+'/cue',headers=h).status_code==410
    s2,h2=start(True)
    assert s2['memory']
    assert client.delete('/session/'+s2['id']+'/memory',headers=h2).json()['deleted']
    assert start(True)[0]['memory']==''

def test_window_signal_and_isolation():
    s,h=start(); other,_=start(); path='/session/'+s['id']
    assert client.post('/session/'+other['id']+'/cue',headers=h).status_code==401
    r=client.post(path+'/transcript',headers=h,json={'text':'um maybe actually sorry uh maybe '+('research feedback '*90),'pause_count':3})
    assert r.status_code==200
    assert r.json()['window_chars']<=800
    assert r.json()['signal']=='high'
    assert len(read('session:'+s['id'])['summary'])<=600

def test_readiness_and_rate_limit():
    assert client.get('/readyz').json()['ready']
    s,h=start(); path='/session/'+s['id']+'/cue'
    for _ in range(40):
        assert client.post(path,headers=h).status_code==409
    assert client.post(path,headers=h).status_code==429

def test_request_ids_and_privacy_safe_logging(monkeypatch):
    events = []
    monkeypatch.setattr(log, 'info', lambda event, **kwargs: events.append((event, kwargs)))
    secret_text = 'PRIVATE_TRANSCRIPT_SENTINEL'
    response = client.post('/session/start', headers={'X-Request-ID':'test-request-123'}, json={
        'name':'PRIVATE_NAME_SENTINEL',
        'context':secret_text,
        'owner':'test-owner-with-strong-capability-123456',
    })
    assert response.status_code == 200
    assert response.headers['X-Request-ID'] == 'test-request-123'
    serialized = repr(events)
    assert secret_text not in serialized
    assert 'PRIVATE_NAME_SENTINEL' not in serialized
    assert response.json()['token'] not in serialized
    assert events[-1][0] == 'request_completed'
    unknown = client.get('/PRIVATE_PATH_SENTINEL')
    assert unknown.status_code == 404
    assert 'PRIVATE_PATH_SENTINEL' not in repr(events)

def test_input_validation_limits():
    response = client.post('/session/start', json={
        'name':'x' * 101,
        'owner':'test-owner-with-strong-capability-123456',
    })
    assert response.status_code == 422

def test_demo_profile_crud_and_isolation():
    alice = {'X-Demo-Owner':'demo-owner-alice-1234567890'}
    bob = {'X-Demo-Owner':'demo-owner-bob-123456789012'}
    profile = {
        'display_name':'Alice Example',
        'headline':'Product designer',
        'organization':'Gator University',
        'skills':['Research','Prototyping'],
        'interests':['Accessible technology'],
        'networking_goals':'Meet thoughtful builders.',
        'accomplishments':'Led a student design project.',
        'portfolio_url':'https://example.com',
        'resume_summary':'Design and research experience.',
    }
    saved = client.put('/profile/me', headers=alice, json=profile)
    assert saved.status_code == 200
    assert saved.json()['display_name'] == 'Alice Example'
    assert saved.json()['updated_at']
    assert client.get('/profile/me', headers=alice).json()['skills'] == ['Research','Prototyping']
    assert client.get('/profile/me', headers=bob).json()['display_name'] == ''
    assert client.get('/profile/me').status_code == 401
    assert client.delete('/profile/me', headers=alice).json() == {'deleted':True}
    assert client.get('/profile/me', headers=alice).json()['display_name'] == ''

def test_firebase_mode_uses_verified_uid(monkeypatch):
    firebase_settings = replace(main_module.settings, auth_mode='firebase', firebase_project_id='test-project')
    monkeypatch.setattr(main_module, 'settings', firebase_settings)
    monkeypatch.setattr(
        auth_core,
        'verify_firebase_token',
        lambda settings, token: Identity('firebase-user-'+token, token+'@example.com', 'firebase'),
    )
    headers = {'Authorization':'Bearer alice'}
    assert client.get('/profile/me').status_code == 401
    saved = client.put('/profile/me', headers=headers, json={'display_name':'Firebase Alice'})
    assert saved.status_code == 200
    assert saved.json()['email'] == 'alice@example.com'
    started = client.post('/session/start', headers=headers, json={'name':'Taylor'})
    assert started.status_code == 200
    state = read('session:'+started.json()['id'])
    assert state['owner_id'] == 'firebase-user-alice'

def test_ordered_audio_chunks_are_idempotent(monkeypatch):
    import app.speech as speech_module

    monkeypatch.setattr(main_module, 'MODE', 'live')
    transcribe = AsyncMock(return_value='A short incremental transcript.')
    monkeypatch.setattr(speech_module, 'transcribe', transcribe)
    session, headers = start()
    path = f"/session/{session['id']}/audio"
    payload = {'chunk_index':'7', 'captured_at_ms':'123456'}
    files = {'file':('chunk.m4a', b'encoded-audio', 'audio/m4a')}

    first = client.post(path, headers=headers, data=payload, files=files)
    assert first.status_code == 200
    assert first.json()['chunk_index'] == 7
    assert first.json()['duplicate'] is False
    assert first.json()['text'] == 'A short incremental transcript.'

    duplicate = client.post(path, headers=headers, data=payload, files=files)
    assert duplicate.status_code == 200
    assert duplicate.json()['duplicate'] is True
    transcribe.assert_awaited_once()
    assert read('session:'+session['id'])['fragments'] == ['A short incremental transcript.']

    unsupported = client.post(
        path,
        headers=headers,
        data={'chunk_index':'8'},
        files={'file':('chunk.txt', b'not-audio', 'text/plain')},
    )
    assert unsupported.status_code == 415
