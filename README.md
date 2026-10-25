# Co-Wingman (Wings)

Co-Wingman is an Android-first conversation assistant that offers short questions and gentle suggestions while keeping the person—not the assistant—at the center. This repository is a working local MVP with Milestones 1–8 implemented and validated without cloud credentials.

The default configuration is an explicit demo: SQLite storage, preset topic-based cues, keyword summaries, and device speech. It needs no cloud account and makes no AI calls. Live integrations exist for Vertex AI Gemma, Gemini compatibility, Google Speech-to-Text, Firestore, and optional Cloud Storage, but require credentials and have not been production-validated.

## Architecture at a glance

- `mobile/`: Expo, React Native, and TypeScript client; Android first, with a web development target.
- `backend/app/main.py`: FastAPI routes, session authorization, and current storage coordination.
- `backend/app/core/`: centralized configuration, Firebase/demo authentication, and privacy-safe structured logging.
- `backend/app/services/`: replaceable inference and summary boundaries.
- `backend/app/services/context.py`: priority-ordered, hard-capped prompt context.
- `mobile/src/audioPipeline.ts`: consented rolling capture, ordered upload queue, and pause/resume lifecycle.
- `mobile/src/difficultyDetector.ts`: local derived-signal scoring and conservative automatic-intervention policy.
- `mobile/src/sessionStore.native.ts`: device-secure active-session recovery without automatic microphone restart.
- `mobile/src/performanceTracker.ts`: bounded in-memory latency and failure measurements.
- `backend/app/speech.py`: Google Speech-to-Text adapter for short completed audio chunks.
- `infra/gcp/`: reference Cloud Run deployment files; no deployment is implied.

See [Architecture](docs/ARCHITECTURE.md), [API contracts](docs/API.md), [Milestone 8 scope](docs/MILESTONE_8.md), [demo script](docs/DEMO.md), [test matrix](docs/TEST_MATRIX.md), [release checklist](docs/RELEASE_CHECKLIST.md), [performance targets](docs/PERFORMANCE.md), [repository audit](docs/REPOSITORY_AUDIT.md), [observability](docs/OBSERVABILITY.md), [privacy retention](docs/PRIVACY_RETENTION.md), and [security](docs/SECURITY.md). Earlier milestone detail remains under `docs/MILESTONE_2.md` through `docs/MILESTONE_7.md`.

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

[View the Milestone 8 credential-free demo screenshot](docs/images/wings-m8-demo.png).

1. Enter or keep the sample contact context.
2. Optionally enable **Remember topic notes**.
3. Start a conversation.
4. Use the microphone button to insert the demo transcript, or type a fragment.
5. Select **Get me unstuck** to receive two questions and one suggestion.
6. End the conversation to see a bounded topic summary. Active fragments are cleared; notes persist only when opted in.

Demo mode does not record or transcribe microphone audio, call cloud AI, diagnose anxiety, or exercise the live microphone-meter detector.

The Profile screen persists professional context locally in demo mode. On native devices, the demo identity now survives restarts through AsyncStorage.

An active conversation can also recover after an app restart. Native builds store only the bounded session capability and display state in Expo SecureStore; the browser uses tab-scoped session storage. The backend revalidates it before restoration, and microphone capture always returns paused. Backgrounding or locking the app also pauses capture and discards the unfinished chunk.

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
- Public identity: `PUBLIC_BASE_URL` must be the externally reachable API origin used in card links and QR codes.
- Identity: `AUTH_MODE`, `FIREBASE_PROJECT_ID`, and optional `FIREBASE_CHECK_REVOKED`.
- Browser access: `CORS_ORIGINS` (comma-separated exact origins).
- AI: `INFERENCE_PROVIDER`, `GEMMA_MODEL`, `GEMMA_LOCATION`, optional `GEMMA_BASE_URL`, retry/timeout settings, and Gemini compatibility settings.
- Google speech: `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION`, `SPEECH_LANGUAGE`.
- Audio pipeline: backend `AUDIO_WINDOW_SECONDS`/`MAX_AUDIO_BYTES` and client `EXPO_PUBLIC_AUDIO_CHUNK_SECONDS`; keep the chunk duration aligned.
- Summary pipeline: `SUMMARY_CHECKPOINT_SECONDS` controls independent checkpoint scheduling.
- Telemetry: `LOG_LEVEL`, `LOG_FORMAT`, `OTEL_ENABLED`, `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, and `OTEL_SAMPLE_RATIO`.
- Safeguards/retention: `EDGE_RATE_LIMIT_PER_MINUTE`, `PROVIDER_BUDGET_PER_MINUTE`, `SESSION_ACCESS_TTL_HOURS`, `SESSION_STORAGE_TTL_DAYS`, and `SUMMARY_OBJECT_TTL_DAYS`.

Use `APP_MODE=live`, a Firestore collection, and `INFERENCE_PROVIDER=gemma` only in a configured server environment with Vertex AI access. Demo mode never requires Google credentials. Gemini remains a separate compatibility adapter.

## Troubleshooting

- **Module `app` not found:** include `--app-dir backend` or run pytest from the repository root as shown.
- **Expo cannot reach the API:** verify `EXPO_PUBLIC_API_URL`; use your machine’s reachable address on a physical device and configure `CORS_ORIGINS` for web.
- **CORS failure:** list the exact frontend origin, including port, then restart the backend because settings load at startup.
- **Live startup fails:** `APP_MODE=live` requires `FIRESTORE_COLLECTION`; provider calls additionally require credentials and permissions.
- **Profile returns 401:** client and backend auth modes must match. Firebase mode requires a signed-in user and server credentials capable of verifying ID tokens.
- **Audio returns 503 in demo:** expected; use the sample transcript. Live transcription accepts ordered M4A/WebM chunks only, up to the configured byte limit.
- **No live transcript appears:** verify participant-awareness confirmation, microphone permission, HTTPS on non-local web origins, Google Speech credentials, and the Speech-to-Text API.
- **Node version error:** use Node 20.19+ and reinstall with `npm ci`.

## Current limitations and release work

Firebase authentication, profiles, rolling audio, local assistance detection, Gemma integration, controlled card/contact exchange, privacy-safe OpenTelemetry, account erasure, recovery, and deployment operations are implemented locally but still need validation against real Firebase/Google Cloud projects and physical Android devices. Native active-session capabilities use SecureStore; browser recovery is intentionally tab-scoped. There is no raw PCM streaming, clinical anxiety detection, universal phone-to-phone NFC exchange, résumé-file ingestion, deployed alert delivery, or verified dashboard.

Milestone 8 is complete locally. Release readiness still requires the unchecked physical-device, deployed-cloud, signed-build, quota/cost, and privacy/legal rows in the [test matrix](docs/TEST_MATRIX.md) and [milestone ledger](milestones.md).

For deployment-specific caveats, see [Google Cloud deployment](infra/gcp/README.md).
