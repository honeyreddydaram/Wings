# Milestone 3 — Real-Time Audio Pipeline

## Implemented scope

- Migrated recording from deprecated `expo-av` to the Expo SDK 54 `expo-audio` module.
- Added an isolated `useRollingAudioPipeline` hook with four-second bounded capture, ordered uploads, pause/resume, queue flushing, and recorder error handling.
- Added participant-awareness confirmation, a persistent recording badge, permission-denial fallback, and always-available typed transcript input.
- Added incremental transcript display while capture continues.
- Added one bounded client retry plus indexed, idempotent audio ingestion so a repeated accepted chunk is not retranscribed or appended twice.
- Added M4A/WebM content-type validation and the existing configurable 8 MiB limit.
- Removed the audio route's previous second authorization/rate-count by sharing an internal fragment-ingestion function.
- Added privacy-safe chunk telemetry containing only request ID, chunk index, byte count, and transcription latency.
- Standardized cue voice output on `expo-speech`, including Android, without downloading authenticated audio.
- Added backend regression coverage for ordered audio ingestion, duplicate handling, and unsupported media types.

## Transport decision

This milestone provides near-real-time transcription through short completed-file uploads. It does not claim a continuous raw PCM stream. Expo's managed recorder emits M4A/WebM files, whereas Google Speech-to-Text streaming recognition is a bidirectional gRPC interface with small per-message limits. The current design keeps the Expo-managed workflow and creates a clean replacement boundary for a future native PCM capture module.

Audio and inference remain decoupled. Successful chunks update bounded transcript context; cue generation happens only on explicit request. M4 may consume local derived features, but automatic intervention must not be hidden inside the transcription transport.

## Privacy behavior

- Recording never starts in demo mode.
- Live capture requires microphone permission and an explicit in-session confirmation that participants know the microphone is active.
- The interface exposes recording and paused states and provides immediate pause/end controls.
- Raw audio is uploaded over the authenticated session boundary, processed in memory, and not intentionally persisted or logged by the backend.
- Silent/no-speech chunks are ignored and do not stop the rolling capture loop.
- Ending a conversation discards the unfinished chunk and waits for already queued uploads before producing the final summary.

## Validation boundary

Validated locally: Python tests, TypeScript checking, Expo web export, Expo Android export, demo browser workflow, idempotent audio API tests, and configuration/plugin generation.

Still requires external validation: physical Android microphone rollover, permission recovery, venue noise, Speech-to-Text credentials/API/quota, M4A decoding with the selected recognizer and region, mobile-network latency, and deployed Firebase/Cloud Run integration.

## M4 handoff

M4 should derive non-clinical audio features from a local four-second ring buffer where feasible, keep feature values out of transcript logs, require opt-in for automatic help, add confidence thresholds and cooldowns, and preserve the manual help button. It must not interpret the M3 chunk interval itself as evidence of conversational difficulty.
