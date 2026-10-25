# Repository Audit

Audit date: 2026-10-25. Findings marked **Verified** come from source, tests, or configuration in this repository. Items marked **Assumption / needs validation** require a device, cloud account, or deployed environment.

## Current architecture

The repository contains one Expo/React Native application, one FastAPI process, two persistence modes, Google provider adapters, and reference infrastructure. The local path is Expo → REST → FastAPI → SQLite. The configured live path replaces SQLite with Firestore and enables Gemini, Speech-to-Text, and optional Cloud Storage. Cloud Run deployment scripts build the API and exported web client.

Milestone 1 introduced centralized settings and logging under `backend/app/core` plus inference and summary seams under `backend/app/services`. Route orchestration and storage functions remain in `main.py` to avoid destabilizing a working MVP.

## Existing capabilities — verified

- Expo UI for contact context, starting/ending a session, transcript entry, cues, opt-in notes, note deletion, privacy copy, and device speech.
- Completed-chunk native recording code with permission handling and metering-based pause behavior.
- FastAPI health/readiness, session start, transcript, audio, cue, voice, memory deletion, and end routes.
- Random session bearer tokens stored only as SHA-256 hashes; expiry, ended-state checks, isolation, optimistic version checks, and persisted per-session throttling.
- Pydantic length/range validation for session and transcript inputs, plus an 8 MiB configurable audio limit.
- SQLite demo storage and Firestore adapter; Firestore session records include a TTL timestamp.
- Deterministic demo cues and summaries that require no cloud credentials.
- Bounded transcript context, opt-in contact topic notes, and clearing of active fragments on session end.
- Gemini cue/TTS, Google Speech-to-Text V2, and optional Cloud Storage code paths.
- Backend lifecycle/isolation/readiness/rate/privacy tests, frontend type checking and Expo export scripts, and CI.
- Structured request completion/failure logs with correlation IDs and duration.

## Limitations — verified

- The mobile application is a single large component and has no component/unit test suite.
- `main.py` still coordinates routes, authorization, persistence, readiness, TTS, and lifecycle state.
- Session creation is public; the owner value is a client-generated capability rather than an authenticated account.
- Rate limiting is per session and occurs after storage lookup; there is no gateway/IP abuse control for public session creation.
- Audio uses request/response upload, not continuous streaming; a successful request is authorized twice by current route reuse and counts twice against the session limit.
- The hesitation signal is a text heuristic plus client-supplied pause count. It is not the planned four-second audio classifier and is not clinical.
- Summary checkpoints are based on character-window growth, not elapsed two-minute intervals.
- SQLite records have no automatic TTL cleanup. Contact notes have no TTL in either storage mode.
- Provider failures are mapped to generic API errors, but retry/backoff and circuit breaking are absent.
- OpenTelemetry, Sentry, dashboards, alerts, cost telemetry, and end-to-end latency metrics are documented only.
- The legacy AWS infrastructure files do not match the active Google Cloud architecture.
- `npm audit` reports seven transitive findings in the Expo toolchain (six high, one moderate), including `node-forge`, `postcss`, and `image-size`; its suggested Expo downgrade is not a safe automatic remediation and needs an Expo-compatible dependency update review.

## Assumptions / needs validation

- Native recording formats and pause metering work consistently on target Android devices.
- Chirp 3 accepts every Expo-produced media format used by the app.
- Gemini structured output and preview TTS are enabled for the chosen Google project and region.
- Firestore transaction contention, TTL behavior, and Cloud Storage IAM work under a real deployment.
- Cloud Run CORS, cold-start latency, quotas, and cost are acceptable for the hackathon demonstration.
- The Gator Hacks venue’s participant-awareness and recording-consent process is sufficient; legal review is outside this repository.

## Technical debt and coupling

The highest-value split was provider-independent inference and summary logic, now isolated. Storage should be the next extraction once M2 introduces user/profile schemas; doing it now would mostly move code without clarifying requirements. The mobile `App.tsx` should later split API access, recording, session state, and screens, but M1 avoids a high-risk UI rewrite. `speech.py` is a concrete adapter rather than a formal protocol because there is only one current implementation.

## Hardcoded or startup configuration found

Previously, model names, TTS model, audio size, logging level, and future timing values were hardcoded or absent. They now have environment-backed settings. Still intentionally hardcoded are the two-hour session lifetime, 40 requests/minute/session, 800/400-character context bounds, prompt safety text, 24 kHz TTS wrapping, and demo cue content. These are product policy or provider-format constants and should become settings only when operational tuning demonstrates a need.

## Immediate risks

1. Do not expose live mode publicly before real account authentication and edge abuse controls.
2. Do not promise universal participant consent, audio format support, or deployed cloud readiness.
3. Avoid logging request bodies or expanding exception logs with provider payloads; those can contain private context.
4. Treat the mobile owner capability as recoverable local state, not identity.
5. Validate data deletion and provider retention before using real conversations.

## Recommended future improvements

- M2: Firebase token verification, user/profile schemas, durable owner mapping, and authenticated session creation.
- M3: isolate recording/API hooks in the client, remove double authorization on audio, and add format/device fixtures.
- M4: implement local derived-feature interfaces, cooldowns, explicit opt-in, and false-positive evaluation.
- M5: add a real Gemma provider adapter and contract tests instead of reusing a Gemini model-name assumption.
- M7: add OpenTelemetry SDK/exporters only with redaction tests and configured backends; establish retention controls and dashboards.
