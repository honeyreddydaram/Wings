# Co-Wingman (Wings)

Co-Wingman is an Android-first conversation assistant that offers short questions and gentle suggestions while keeping the person—not the assistant—at the center. This repository is a working local MVP with Milestones 1–4 implemented for the Gator Hacks project.

The default configuration is an explicit demo: SQLite storage, preset topic-based cues, keyword summaries, and device speech. It needs no cloud account and makes no AI calls. Live integrations exist for Gemini, Google Speech-to-Text, Firestore, and optional Cloud Storage, but require credentials and have not been production-validated. Gemma is an architectural target for Milestone 5, not an implemented provider.

## Architecture at a glance

- `mobile/`: Expo, React Native, and TypeScript client; Android first, with a web development target.
- `backend/app/main.py`: FastAPI routes, session authorization, and current storage coordination.
- `backend/app/core/`: centralized configuration, Firebase/demo authentication, and privacy-safe structured logging.
- `backend/app/services/`: replaceable inference and summary boundaries.
- `mobile/src/audioPipeline.ts`: consented rolling capture, ordered upload queue, and pause/resume lifecycle.
- `mobile/src/difficultyDetector.ts`: local derived-signal scoring and conservative automatic-intervention policy.
- `backend/app/speech.py`: Google Speech-to-Text adapter for short completed audio chunks.
- `infra/gcp/`: reference Cloud Run deployment files; no deployment is implied.

See [Architecture](docs/ARCHITECTURE.md), [API contracts](docs/API.md), [Milestone 2 scope](docs/MILESTONE_2.md), [Milestone 3 scope](docs/MILESTONE_3.md), [Milestone 4 scope](docs/MILESTONE_4.md), [repository audit](docs/REPOSITORY_AUDIT.md), [observability](docs/OBSERVABILITY.md), and [security](docs/SECURITY.md).

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

Configuration is read from exported environment variables at process startup. The application deliberately does not auto-load `.env` files. Use `backend/.env.example` and `mobile/.env.example` as references; never commit populated environment files.

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
EXPO_PUBLIC_API_URL=http://localhost:8000 EXPO_PUBLIC_AUDIO_CHUNK_SECONDS=4 EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run web
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

The Profile screen persists professional context locally in demo mode. On native devices, the demo identity now survives restarts through AsyncStorage.

## Live audio workflow

In live mode, the user must confirm participant awareness before recording. The client shows a persistent recording badge, captures bounded four-second M4A/WebM chunks with `expo-audio`, queues uploads in order, and appends successful Speech-to-Text results incrementally. Pause stops capture; ending a session discards the unfinished chunk and waits for queued uploads before summarizing. Silent chunks are ignored without stopping capture. Cue speech uses on-device synthesis so Android does not need to download authenticated audio.

Automatic gentle suggestions require a separate per-session opt-in. A local detector uses bounded microphone-level samples and derived transcript counts, requires consecutive high windows, and enforces interaction suppression, cooldown, and session limits. It retains no transcript words or raw audio and is explicitly a conversation-assistance heuristic, not an anxiety, emotion, or health measurement. Manual **Get me unstuck** remains available at all times.

This is near-real-time chunked transcription, not a raw PCM WebSocket or direct gRPC stream. That boundary is deliberate: Expo's managed recorder produces files, while Google streaming recognition requires a gRPC audio stream. A future native capture module can replace the client transport without changing session or transcript contracts.

## Firebase authentication

Firebase mode supports email/password account creation, persistent client sign-in, backend ID-token verification, and user-isolated profiles. Enable Email/Password in Firebase Authentication, register a Firebase web app, and export its public client configuration from `mobile/.env.example`. Then start the API with:

```bash
APP_MODE=demo AUTH_MODE=firebase FIREBASE_PROJECT_ID=your-project-id \
  GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json \
  .venv/bin/uvicorn app.main:app --app-dir backend --port 8000
```

Application Default Credentials are preferred on Google Cloud. The Firebase web API key is a client identifier—not a server secret—but it should still be restricted to the required APIs and applications. Never place service-account JSON or Gemini credentials in `EXPO_PUBLIC_*` variables.

## Validate

```bash
APP_MODE=demo .venv/bin/pytest backend -q
npm test --prefix mobile
npm run typecheck --prefix mobile
EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run build --prefix mobile
cd mobile && EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npx expo export --platform android --output-dir /tmp/wings-android-export
```

CI runs the same checks on every push and pull request without cloud credentials.

## Environment configuration

The complete annotated list is in `backend/.env.example`. Key groups are:

- Runtime/storage: `APP_MODE`, `DATABASE_PATH`, `FIRESTORE_COLLECTION`, `SUMMARY_BUCKET`.
- Identity: `AUTH_MODE`, `FIREBASE_PROJECT_ID`, and optional `FIREBASE_CHECK_REVOKED`.
- Browser access: `CORS_ORIGINS` (comma-separated exact origins).
- AI: `INFERENCE_PROVIDER`, `INFERENCE_MODEL`, `TTS_MODEL`, and server-only `GEMINI_API_KEY`.
- Google speech: `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION`, `SPEECH_LANGUAGE`.
- Audio pipeline: backend `AUDIO_WINDOW_SECONDS`/`MAX_AUDIO_BYTES` and client `EXPO_PUBLIC_AUDIO_CHUNK_SECONDS`; keep the chunk duration aligned.
- Pipeline planning: `SUMMARY_CHECKPOINT_SECONDS` remains reserved for timed summaries.
- Telemetry: `LOG_LEVEL`, `LOG_FORMAT`, `OTEL_ENABLED`, `OTEL_SERVICE_NAME`. OpenTelemetry export is not implemented yet.

Use `APP_MODE=live`, a Firestore collection, and `INFERENCE_PROVIDER=gemini` only in a configured server environment. Demo mode never requires Google credentials. `INFERENCE_PROVIDER=gemma` is a reserved future selection and currently fails closed.

## Troubleshooting

- **Module `app` not found:** include `--app-dir backend` or run pytest from the repository root as shown.
- **Expo cannot reach the API:** verify `EXPO_PUBLIC_API_URL`; use your machine’s reachable address on a physical device and configure `CORS_ORIGINS` for web.
- **CORS failure:** list the exact frontend origin, including port, then restart the backend because settings load at startup.
- **Live startup fails:** `APP_MODE=live` requires `FIRESTORE_COLLECTION`; provider calls additionally require credentials and permissions.
- **Profile returns 401:** client and backend auth modes must match. Firebase mode requires a signed-in user and server credentials capable of verifying ID tokens.
- **Audio returns 503 in demo:** expected; use the sample transcript. Live transcription accepts ordered M4A/WebM chunks only, up to the configured byte limit.
- **No live transcript appears:** verify participant-awareness confirmation, microphone permission, HTTPS on non-local web origins, Google Speech credentials, and the Speech-to-Text API.
- **Node version error:** use Node 20.19+ and reinstall with `npm ci`.

## Current limitations and next milestones

Firebase authentication, profiles, and the M3 rolling-audio path are implemented but still need validation against a real Firebase/Google Cloud project and physical Android device. Session capability tokens remain in memory, and there is no raw PCM streaming, clinical anxiety detection, NFC exchange, résumé-file ingestion, production alerting, or deployed dashboard. Operational logs are structured and omit request bodies and credentials, but full tracing/metrics arrives in Milestone 7.

Milestone 4 should add conservative, on-device derived audio features and intervention cooldowns without changing the M3 capture/transcript boundary. The remaining roadmap is described in [Architecture](docs/ARCHITECTURE.md).

For deployment-specific caveats, see [Google Cloud deployment](infra/gcp/README.md).
