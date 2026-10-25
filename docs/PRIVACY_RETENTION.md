# Privacy, Retention, and Deletion

| Data | Default storage | Retention | User control |
|---|---|---|---|
| Raw audio chunks | Request memory only | Released after transcription | Pause/end recording |
| Active transcript fragments | Session record | Access expires after 2 hours; Firestore TTL after 1 day | End session or delete account |
| Derived difficulty values | Mobile memory | Bounded current session | Disable automatic help/end session |
| Profile and private card | Firestore/SQLite | Until deleted | Delete profile or account |
| Saved contacts and notes | Firestore/SQLite | Until deleted | Delete individual contact or account |
| Opt-in remembered topic | Firestore/SQLite | Until deleted | Forget memory or delete account |
| Optional summary object | Private Cloud Storage | 30-day lifecycle | Delete account |
| Operational telemetry | Logging/OTLP backend | Configure 30 days or less | Contains allowlisted operational values only |

The live Firestore TTL is asynchronous; a record can remain after its expiration timestamp until Google deletes it. SQLite demo storage has no background TTL worker and must not be treated as a production retention mechanism. Cloud Storage lifecycle must be installed from `infra/gcp/storage-lifecycle.json`.

Account erasure scans the authenticated owner's records, removes public card pointers, removes optional summary objects by owned session ID, and then deletes the Firebase identity. Partial external-provider failures return 503 and require the incident runbook; operational logs still exclude the affected identity and data. Google provider transient retention is governed by the applicable service terms.

Before real use, set user-facing consent and privacy text for the deployment's jurisdiction, confirm subprocessor and data-location requirements, verify Cloud Logging/OTLP retention, and rehearse erasure with non-production accounts.
