import os
import tempfile
os.environ['DATABASE_PATH'] = tempfile.mktemp(suffix='.db')
os.environ['APP_MODE'] = 'demo'
from fastapi.testclient import TestClient
from app.main import app, read

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
