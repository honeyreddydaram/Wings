"""Environment-backed application settings.

Settings are loaded once when the API process starts. The project intentionally does
not auto-load a .env file; local and deployed runtimes must export variables.
"""

from dataclasses import dataclass
import os


def _csv(name: str, default: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(name, default).split(",") if value.strip())


def _bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_mode: str
    database_path: str
    cors_origins: tuple[str, ...]
    google_cloud_project: str | None
    firestore_collection: str | None
    auth_mode: str
    firebase_project_id: str | None
    firebase_check_revoked: bool
    inference_provider: str
    gemini_api_key: str | None
    inference_model: str
    tts_model: str
    summary_bucket: str | None
    speech_location: str
    speech_language: str
    audio_window_seconds: float
    summary_checkpoint_seconds: int
    max_audio_bytes: int
    log_level: str
    log_format: str
    otel_enabled: bool
    otel_service_name: str


def load_settings() -> Settings:
    mode = os.getenv("APP_MODE", "demo").strip().lower()
    provider = os.getenv("INFERENCE_PROVIDER", "demo" if mode == "demo" else "gemini").strip().lower()
    settings = Settings(
        app_mode=mode,
        database_path=os.getenv("DATABASE_PATH", "/tmp/cowingman.db"),
        cors_origins=_csv("CORS_ORIGINS", "http://localhost:8081,http://localhost:19006"),
        google_cloud_project=os.getenv("GOOGLE_CLOUD_PROJECT"),
        firestore_collection=os.getenv("FIRESTORE_COLLECTION"),
        auth_mode=os.getenv("AUTH_MODE", "demo").strip().lower(),
        firebase_project_id=os.getenv("FIREBASE_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT")),
        firebase_check_revoked=_bool("FIREBASE_CHECK_REVOKED"),
        inference_provider=provider,
        gemini_api_key=os.getenv("GEMINI_API_KEY"),
        inference_model=os.getenv("INFERENCE_MODEL", os.getenv("GEMINI_MODEL", "gemini-2.5-flash")),
        tts_model=os.getenv("TTS_MODEL", "gemini-2.5-flash-preview-tts"),
        summary_bucket=os.getenv("SUMMARY_BUCKET"),
        speech_location=os.getenv("SPEECH_LOCATION", "us"),
        speech_language=os.getenv("SPEECH_LANGUAGE", "en-US"),
        audio_window_seconds=float(os.getenv("AUDIO_WINDOW_SECONDS", "4")),
        summary_checkpoint_seconds=int(os.getenv("SUMMARY_CHECKPOINT_SECONDS", "120")),
        max_audio_bytes=int(os.getenv("MAX_AUDIO_BYTES", str(8 * 1024 * 1024))),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        log_format=os.getenv("LOG_FORMAT", "json").lower(),
        otel_enabled=_bool("OTEL_ENABLED"),
        otel_service_name=os.getenv("OTEL_SERVICE_NAME", "cowingman-api"),
    )
    if settings.app_mode not in {"demo", "live"}:
        raise RuntimeError("APP_MODE must be 'demo' or 'live'")
    if settings.app_mode == "live" and not settings.firestore_collection:
        raise RuntimeError("Live mode requires FIRESTORE_COLLECTION")
    if settings.auth_mode not in {"demo", "firebase"}:
        raise RuntimeError("AUTH_MODE must be 'demo' or 'firebase'")
    if settings.auth_mode == "firebase" and not settings.firebase_project_id:
        raise RuntimeError("Firebase auth mode requires FIREBASE_PROJECT_ID or GOOGLE_CLOUD_PROJECT")
    if settings.inference_provider not in {"demo", "gemini", "gemma"}:
        raise RuntimeError("INFERENCE_PROVIDER must be demo, gemini, or gemma")
    return settings


settings = load_settings()
