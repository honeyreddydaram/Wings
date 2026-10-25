# Observability Foundation

## Implemented through Milestone 3

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

## Planned metrics and spans

These names are design targets, not emitted metrics:

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

## OpenTelemetry plan

`OTEL_ENABLED` and `OTEL_SERVICE_NAME` reserve configuration names, but no SDK or exporter is installed and enabling the flag does not emit telemetry. In M7, instrument FastAPI plus explicit provider/storage spans, use context propagation from the request ID, configure sampling and batch export, and add redaction tests before enabling Google Cloud Trace/Monitoring. Cloud Logging ingestion, dashboards, alerts, Sentry, and cost monitoring are not configured by this repository.

## Health semantics

`/healthz` is liveness only. `/readyz` verifies SQLite/Firestore and, in live mode, Gemini authorization. It does not verify Speech-to-Text, TTS availability, inference quota, Cloud Storage, end-to-end latency, or the mobile client. Monitoring must preserve that distinction.
