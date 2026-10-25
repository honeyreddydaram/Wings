# Incident Response Runbook

1. Declare an incident owner, timestamp, affected environment, and suspected data/services without copying user content into tickets or chat.
2. Contain exposure: stop traffic or route to a known-good revision, disable compromised credentials, and lower provider/max-instance quotas when cost abuse is suspected.
3. Preserve privacy-safe Cloud Audit Logs, revision identifiers, safe request IDs, metric windows, and IAM changes. Do not export transcripts, profiles, contacts, prompts, tokens, or raw request bodies.
4. Assess authentication, Firestore, Storage, Speech, Vertex AI, Secret Manager, OTLP collector, and build provenance separately.
5. Eradicate the cause, rotate affected credentials with the key-rotation runbook, patch, deploy to development, run smoke/deletion tests, then promote.
6. Notify affected users and authorities according to counsel-approved timelines. Do not claim a legal conclusion from this runbook.
7. Record root cause, impact, detection gap, remediation owner, deadline, and regression test. Revisit alert thresholds and the threat model.

For an unsafe release, set `REVISION` to the last reviewed revision and run `infra/gcp/rollback.sh`, then verify `/healthz`, `/readyz`, and invalid-card behavior.
