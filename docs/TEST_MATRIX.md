# Integration Test Matrix

Use `Pass`, `Fail`, or `Not run`; add date, environment/build, device/OS, operator, and evidence link for every external run.

| Area | Automated/local status | External validation |
|---|---|---|
| Demo profile → session → transcript → cue → summary | Pass | Repeat 20 times on preview APK |
| Opt-in memory, privacy inventory, account erasure | Pass | Firebase/Firestore/Storage erasure rehearsal |
| Public card, visibility, QR data, vCard, revoke | Pass | Two physical cameras, low light, deep links |
| Active-session restart recovery | Pass contract | Kill/relaunch preview APK; confirm microphone stays paused |
| Expired/wrong session capability | Pass | Firebase token expiry/revocation |
| Audio retry, duplicate chunks, silence/provider failure | Pass contract | Wi-Fi loss, mobile network, airplane-mode transitions |
| Background/screen lock | Foreground-pause implemented | Android lock, calls, permission revocation |
| Gemma validation/fallback/circuit breaker | Pass mocked | Vertex quota, cold start, malformed/provider outage |
| Difficulty detector opt-out/cooldown/cap | Pass synthetic | Voices, microphones, crowd/music venue noise |
| 20 concurrent demo sessions | Pass local | Cloud Run load/cost rehearsal |
| Accessibility labels/touch targets/contrast | Pass code review | TalkBack, 200% text, focus order, switch access |
| Headphones and speech routing | Not externally run | Wired, Bluetooth, speaker, interruption |
| Battery/memory/thermal, 30-minute session | Not externally run | Each target device/OS |
| Signed preview APK / production AAB | Profiles configured | Build, install, signature and update test |

Critical release blockers are unauthorized recording, cross-account data access, failed erasure, token leakage, critical dependency advisories, repeatable crash, missing fallback, or documentation that overstates validation.
