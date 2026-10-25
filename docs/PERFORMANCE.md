# Performance and Reliability Targets

## Acceptance targets

| Signal | Target | Measurement |
|---|---:|---|
| Completed chunk capture → visible transcript p95 | ≤ 8 seconds | Client monotonic wall time from `captured_at_ms` to accepted response |
| Manual/automatic cue request → visible cues p95 | ≤ 5 seconds | Client request start to validated response/fallback |
| Transcription loss | ≤ 5% of non-silent completed chunks | Failed chunks / attempted non-silent chunks |
| Inference/provider error | ≤ 5% before fallback | Failed cue requests / cue attempts |
| Automatic intervention | ≤ 3 per session | Existing M4 policy cap; zero when opted out |
| Demo crash rate | 0 crashes in 20 consecutive rehearsals | Physical-device rehearsal log |
| Demonstration concurrency | 20 credential-free sessions locally | Automated ASGI concurrency contract |

The mobile diagnostics panel shows current-session values and resets at session start. Silent chunks are excluded from loss. Measurements stay in memory and are not exported as speech-feature telemetry.

## Local baseline

The automated suite runs twenty concurrent demo sessions, each with start, transcript, cue, and final summary, under a ten-second aggregate local ceiling. This verifies application coordination and SQLite contention only; it is not a Cloud Run capacity claim.

## Deployed rehearsal

Use non-production accounts and consented synthetic speech. Run at the intended demonstration concurrency, capture Cloud Run p50/p95/p99 latency, instance count, 4xx/5xx rate, Firestore contention, Speech/Vertex quota, fallback count, and billing estimate. Repeat after a cold start and under shaped weak connectivity. Record results in the test matrix and tune quotas/limits only from observed data.

Battery, memory, thermal state, network loss, microphone gaps, and audio routing must be measured on each target Android device for at least one 30-minute session.
