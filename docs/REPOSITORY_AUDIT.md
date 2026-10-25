# Repository Audit

Audit date: 2026-10-25. Findings marked **Verified** come from source, tests, or configuration in this repository. Items marked **Assumption / needs validation** require a device, cloud account, or deployed environment.

## Current architecture

The repository contains one Expo/React Native application, one FastAPI process, two persistence modes, Google provider adapters, and reference infrastructure. The local path is Expo → REST → FastAPI → SQLite. The configured live path replaces SQLite with Firestore and enables Gemini, Speech-to-Text, and optional Cloud Storage. Cloud Run deployment scripts build the API and exported web client.

Milestone 1 introduced centralized settings and logging under `backend/app/core` plus inference and summary seams under `backend/app/services`. Milestone 2 added Firebase/demo authentication, persistent profiles, and durable local mobile identity. Milestone 3 added an isolated rolling-audio hook, incremental ordered ingestion, and device voice output. Route orchestration and storage functions remain in `main.py` to avoid destabilizing a working MVP.

## Existing capabilities — verified

- Expo UI for contact context, starting/ending a session, transcript entry, cues, opt-in notes, note deletion, privacy copy, and device speech.
- Four-second rolling native/web recording with permission handling, explicit participant-awareness gating, visible capture state, pause/resume, and an ordered upload queue.
- FastAPI health/readiness, session start, transcript, audio, cue, voice, memory deletion, and end routes.
- Random session bearer tokens stored only as SHA-256 hashes; expiry, ended-state checks, isolation, optimistic version checks, and persisted per-session throttling.
- Pydantic length/range validation for session and transcript inputs, plus an 8 MiB configurable audio limit.
- SQLite demo storage and Firestore adapter; Firestore session records include a TTL timestamp.
- Deterministic demo cues and summaries that require no cloud credentials.
- Bounded transcript context, opt-in contact topic notes, and clearing of active fragments on session end.
- Gemini cue/TTS, Google Speech-to-Text V2, and optional Cloud Storage code paths.
- Backend lifecycle/isolation/readiness/rate/privacy tests, frontend type checking and Expo export scripts, and CI.
- Structured request completion/failure logs with correlation IDs and duration.
- Firebase ID-token verification, UID-bound session creation, profile CRUD/isolation tests, and email/password client flows.
- Persistent professional profiles for organization, skills, interests, goals, accomplishments, portfolio URL, and résumé summary.
- Idempotent audio chunk indexes, accepted media-type validation, bounded recent chunk results, and privacy-safe transcription latency events.

## Limitations — verified

- The mobile application remains a large component despite extracting authentication, and has no component/unit test suite.
- `main.py` still coordinates routes, authorization, persistence, readiness, TTS, and lifecycle state.
- Session creation is authenticated in Firebase mode; demo mode remains public and capability-based by design.
- Rate limiting is per session and occurs after storage lookup; there is no gateway/IP abuse control for public session creation.
- Audio uses near-real-time completed-chunk uploads rather than raw PCM/gRPC streaming; this introduces a small boundary gap and has not been measured on physical devices.
- The hesitation signal is a text heuristic plus client-supplied pause count. It is not the planned four-second audio classifier and is not clinical.
- Summary checkpoints are based on character-window growth, not elapsed two-minute intervals.
- SQLite records have no automatic TTL cleanup. Contact notes have no TTL in either storage mode.
- Provider failures are mapped to generic API errors; audio has one bounded retry, but exponential backoff and server circuit breaking remain absent.
- OpenTelemetry operation spans/metrics, privacy allowlists, a Cloud Run dashboard, and a base 5xx alert are implemented locally; collector connectivity, notification delivery, cost/quota metrics, and end-to-end mobile latency remain deployment work. Sentry is intentionally deferred.
- The legacy AWS infrastructure files do not match the active Google Cloud architecture.
- `npm audit` reports eleven dependency findings (ten high, one moderate) across the Expo toolchain and Firebase’s bundled Firestore dependency. The app imports Firebase Auth only, but the advisories remain in the installed tree; suggested major downgrades are not safe automatic remediations.

## Assumptions / needs validation

- Native rolling recording, file rollover, pause/resume, and M4A format work consistently on target Android devices.
- Chirp 3 accepts every Expo-produced media format used by the app.
- Gemini structured output and preview TTS are enabled for the chosen Google project and region.
- Firestore transaction contention, TTL behavior, and Cloud Storage IAM work under a real deployment.
- Cloud Run CORS, cold-start latency, quotas, and cost are acceptable for the hackathon demonstration.
- The Gator Hacks venue’s participant-awareness and recording-consent process is sufficient; legal review is outside this repository.

## Technical debt and coupling

The highest-value splits are provider-independent inference, summaries, and authentication. Profile schemas now clarify the next storage extraction, but persistence remains in `main.py` to avoid a broad migration during authentication work. The mobile `App.tsx` should next split API access, recording, session state, and screens. `speech.py` is a concrete adapter rather than a formal protocol because there is only one current implementation.

## Hardcoded or startup configuration found

Model names, TTS model, audio size, logging, telemetry, retention periods, process rate limits, and provider budgets now have environment-backed settings. Still intentionally hardcoded are the 40 requests/minute/session limit, 800/400-character context bounds, prompt safety text, 24 kHz TTS wrapping, and demo cue content. These are product policy or provider-format constants and should become settings only when operational tuning demonstrates a need.

## Immediate risks

1. Do not expose demo auth publicly; Firebase mode still needs deployed validation and edge abuse controls.
2. Do not promise universal participant consent, audio format support, or deployed cloud readiness.
3. Avoid logging request bodies or expanding exception logs with provider payloads; those can contain private context.
4. Treat the mobile owner capability as recoverable local state, not identity.
5. Validate data deletion and provider retention before using real conversations.

## Recommended future improvements

- M2 follow-up: validate Firebase sign-in and account erasure on Android; implement password recovery.
- M3 follow-up: add physical-device audio fixtures, upload retry/backoff, and latency measurements against a deployed Speech endpoint.
- M4: implement local derived-feature interfaces, cooldowns, explicit opt-in, and false-positive evaluation.
- M5: add a real Gemma provider adapter and contract tests instead of reusing a Gemini model-name assumption.
- M7 follow-up: deploy the OTLP collector/export path, notification channels, distributed edge control, budget alerts, and rehearse backup/restore and erasure.
