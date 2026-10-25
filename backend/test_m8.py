import asyncio
import os
import tempfile
import time

os.environ.setdefault('DATABASE_PATH', tempfile.mktemp(suffix='.db'))
os.environ.setdefault('APP_MODE', 'demo')

import httpx
from fastapi.testclient import TestClient

import app.main as main_module
from app.core.limits import edge_limiter


client = TestClient(main_module.app)


def test_complete_demo_journey_recovery_contact_and_erasure():
    owner = 'm8-e2e-owner-123456789012'
    identity = {'X-Demo-Owner': owner}
    assert client.put('/profile/me', headers=identity, json={
        'display_name': 'Demo Builder', 'headline': 'Student engineer',
        'skills': ['Python', 'Accessibility'], 'networking_goals': 'Meet product teams',
    }).status_code == 200

    started = client.post('/session/start', headers=identity, json={
        'name': 'Recruiter', 'context': 'Career fair', 'remember': True,
    })
    assert started.status_code == 200
    session = started.json()
    capability = {'Authorization': 'Bearer '+session['token']}
    status = client.get(f"/session/{session['id']}/status", headers=capability)
    assert status.status_code == 200 and status.json()['active'] is True

    assert client.post(f"/session/{session['id']}/transcript", headers=capability, json={
        'text': 'We discussed accessible products and user research.'
    }).status_code == 200
    cue = client.post(f"/session/{session['id']}/cue", headers=capability)
    assert cue.status_code == 200 and len(cue.json()['cues']) >= 2
    ended = client.post(f"/session/{session['id']}/end", headers=capability)
    assert ended.status_code == 200 and ended.json()['saved'] is True
    assert client.get(f"/session/{session['id']}/status", headers=capability).status_code == 410

    card = client.put('/card/me', headers=identity, json={
        'display_name': 'Demo Builder', 'headline': 'Student engineer', 'published': True,
    }).json()
    public_path = card['public_url'].removeprefix(main_module.settings.public_base_url)
    shared = client.get(public_path+'/data').json()
    contact = client.post('/contacts', headers=identity, json={
        'source': 'qr', 'snapshot': shared, 'user_notes': 'Met during the demo',
    })
    assert contact.status_code == 201
    assert client.get('/privacy/me', headers=identity).json()['remembered_conversations'] == 1
    assert client.delete('/account/me', headers=identity).status_code == 200
    assert client.get(public_path).status_code == 404


def test_session_status_rejects_wrong_capability():
    started = client.post('/session/start', json={
        'name': 'Guest', 'owner': 'm8-recovery-owner-123456789',
    }).json()
    assert client.get(f"/session/{started['id']}/status", headers={
        'Authorization': 'Bearer wrong-token'
    }).status_code == 401


def test_long_demo_session_stays_bounded_and_expires_cleanly():
    started = client.post('/session/start', json={
        'name': 'Guest', 'owner': 'm8-long-owner-1234567890123',
    }).json()
    headers = {'Authorization': 'Bearer '+started['token']}
    for index in range(30):
        response = client.post(f"/session/{started['id']}/transcript", headers=headers, json={
            'text': f'Conversation fragment {index} about product research and accessibility.'
        })
        assert response.status_code == 200
    state = main_module.read('session:'+started['id'])
    assert len(' '.join(state['fragments'])) <= 800
    assert len(state['summary']) <= 600
    state['expires'] = 0
    main_module.write('session:'+started['id'], state)
    assert client.get(f"/session/{started['id']}/status", headers=headers).status_code == 410


def test_twenty_concurrent_demo_sessions_complete_within_local_budget():
    async def scenario(index: int):
        transport = httpx.ASGITransport(app=main_module.app)
        async with httpx.AsyncClient(transport=transport, base_url='http://m8.test') as api:
            owner = f'm8-load-owner-{index:02d}-123456789012'
            started = (await api.post('/session/start', json={'name':'Guest','owner':owner})).json()
            headers = {'Authorization':'Bearer '+started['token']}
            transcript = await api.post(
                f"/session/{started['id']}/transcript", headers=headers,
                json={'text':'A deterministic local load-test conversation.'},
            )
            cue = await api.post(f"/session/{started['id']}/cue", headers=headers)
            ended = await api.post(f"/session/{started['id']}/end", headers=headers)
            return transcript.status_code, cue.status_code, ended.status_code

    async def run_scenarios():
        return await asyncio.gather(*(scenario(index) for index in range(20)))

    edge_limiter.reset()
    started_at = time.perf_counter()
    results = asyncio.run(run_scenarios())
    elapsed = time.perf_counter() - started_at
    assert all(result == (200, 200, 200) for result in results)
    assert elapsed < 10
