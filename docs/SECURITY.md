# Security and Privacy Baseline

This is a hackathon baseline, not a claim of production-grade security or legal compliance.

## Implemented controls

- Session tokens use cryptographically random values, are returned to the client once, persisted only as SHA-256 hashes, and compared with constant-time comparison.
- Session operations enforce token validity, two-hour expiry, ended state, isolation, optimistic record versions, and a persisted 40-request/minute/session limit.
- Inputs have Pydantic bounds; audio uploads have a configurable byte limit.
- CORS uses configured exact origins rather than a wildcard default.
- API/provider credentials are server-side environment values. `.env`, databases, logs, build output, and dependency directories are ignored by Git.
- Demo mode requires no cloud credentials and makes no inference/provider call.
- Structured logs exclude authorization headers, bodies, raw audio, transcript text, contact/profile data, notes, prompts, and credentials.
- Raw audio is read into memory, bounded, cleared in `finally`, and not intentionally written by the backend.
- Contact notes are opt-in and deletable. Active fragments are cleared when the session ends.

## Consent and product language

The product must show an unmistakable recording state and provide pause/stop controls. Users are responsible for participant awareness and authorization before capture. The current signal is labeled conversational difficulty/assistance, never anxiety diagnosis. Public-data use must be permission-based; the current LinkedIn field is only a label and performs no scraping.

## Secrets

Never place API keys in `EXPO_PUBLIC_*`, source, build arguments, logs, issue text, or test fixtures. Use Secret Manager/runtime injection in cloud deployments and least-privilege service accounts. Rotate any credential that is accidentally exposed. The repository does not auto-load `.env`; this avoids implying that copying secrets into the tree is required.

## Data retention

Firestore session writes include a one-day TTL field, while application access expires after two hours. TTL deletion is asynchronous and must be enabled in the deployed project. SQLite demo records do not expire automatically. Contact notes persist until deletion and have no TTL. Optional summary objects require an independently configured bucket lifecycle. Provider retention remains subject to provider terms. These gaps must be surfaced to users before real-conversation use.

## Known gaps

- No Firebase/user authentication yet; public session creation and client-generated owner capabilities are unsuitable for public production.
- No API gateway, IP/device abuse limit, bot protection, or quota budget.
- Bearer tokens live in React state; native secure persistence and recovery are not implemented.
- Firestore and Cloud Storage security rules/IAM have not been validated in a deployed project.
- No encryption-key management beyond provider defaults, security scanning, dependency-update automation, audit trail, or incident response runbook.
- No complete deletion endpoint for every session record/object/provider copy.
- No formal consent record or jurisdiction-specific privacy review.
- Live provider payload/retention behavior and Android network security need verification.
- Rate limits and session TTLs are hardcoded product defaults rather than centrally governed policy.
- The 2026-10-25 `npm audit` reports six high and one moderate transitive advisory in the Expo toolchain. The offered major-version downgrade is incompatible with the current Expo 54 stack, so remediation must be evaluated through supported Expo dependency updates rather than forced automatically.

## Milestone 2 priorities

Verify Firebase ID tokens server-side, bind sessions/profile records to authenticated user IDs, authorize every profile/note mutation, define account deletion, and use platform-secure storage for durable credentials. Keep session capability checks as defense in depth and add tests for cross-user access before exposing the API.
