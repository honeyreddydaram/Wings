# Co-Wingman (Wings)

Co-Wingman is an Android-first conversation assistant that offers short questions and gentle suggestions while keeping the person—not the assistant—at the center. This repository is a working local MVP and the Milestone 1 foundation for the Gator Hacks project.

The default configuration is an explicit demo: SQLite storage, preset topic-based cues, keyword summaries, and device speech. It needs no cloud account and makes no AI calls. Live integrations exist for Gemini, Google Speech-to-Text, Firestore, and optional Cloud Storage, but require credentials and have not been production-validated. Gemma is an architectural target for Milestone 5, not an implemented provider.

## Architecture at a glance

- `mobile/`: Expo, React Native, and TypeScript client; Android first, with a web development target.
- `backend/app/main.py`: FastAPI routes, session authorization, and current storage coordination.
- `backend/app/core/`: centralized startup configuration and privacy-safe structured logging.
- `backend/app/services/`: replaceable inference and summary boundaries.
- `backend/app/speech.py`: Google Speech-to-Text adapter for completed audio chunks.
- `infra/gcp/`: reference Cloud Run deployment files; no deployment is implied.

See [Architecture](docs/ARCHITECTURE.md), [API contracts](docs/API.md), [repository audit](docs/REPOSITORY_AUDIT.md), [observability](docs/OBSERVABILITY.md), and [security](docs/SECURITY.md).

## Requirements

- Python 3.12
- Node.js 20.19 or newer in the Node 20 line
- npm
- An Android device/emulator for native verification (optional; web works locally)

## Install

From the repository root:

```bash
python3.12 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci --prefix mobile --cache /tmp/wings-npm-cache
```

Configuration is read from exported environment variables at process startup. The application deliberately does not auto-load `.env` files. Use `backend/.env.example` as a reference and export values through your shell or runtime; never commit a populated `.env`.

## Run the backend

Demo mode is the default:

```bash
APP_MODE=demo .venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Verify it in another terminal:

```bash
curl -i http://localhost:8000/healthz
curl -i http://localhost:8000/readyz
```

## Run the Expo client

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:8000 EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run web
```

For native development, run `npx expo start`. A physical device cannot reach your computer through `localhost`; set `EXPO_PUBLIC_API_URL` to a reachable HTTPS API address. No APK is included or claimed to have been published.

## Demo workflow

1. Enter or keep the sample contact context.
2. Optionally enable **Remember topic notes**.
3. Start a conversation.
4. Use the microphone button to insert the demo transcript, or type a fragment.
5. Select **Get me unstuck** to receive two questions and one suggestion.
6. End the conversation to see a bounded topic summary. Active fragments are cleared; notes persist only when opted in.

Demo mode does not record or transcribe microphone audio, call cloud AI, diagnose anxiety, or simulate the future four-second audio classifier.

## Validate

```bash
APP_MODE=demo .venv/bin/pytest backend -q
npm run typecheck --prefix mobile
EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run build --prefix mobile
```

CI runs the same checks on every push and pull request without cloud credentials.

## Environment configuration

The complete annotated list is in `backend/.env.example`. Key groups are:

- Runtime/storage: `APP_MODE`, `DATABASE_PATH`, `FIRESTORE_COLLECTION`, `SUMMARY_BUCKET`.
- Browser access: `CORS_ORIGINS` (comma-separated exact origins).
- AI: `INFERENCE_PROVIDER`, `INFERENCE_MODEL`, `TTS_MODEL`, and server-only `GEMINI_API_KEY`.
- Google speech: `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION`, `SPEECH_LANGUAGE`.
- Pipeline planning: `AUDIO_WINDOW_SECONDS`, `SUMMARY_CHECKPOINT_SECONDS`, `MAX_AUDIO_BYTES`.
- Telemetry: `LOG_LEVEL`, `LOG_FORMAT`, `OTEL_ENABLED`, `OTEL_SERVICE_NAME`. OpenTelemetry export is not implemented yet.

Use `APP_MODE=live`, a Firestore collection, and `INFERENCE_PROVIDER=gemini` only in a configured server environment. Demo mode never requires Google credentials. `INFERENCE_PROVIDER=gemma` is a reserved future selection and currently fails closed.

## Troubleshooting

- **Module `app` not found:** include `--app-dir backend` or run pytest from the repository root as shown.
- **Expo cannot reach the API:** verify `EXPO_PUBLIC_API_URL`; use your machine’s reachable address on a physical device and configure `CORS_ORIGINS` for web.
- **CORS failure:** list the exact frontend origin, including port, then restart the backend because settings load at startup.
- **Live startup fails:** `APP_MODE=live` requires `FIRESTORE_COLLECTION`; provider calls additionally require credentials and permissions.
- **Audio returns 503 in demo:** expected; use the sample transcript. Live transcription accepts completed chunks only, up to the configured byte limit.
- **Node version error:** use Node 20.19+ and reinstall with `npm ci`.

## Current limitations and next milestones

Session tokens are local capabilities, not user accounts. Native identity is not durable, live providers need device/cloud validation, and there is no continuous streaming, clinical anxiety detection, NFC exchange, résumé ingestion, production alerting, or deployed dashboard. Operational logs are structured and omit request bodies and credentials, but full tracing/metrics arrives in Milestone 7.

Milestone 2 should begin with Firebase Authentication and persistent user-profile contracts while retaining the inference, summary, storage, and telemetry seams established here. The remaining roadmap is described in [Architecture](docs/ARCHITECTURE.md).

For deployment-specific caveats, see [Google Cloud deployment](infra/gcp/README.md).
