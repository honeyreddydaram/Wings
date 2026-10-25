# Threat Model

## Assets and trust boundaries

Sensitive assets are Firebase identity, profile/card/contact records, session capabilities, transcript fragments, remembered notes, summary objects, provider credentials, and cloud billing capacity. Trust boundaries exist at the mobile device, public Cloud Run edge, Firebase token verification, Firestore/Storage, Speech/Vertex providers, build system, and optional OTLP collector.

## Primary threats and controls

- Stolen session or Firebase tokens: short session access lifetime, hashed session capabilities, Firebase verification, owner isolation, HTTPS, and planned platform-secure token storage.
- Public-card enumeration/XSS: random slugs, publish/revoke controls, escaping, CSP, no referrer, and request limiting.
- Prompt injection/data over-sharing: bounded priority context, escaped untrusted text, provider-specific system boundary, schema and safety validation, deterministic fallback.
- Recording without awareness: explicit confirmation, persistent recording state, immediate pause/end, and demo mode without microphone capture.
- Telemetry leakage: allowlisted low-cardinality attributes, no automatic header/body instrumentation, privacy regression tests, and collector configuration review.
- Cost/availability abuse: session/public/process limits, provider budget, bounded retries/circuit breaker, max Cloud Run instances, billing alerts, and distributed edge controls before launch.
- Deletion gaps: authenticated inventory/erasure endpoint, Firestore TTL, Storage lifecycle, Firebase identity deletion, and operator runbook for partial failures.
- Supply-chain compromise: pinned runtime dependencies, weekly Dependabot checks, Python audit, critical production npm gate, and reviewed exceptions.

## Residual risks requiring review

Device compromise, AsyncStorage token exposure, distributed denial of service without Cloud Armor/API Gateway, provider transient retention, legal recording consent, physical-device audio behavior, backup operator access, and a compromised deployment principal remain outside local test coverage.
