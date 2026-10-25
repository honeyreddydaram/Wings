import os
import tempfile

os.environ.setdefault('DATABASE_PATH', tempfile.mktemp(suffix='.db'))
os.environ.setdefault('APP_MODE', 'demo')

import pytest
from fastapi.testclient import TestClient

from app.core.limits import FixedWindowLimiter
from app.core.observability import safe_attributes
import app.main as main_module


client = TestClient(main_module.app)


def test_telemetry_attributes_fail_closed_for_private_data():
    assert safe_attributes({'component': 'storage', 'operation': 'read', 'outcome': 'success'})
    for private_key in ('transcript', 'audio', 'credential', 'profile', 'contact', 'prompt', 'user_id'):
        with pytest.raises(ValueError, match='Unsafe telemetry attribute'):
            safe_attributes({private_key: 'PRIVATE_SENTINEL'})
    with pytest.raises(ValueError, match='Unsafe telemetry value'):
        safe_attributes({'provider': 'PRIVATE TRANSCRIPT SENTINEL'})


def test_fixed_window_limit_is_bounded_and_resets():
    limiter = FixedWindowLimiter()
    assert limiter.allow('client', 2, now=60)
    assert limiter.allow('client', 2, now=61)
    assert not limiter.allow('client', 2, now=62)
    assert limiter.allow('client', 2, now=120)
    limiter.reset()
    assert limiter.allow('client', 1, now=120)


def test_privacy_inventory_and_complete_demo_account_deletion():
    owner = 'm7-delete-owner-1234567890'
    identity_headers = {'X-Demo-Owner': owner}
    client.put('/profile/me', headers=identity_headers, json={'display_name': 'Delete Me'})
    card = client.put('/card/me', headers=identity_headers, json={
        'display_name': 'Delete Me', 'published': True,
    }).json()
    client.post('/contacts', headers=identity_headers, json={
        'source': 'manual',
        'snapshot': {'display_name': 'Contact', 'public_url': 'https://example.test/c/token'},
        'user_notes': 'private note',
    })
    started = client.post('/session/start', headers=identity_headers, json={
        'name': 'Contact', 'remember': True,
    }).json()
    session_headers = {'Authorization': 'Bearer '+started['token']}
    client.post(f"/session/{started['id']}/transcript", headers=session_headers, json={'text': 'Remember this project.'})
    client.post(f"/session/{started['id']}/end", headers=session_headers)

    inventory = client.get('/privacy/me', headers=identity_headers)
    assert inventory.status_code == 200
    assert inventory.json()['profile'] is True
    assert inventory.json()['contacts'] == 1
    assert inventory.json()['sessions'] == 1
    assert inventory.json()['remembered_conversations'] == 1

    deleted = client.delete('/account/me', headers=identity_headers)
    assert deleted.status_code == 200
    assert deleted.json()['deleted'] is True
    assert deleted.json()['identity_deleted'] is True
    assert client.get(card['public_url'].removeprefix(main_module.settings.public_base_url)).status_code == 404
    assert all(value.get('owner_id') != owner for _, value in main_module.scan_records())
    assert main_module.read(main_module.profile_key(owner)) is None
