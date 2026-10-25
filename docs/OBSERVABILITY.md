# Observability Foundation

## Implemented through Milestone 7

Every HTTP request receives a correlation ID. A valid caller-supplied `X-Request-ID` is preserved; otherwise the backend creates a UUID. The ID is returned in the response header. Completion logs contain event name, request ID, method, route template, status code, and duration in milliseconds. Unhandled failures use the same safe fields plus exception type. `/readyz` emits a readiness event in demo mode and logs dependency failure in live mode.

`LOG_LEVEL` controls severity and `LOG_FORMAT=json` selects newline-delimited JSON. Plain text is available for local debugging. Logs intentionally do not include headers, query strings, request/response bodies, session IDs as values, tokens, audio, transcripts, names, profiles, notes, prompts, or provider responses.

The automated privacy regression test submits sentinel personal values and confirms request events do not contain them.

Successful live transcription emits `audio_chunk_transcribed` with request ID, chunk index, encoded byte count, and provider-call latency. It intentionally omits the session identifier, file name, media content, transcript, signal, and provider response.

## Event fields

| Field | Meaning |
|---|---|
| `timestamp` | UTC ISO-8601 emission time |
| `level` | configured log severity |
| `logger` | logger name |
| `event` | stable event label such as `request_completed` |
| `request_id` | safe correlation identifier |
| `method` / `route` | HTTP method and templated route |
| `status_code` | HTTP result |
| `duration_ms` | end-to-end server request duration |
| `exception_type` | class only, never message/body, for unhandled exceptions |
| `chunk_index` | client sequence number for an accepted audio chunk |
| `audio_bytes` | encoded upload size, never content |
| `transcription_ms` | provider transcription latency for the chunk |

## OpenTelemetry metrics and spans

When `OTEL_ENABLED=true`, the API exports the following OTLP/HTTP instruments:

- `cowingman.operations`
- `cowingman.operation.duration`
- `cowingman.operation.failures`

Explicit spans cover HTTP, storage, speech recognition, inference, server TTS, summaries, and optional summary-object operations. The mobile difficulty detector deliberately exports no features; its privacy contract takes priority over remote observability. Device speech and mobile queue measurements remain device-validation work.

The following component names organize the shared instruments:

- `cowingman.http.server.duration` and `cowingman.http.server.requests`
- `cowingman.audio.ingest.bytes` / `.duration` / `.failures`
- `cowingman.speech.recognition.duration` / `.failures`
- `cowingman.assistance.window.duration` / `.signal` / `.interventions`
- `cowingman.inference.duration` / `.failures` / `.tokens`
- `cowingman.cue.end_to_end.duration` / `.generated`
- `cowingman.tts.duration` / `.failures`
- `cowingman.summary.duration` / `.failures` / `.checkpoints`
- `cowingman.storage.operation.duration` / `.failures`

Useful attributes are provider, model, mode, outcome, route, and coarse audio format/size bucket. Never attach user/contact/session identifiers, utterance text, prompts, résumé data, URLs supplied by a user, or audio features precise enough to reconstruct content.

## OpenTelemetry privacy boundary

Export is off by default. Enabling it requires `OTEL_EXPORTER_OTLP_ENDPOINT`; sampling is controlled by `OTEL_SAMPLE_RATIO`. The application does not install automatic HTTP instrumentation because URL/query/header capture can leak data. A strict allowlist accepts only low-cardinality operation, provider, route-template, result, model, coarse audio format/size, and status values. Arbitrary keys or values fail closed. Exception messages and stack frames are not recorded in spans.

Structured stdout is compatible with Cloud Logging. `infra/gcp/monitoring-dashboard.json` covers Cloud Run request rate and p95 latency; `configure-monitoring.sh` installs it. Operators must connect an approved collector/export path, add notification channels, install the alert policy, and set log/trace/metric retention before live traffic. Sentry is not enabled.

## Health semantics

`/healthz` is liveness only. `/readyz` verifies SQLite/Firestore and, in live mode, configured inference authorization. It does not spend quota probing Speech-to-Text, TTS, Cloud Storage, or the mobile client. Deployment smoke tests preserve that distinction.
