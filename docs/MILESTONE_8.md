# Milestone 8 — Integration, Testing, and Demonstration

## Repository completion

Milestone 8's credential-free work is implemented. A combined backend journey covers profile setup, session creation/recovery, transcript, manual cues, summary, opt-in memory, public-card exchange, saved contacts, privacy inventory, and account erasure. Separate contracts cover expired/wrong capabilities, long bounded sessions, provider fallback, audio retry/idempotency, detector policy, and twenty concurrent demo conversations.

Native active-session capabilities are stored with Expo SecureStore. Browser recovery uses tab-scoped session storage. On restart, the client verifies the capability through `/session/{id}/status`; it never restores microphone capture automatically. Backgrounding or screen locking pauses and discards the unfinished recording chunk. Sign-out, session completion, account erasure, expiry, and invalid capability clear recovery data.

The current session tracks microphone-chunk-to-transcript and assistance-request-to-cue latency plus loss/error rates in memory. It does not export speech features. Targets and measurement procedure are in [PERFORMANCE.md](PERFORMANCE.md).

UI hardening adds explicit labels/states/hints to primary navigation and conversation controls, 44-point minimum interactive targets, darker text contrast, foreground-pause messaging, and no required animation. Physical TalkBack, text-scaling, routing, and switch-control validation remains required.

## Demonstration package

- [Demo script](DEMO.md) with consent language and deterministic offline path.
- [Test matrix](TEST_MATRIX.md) separating automated, deployed, and physical checks.
- [Release checklist](RELEASE_CHECKLIST.md) for preview and production builds.
- [Credential-free demo screenshot](images/wings-m8-demo.png), generated from the validated web export.
- Versioned EAS preview APK and production AAB profiles.
- Deterministic scenario data in `mobile/src/demoScenario.ts`.
- Architecture diagram in [ARCHITECTURE.md](ARCHITECTURE.md).

## External validation still required

No signed APK/AAB, physical-device result, cloud-provider result, quota/cost rehearsal, headphone-routing result, or legal approval is claimed. Complete those rows in the test matrix with build IDs, device models, OS versions, project/environment, timestamps, and evidence before calling the product released.
