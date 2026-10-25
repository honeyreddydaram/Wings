# Milestone 7 — Observability, Privacy, and Cloud Deployment

## Repository completion

Milestone 7's credential-free engineering work is implemented. OpenTelemetry spans and metrics use an allowlist that rejects user data, credentials, prompts, transcript/audio content, profile/contact fields, and arbitrary identifiers. Instrumented boundaries include HTTP, SQLite/Firestore, speech recognition, inference, TTS, summaries, and optional Cloud Storage. Export is disabled by default and requires both `OTEL_ENABLED=true` and an OTLP/HTTP endpoint.

The API now has a per-process edge limit, the existing session limit, the public-card limit, and a provider-call budget. The process limit protects a single instance; production still needs a distributed edge control and billing-budget alerts. Provider retries count against the budget.

`GET /privacy/me` reports the authenticated user's stored-data inventory and current retention policy. `DELETE /account/me` erases profile, card/public pointer, contacts, remembered notes, owned sessions, optional summary objects, and the Firebase Authentication identity when applicable. Provider-side transient copies remain governed by provider terms and cannot be deleted by this API.

The Google Cloud scripts now distinguish development and production services, use environment-specific identities and Firestore collections, provision least-privilege runtime roles, optionally configure a private lifecycle-managed summary bucket, run smoke tests after deployment, and provide explicit rollback, backup, and dashboard setup commands.

## Local verification

- Backend tests cover redaction allowlists, rate-window behavior, retention reporting, account erasure, authorization, storage, inference, audio, cards, and contacts.
- CI audits Python dependencies, blocks critical production npm advisories, and runs backend, mobile, web, and Android checks.
- Deployment and runbook scripts are shell-syntax checked.

## External validation still required

Repository completion does not claim that cloud resources exist. Before production traffic, an operator must deploy separate Google Cloud projects, connect an approved OTLP collector, create notification channels and alerts, set a billing budget, test backup/restore, inspect IAM and Firebase rules, verify Firestore TTL behavior, execute account erasure against Firebase/Firestore/Storage, run the threat-model review, and obtain privacy/legal review for recording and third-party processing.

References: [Observability](OBSERVABILITY.md), [Security](SECURITY.md), [Privacy and retention](PRIVACY_RETENTION.md), and [Google Cloud deployment](../infra/gcp/README.md).
