# Co-Wingman Architecture

## Status legend

- **Implemented:** present in the repository and covered at least partly by local tests.
- **Simulated:** deterministic demo behavior, explicitly not a production capability.
- **Planned:** an intended boundary or workflow for a later milestone; not claimed to work.

```mermaid
flowchart TB
    A[Android application<br/>Implemented: Expo UI, rolling chunk capture, device voice<br/>Simulated: demo transcript input] -->|HTTPS REST + bearer capability| B[FastAPI backend<br/>Implemented]
    B --> C[Authentication<br/>Implemented: Firebase ID-token verification<br/>Implemented: per-session bearer capability]
    B --> D[Session management<br/>Implemented: lifecycle, expiry, rate count]
    B --> E[Audio processing interface<br/>Implemented M3: ordered bounded chunks<br/>Implemented M4: local derived-feature windows]
    B --> F[Transcription interface<br/>Implemented M3: incremental Google STT chunks<br/>Unverified against deployed credentials]
    B --> G[Assistance detection<br/>Implemented M4: conservative local derived signal]
    B --> H[AI inference interface<br/>Implemented M5: demo, Gemini, and Vertex AI Gemma adapters]
    B --> I[Summarization<br/>Implemented: bounded and timed checkpoints]
    B --> J[Contact/profile storage<br/>Implemented: profiles, public cards, exchanged contacts, opt-in notes]
    B --> K[Observability<br/>JSON logs + privacy-safe OTLP spans/metrics<br/>Export opt-in; dashboard/alert assets]
    D & F & H & I & J & K --> L[Google Cloud services<br/>Adapters and environment-isolated deployment automation]
    L --> L1[Cloud Run]
    L --> L2[Firestore]
    L --> L3[Speech-to-Text]
    L --> L4[Secret Manager]
    L --> L5[Optional Cloud Storage]
```

## Current runtime

With Firebase configured, the Expo client persists its Firebase sign-in, sends an ID token to profile routes and session creation, and receives a separate session capability for conversation operations. The backend verifies the ID token and uses its UID for profile and contact-note ownership. Demo mode replaces this with a persistent local device capability and is explicitly non-production.

For active-session recovery, native clients keep the bounded capability and display state in Expo SecureStore; web uses tab-scoped session storage. A restart revalidates the capability through the status endpoint before restoring state. Recording is never resumed automatically, and leaving the foreground pauses capture and discards the unfinished chunk. Sign-out, completion, erasure, expiry, and invalid capabilities clear recovery data.

In live mode, M3 gates microphone capture on participant-awareness confirmation and permission, then records ordered four-second M4A/WebM files. Uploads are serialized while capture rolls forward; successful transcripts enter the same bounded-context path as typed fragments. Chunk indexes make accepted retries idempotent. Device speech reads cues on Android and web without exposing a session capability in an audio URL.

The FastAPI application hashes session tokens before persistence, enforces a two-hour session expiry and per-session request count, and stores state through SQLite in demo mode or Firestore when configured. Active context consists of a bounded summary plus recent fragments. Cue generation uses deterministic demo rules by default or the provider-specific Vertex AI Gemma adapter in live mode. Gemini remains a distinct compatibility adapter. Invalid or unavailable provider output falls back to deterministic bounded cues.

The backend remains one deployable service. This is intentional for a hackathon: internal module boundaries allow replacement without adding network hops, distributed transactions, or additional operations work.

## Service boundaries

| Boundary | Current implementation | Later evolution |
|---|---|---|
| Client/API | REST from one Expo screen plus isolated rolling-audio hook | Native PCM/WebSocket transport only if device testing justifies it |
| Identity | Firebase Authentication when configured; persistent demo device capability locally; SecureStore-backed native active-session token; full account erasure endpoint | OAuth providers and account-recovery flows |
| Session storage | SQLite or Firestore record adapter in `main.py` | Extract a repository when profile/session schemas evolve |
| Transcription | Ordered near-real-time chunks to Google Speech-to-Text V2 | Physical-device validation; optional native raw stream later |
| Assistance signal | Local bounded metering/transcript-derived score plus manual help | Physical-device calibration and venue evaluation |
| Inference | Deterministic fallback, Gemini compatibility, or Vertex AI Gemma | Live quality, quota, latency, and cost validation |
| Summary | Keyword/provider summary, independent timed checkpoints, final summary and follow-up | Deployed concurrency and quality validation |
| Contact/profile data | UID-isolated professional profile and contact snapshots; separate visibility-controlled public cards; opt-in topic summary | Firestore subcollections if document-size or write-contention measurements require them |
| Telemetry | JSON request events plus allowlisted OpenTelemetry operation spans/counters/latency/failures; dashboard and 5xx alert assets | Deployed collector, notification channels, cost/quota metrics, and validated retention |

## Future real-time pipeline

Audio capture and summarization have different clocks and must not block each other:

```mermaid
flowchart LR
    MIC[Consented microphone stream] --> BUF[Short local ring buffer]
    BUF -->|about every 4 seconds| FEAT[On-device feature extraction]
    FEAT --> SIG[Conservative assistance signal]
    SIG -->|threshold + cooldown or manual help| CUE[Immediate cue request]
    BUF --> STT[Incremental transcription]
    STT --> CTX[Bounded recent context]
    CTX --> CUE
    CTX -->|about every 2 minutes, independently| SUM[Background summary checkpoint]
    SUM --> MEM[Replace older detail with bounded summary]
```

The four-second path should remain local where practical and emit only derived values, not raw audio telemetry. A manual help action bypasses automatic detection. Cue requests use the freshest bounded context immediately; they never wait for the two-minute checkpoint. Checkpoint work runs independently, merges atomically into session context, and must tolerate retries. Thresholds, cooldowns, and window sizes remain configurable and require device validation in later milestones.

## Data lifecycle

Raw uploaded audio is held in memory and cleared after the request. Recent transcript fragments remain in active session storage until they are summarized or the session ends. Session access expires after two hours and live Firestore records receive a one-day TTL; SQLite demo files persist until local deletion. Profiles, cards, contacts, and opt-in notes persist until their specific or account-wide deletion action. The full account route also deletes owned sessions, remembered notes, optional summary objects, public-card pointers, and Firebase identity. Provider-side transient retention remains controlled by provider policy.

## Milestone sequence

M1 established the foundation; M2 added Firebase authentication and profiles; M3 added rolling audio, incremental transcription, and device voice; M4 implemented conservative assistance signals; M5 added Gemma; M6 added digital identity/contact exchange; M7 added local telemetry, privacy controls, operational safeguards, and deployment automation. M8 adds local end-to-end integration coverage, secure session recovery, performance diagnostics, accessibility hardening, and a repeatable demonstration package. Its deployed-service and physical-device acceptance checks remain external release work.
