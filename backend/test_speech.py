import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.speech import transcribe


def test_google_request_and_client_cleanup(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLOUD_PROJECT', 'test-project')
    monkeypatch.setenv('SPEECH_LOCATION', 'us')
    result = SimpleNamespace(results=[SimpleNamespace(alternatives=[SimpleNamespace(transcript='Hello there')])])
    client = SimpleNamespace(recognize=AsyncMock(return_value=result), transport=SimpleNamespace(close=AsyncMock()))
    with patch('app.speech.speech_v2.SpeechAsyncClient', return_value=client):
        assert asyncio.run(transcribe(b'audio')) == 'Hello there'
    request = client.recognize.call_args.kwargs['request']
    assert request.recognizer == 'projects/test-project/locations/us/recognizers/_'
    assert request.config.model == 'chirp_3'
    assert request.content == b'audio'
    client.transport.close.assert_awaited_once()
