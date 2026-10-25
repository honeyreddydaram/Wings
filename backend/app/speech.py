from google.api_core.client_options import ClientOptions
from google.cloud import speech_v2
from google.cloud.speech_v2.types import cloud_speech

from .core.config import load_settings


async def transcribe(data: bytes) -> str:
    current = load_settings()
    if not current.google_cloud_project:
        raise RuntimeError('GOOGLE_CLOUD_PROJECT is required for transcription')
    project = current.google_cloud_project
    location = current.speech_location
    model = getattr(current, 'speech_model', 'long')
    client = speech_v2.SpeechAsyncClient(client_options=ClientOptions(api_endpoint=f'{location}-speech.googleapis.com'))
    try:
        try:
            result = await client.recognize(request=cloud_speech.RecognizeRequest(
                recognizer=f'projects/{project}/locations/{location}/recognizers/_',
                config=cloud_speech.RecognitionConfig(
                    auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
                    language_codes=[current.speech_language],
                    model=model,
                    features=cloud_speech.RecognitionFeatures(
                        enable_automatic_punctuation=True,
                    ),
                ),
                content=data,
            ), timeout=30)
        except Exception:
            if model != 'chirp_3':
                result = await client.recognize(request=cloud_speech.RecognizeRequest(
                    recognizer=f'projects/{project}/locations/{location}/recognizers/_',
                    config=cloud_speech.RecognitionConfig(
                        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
                        language_codes=[current.speech_language],
                        model='chirp_3',
                        features=cloud_speech.RecognitionFeatures(
                            enable_automatic_punctuation=True,
                        ),
                    ),
                    content=data,
                ), timeout=30)
            else:
                raise
        return ' '.join(r.alternatives[0].transcript for r in result.results if r.alternatives).strip()
    finally:
        await client.transport.close()
