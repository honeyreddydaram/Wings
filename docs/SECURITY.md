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
- Raw audio is read into memory, bounded, its request-local reference is released in `finally`, and it is not intentionally written by the backend.
- Live recording is gated by an in-session participant-awareness confirmation and accompanied by a visible recording indicator and pause control.
- Audio chunks carry ordered indexes for idempotent retry; operational audio events include only byte count, chunk index, and latency—not audio or transcript content.
- Contact notes are opt-in and deletable. Active fragments are cleared when the session ends.
- Firebase mode verifies client ID tokens with the Admin SDK and binds profiles and new sessions to the verified UID rather than a caller-supplied owner value.
- Profile fields and list sizes are bounded, isolated by a hashed user key, and deletable through the authenticated API.

## Consent and product language

The product must show an unmistakable recording state and provide pause/stop controls. Users are responsible for participant awareness and authorization before capture. The current signal is labeled conversational difficulty/assistance, never anxiety diagnosis. Public-data use must be permission-based; the current LinkedIn field is only a label and performs no scraping.

## Secrets

Never place service-account credentials, Gemini keys, bearer tokens, or other server secrets in `EXPO_PUBLIC_*`, source, build arguments, logs, issue text, or test fixtures. Firebase web configuration is intentionally embedded client configuration; restrict its API key and rely on verified ID tokens and backend authorization rather than treating it as a secret. Use Secret Manager/runtime injection and least-privilege service accounts for server credentials. Rotate any secret that is accidentally exposed.

## Data retention

Firestore session writes include a one-day TTL field, while application access expires after two hours. TTL deletion is asynchronous and must be enabled in the deployed project. SQLite demo records do not expire automatically. Contact notes persist until deletion and have no TTL. Optional summary objects require an independently configured bucket lifecycle. Provider retention remains subject to provider terms. These gaps must be surfaced to users before real-conversation use.

## Known gaps

- Demo mode still uses a client-generated owner capability and must not be exposed as production authentication.
- No API gateway, IP/device abuse limit, bot protection, or quota budget.
- Session capability tokens live in React state; Firebase sign-in persistence uses browser storage or native AsyncStorage, which is not equivalent to hardware-backed secret storage.
- Firestore and Cloud Storage security rules/IAM have not been validated in a deployed project.
- No encryption-key management beyond provider defaults, security scanning, dependency-update automation, audit trail, or incident response runbook.
- No complete deletion endpoint for every session record/object/provider copy.
- Profile deletion does not delete the Firebase Authentication account; complete account deletion remains unimplemented.
- No formal consent record or jurisdiction-specific privacy review.
- Live provider payload/retention behavior and Android network security need verification.
- Rate limits and session TTLs are hardcoded product defaults rather than centrally governed policy.
- The 2026-10-25 `npm audit` reports ten high and one moderate dependency advisory across the Expo toolchain and Firebase’s bundled but unused Firestore path. Offered major-version downgrades conflict with the current Expo/Firebase stack, so remediation must use supported upstream updates rather than a forced audit fix.

## Milestone 4 security priorities

Validate recording indicators and permission recovery on physical Android devices, define a jurisdiction-appropriate consent flow, and ensure future derived-feature telemetry cannot reconstruct speech. M4 assistance triggers must remain conservative, opt-in, rate-limited, and explicitly non-clinical.
