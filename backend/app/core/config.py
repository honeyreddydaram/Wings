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
    gemma_model: str
    gemma_location: str
    gemma_endpoint_id: str | None
    gemma_endpoint_dns: str | None
    gemma_base_url: str | None
    inference_timeout_seconds: float
    inference_max_retries: int
    tts_model: str
    summary_bucket: str | None
    speech_location: str
    speech_language: str
    speech_model: str
    audio_window_seconds: float
    summary_checkpoint_seconds: int
    max_audio_bytes: int
    log_level: str
    log_format: str
    otel_enabled: bool
    otel_service_name: str
    otel_exporter_otlp_endpoint: str | None
    otel_sample_ratio: float
    public_base_url: str
    edge_rate_limit_per_minute: int
    provider_budget_per_minute: int
    session_access_ttl_hours: int
    session_storage_ttl_days: int
    summary_object_ttl_days: int


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
        gemma_model=os.getenv("GEMMA_MODEL", "google/gemma-4-12b"),
        gemma_location=os.getenv("GEMMA_LOCATION", "us-central1"),
        gemma_endpoint_id=os.getenv("GEMMA_ENDPOINT_ID"),
        gemma_endpoint_dns=os.getenv("GEMMA_ENDPOINT_DNS"),
        gemma_base_url=os.getenv("GEMMA_BASE_URL"),
        inference_timeout_seconds=float(os.getenv("INFERENCE_TIMEOUT_SECONDS", "20")),
        inference_max_retries=int(os.getenv("INFERENCE_MAX_RETRIES", "2")),
        tts_model=os.getenv("TTS_MODEL", "gemini-2.5-flash-preview-tts"),
        summary_bucket=os.getenv("SUMMARY_BUCKET"),
        speech_location=os.getenv("SPEECH_LOCATION", "us"),
        speech_language=os.getenv("SPEECH_LANGUAGE", "en-US"),
        speech_model=os.getenv("SPEECH_MODEL", "long"),
        audio_window_seconds=float(os.getenv("AUDIO_WINDOW_SECONDS", "4")),
        summary_checkpoint_seconds=int(os.getenv("SUMMARY_CHECKPOINT_SECONDS", "120")),
        max_audio_bytes=int(os.getenv("MAX_AUDIO_BYTES", str(8 * 1024 * 1024))),
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
        log_format=os.getenv("LOG_FORMAT", "json").lower(),
        otel_enabled=_bool("OTEL_ENABLED"),
        otel_service_name=os.getenv("OTEL_SERVICE_NAME", "cowingman-api"),
        otel_exporter_otlp_endpoint=os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
        otel_sample_ratio=float(os.getenv("OTEL_SAMPLE_RATIO", "0.1")),
        public_base_url=os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/"),
        edge_rate_limit_per_minute=int(os.getenv("EDGE_RATE_LIMIT_PER_MINUTE", "180")),
        provider_budget_per_minute=int(os.getenv("PROVIDER_BUDGET_PER_MINUTE", "60")),
        session_access_ttl_hours=int(os.getenv("SESSION_ACCESS_TTL_HOURS", "2")),
        session_storage_ttl_days=int(os.getenv("SESSION_STORAGE_TTL_DAYS", "1")),
        summary_object_ttl_days=int(os.getenv("SUMMARY_OBJECT_TTL_DAYS", "30")),
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
    if settings.inference_provider == "gemma" and not settings.google_cloud_project:
        raise RuntimeError("Gemma requires GOOGLE_CLOUD_PROJECT")
    if not 1 <= settings.inference_timeout_seconds <= 60:
        raise RuntimeError("INFERENCE_TIMEOUT_SECONDS must be between 1 and 60")
    if not 0 <= settings.inference_max_retries <= 3:
        raise RuntimeError("INFERENCE_MAX_RETRIES must be between 0 and 3")
    if settings.otel_enabled and not settings.otel_exporter_otlp_endpoint:
        raise RuntimeError("OTEL_ENABLED requires OTEL_EXPORTER_OTLP_ENDPOINT")
    if not 0 <= settings.otel_sample_ratio <= 1:
        raise RuntimeError("OTEL_SAMPLE_RATIO must be between 0 and 1")
    if settings.edge_rate_limit_per_minute < 1 or settings.provider_budget_per_minute < 1:
        raise RuntimeError("Rate and provider budget limits must be positive")
    if min(settings.session_access_ttl_hours, settings.session_storage_ttl_days, settings.summary_object_ttl_days) < 1:
        raise RuntimeError("Retention periods must be positive")
    return settings


settings = load_settings()
