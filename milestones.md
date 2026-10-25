# Co-Wingman Engineering Milestones

Last updated: 2026-10-25

This document is the implementation roadmap for Co-Wingman. Checkboxes describe repository state, not product claims. A checked engineering task means the code or documentation exists locally; device-, credential-, deployment-, privacy-, and performance-dependent verification remains unchecked until it has been run in the appropriate environment.

## Status legend

- `[x]` Implemented and locally validated.
- `[ ]` Not implemented, incomplete, or awaiting external validation.
- **Complete locally** means the milestone's repository work and credential-free checks pass.
- **Pending** means implementation has not started or is not complete.

## Cross-milestone rules

- Preserve the credential-free demo workflow.
- Keep API keys, service-account credentials, Firebase ID tokens, session capabilities, audio, transcripts, profile data, and prompts out of operational logs.
- Require explicit participant awareness before microphone capture and keep recording state visible.
- Describe assistance signals as conversational difficulty signals, never as clinical anxiety diagnoses.
- Prefer bounded context, short-lived session capabilities, opt-in memory, and deletion controls.
- Keep inference providers replaceable; do not treat Gemini and Gemma as interchangeable model names.
- Do not claim cloud, Android-device, NFC, or provider behavior until it has been tested in that environment.
- Every milestone must preserve or improve automated validation, documentation, privacy, and failure handling.

---

## Milestone 1 — Foundation and Architecture

**Status: Complete locally**

### Objective

Create a maintainable foundation that contributors can install, understand, validate, and extend without breaking the working MVP.

### Repository and architecture

- [x] Audit the existing backend, mobile application, tests, dependencies, and infrastructure.
- [x] Separate verified findings from assumptions and external-validation needs.
- [x] Document implemented, simulated, and planned system components.
- [x] Document the Android → FastAPI → Google Cloud service flow.
- [x] Define boundaries for authentication, sessions, audio, transcription, detection, inference, summaries, storage, and observability.
- [x] Document how future four-second analysis windows and two-minute summary checkpoints operate independently.
- [x] Preserve existing routes, response formats, demo behavior, and tests during refactoring.

### Configuration and backend organization

- [x] Centralize runtime, storage, CORS, provider, speech, model, audio, logging, and observability settings.
- [x] Add a documented backend environment template.
- [x] Ensure demo mode starts without Google Cloud credentials.
- [x] Extract inference and summarization service boundaries.
- [x] Add privacy-safe structured JSON logging.
- [x] Add request/correlation IDs and request-duration measurement.
- [x] Keep request bodies, credentials, audio, transcripts, and personal data out of logs.

### Contracts, tests, and CI

- [x] Document implemented API endpoints and authentication requirements.
- [x] Add lifecycle, authorization, isolation, summary, input-boundary, and privacy regression tests.
- [x] Add TypeScript checking and Expo web-build validation.
- [x] Add GitHub Actions for backend tests and mobile validation.
- [x] Add Android export validation to CI.
- [x] Document security, observability, deployment, and repository limitations.

### Exit criteria

- [x] Backend tests pass in credential-free demo mode.
- [x] Mobile TypeScript checking passes.
- [x] Expo web and Android exports pass.
- [x] A new contributor can find setup, validation, API, security, and architecture instructions.

References: [Architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [Repository audit](docs/REPOSITORY_AUDIT.md), [Observability](docs/OBSERVABILITY.md), and [Security](docs/SECURITY.md).

---

## Milestone 2 — Android Application, Authentication, and Profiles

**Status: Complete locally; deployed Firebase and physical-device validation pending**

### Objective

Establish real user identity and persistent professional context while retaining the local demo workflow.

### Authentication

- [x] Add Firebase email/password account creation and sign-in.
- [x] Persist web sign-in using browser persistence.
- [x] Persist native sign-in using AsyncStorage through the React Native Firebase JS SDK adapter.
- [x] Verify Firebase ID tokens at the FastAPI boundary.
- [x] Bind profiles, session creation, and contact-note ownership to the verified Firebase UID.
- [x] Retain a separate narrow session capability for active conversation routes.
- [x] Preserve a persistent local device identity in demo mode.
- [x] Return generic authentication failures without leaking token-validation details.
- [ ] Validate account creation, sign-in persistence, token refresh, sign-out, and expiry against a real Firebase project on Android.
- [ ] Add email verification, password reset, MFA, OAuth providers, and account-recovery flows if required for the target release.
- [ ] Move sensitive session capabilities to platform-secure storage before production use.

### Persistent profiles

- [x] Add authenticated profile read, replace, and delete endpoints.
- [x] Store bounded name, headline, organization, skills, interests, goals, accomplishments, portfolio URL, and résumé summary fields.
- [x] Add a mobile profile and authentication screen.
- [x] Isolate profile records by authenticated UID or demo-device identity.
- [x] Add profile validation and ownership-isolation tests.
- [x] Keep profile data out of AI prompts until Milestone 5.
- [ ] Add résumé file upload, malware scanning, parsing, and deletion if the product requires source files.
- [ ] Add complete Firebase-account and cross-store erasure.

### Deployment and documentation

- [x] Add Firebase client and backend environment templates.
- [x] Add Firebase-aware Cloud Run deployment configuration.
- [x] Document the difference between public Firebase client configuration and server secrets.
- [ ] Validate Firebase Admin credentials, IAM, quotas, and token revocation in the deployed environment.

### Exit criteria

- [x] Demo and Firebase code paths have local contract coverage.
- [x] Profile CRUD and identity isolation tests pass.
- [x] Web and Android exports include the authentication implementation.
- [ ] A physical Android device can complete the full deployed sign-up → profile → session → sign-out flow.

Reference: [Milestone 2 details](docs/MILESTONE_2.md).

---

## Milestone 3 — Real-Time Audio Pipeline

**Status: Complete locally; live Speech-to-Text and physical-device validation pending**

### Objective

Provide reliable, consented, near-real-time microphone capture, incremental transcription, and voice cue output without coupling audio transport to assistance detection.

### Capture and user controls

- [x] Replace deprecated `expo-av` recording with the Expo SDK-compatible `expo-audio` module.
- [x] Configure Android microphone permission and user-facing permission language.
- [x] Require an in-session participant-awareness confirmation before live recording.
- [x] Display a persistent recording indicator while capture is active.
- [x] Provide immediate pause and end controls.
- [x] Preserve typed transcript entry when permission or audio capture is unavailable.
- [x] Keep demo mode microphone-free and deterministic.
- [x] Capture bounded four-second M4A/WebM files.
- [x] Continue recording through a rolling chunk lifecycle.
- [x] Serialize uploads to preserve transcript order.
- [x] Flush queued chunks before final session summarization.
- [x] Discard the unfinished chunk when ending a session.
- [ ] Validate recorder rollover, interruptions, permission revocation, phone calls, screen locking, and app backgrounding on target Android devices.
- [ ] Measure capture gaps, battery usage, memory use, and thermal impact.

### Audio ingestion and transcription

- [x] Accept authenticated multipart audio uploads.
- [x] Enforce bounded upload size and accepted M4A/MP4/WebM content types.
- [x] Attach non-negative ordered chunk indexes.
- [x] Cache recent accepted chunk results so retries are idempotent.
- [x] Add one bounded client retry for transient transport/provider failures.
- [x] Remove double authorization and double rate counting from audio ingestion.
- [x] Send completed chunks to Google Speech-to-Text V2 through the speech adapter.
- [x] Append successful results to bounded session context and the visible transcript.
- [x] Ignore no-speech chunks without stopping rolling capture.
- [x] Keep raw audio request-local and out of application persistence and logs.
- [x] Log only safe chunk metadata: request ID, index, encoded byte count, and transcription latency.
- [ ] Validate Google credentials, Speech API enablement, Chirp 3 availability, regional configuration, quotas, and billing.
- [ ] Validate Expo-generated M4A and WebM samples against the deployed recognizer.
- [ ] Measure mobile-network upload latency, transcription latency, retry behavior, and loss rates.
- [ ] Add exponential backoff, offline buffering policy, and circuit breaking if measurements justify them.

### Voice output

- [x] Speak cues through on-device `expo-speech` on Android and web.
- [x] Stop current speech before microphone capture to reduce self-capture.
- [x] Preserve the user-controlled voice-output switch.
- [ ] Validate headphone routing, Bluetooth devices, volume behavior, interruption handling, and accessibility on Android.

### Transport boundary

- [x] Clearly document that the implementation is near-real-time completed-chunk transcription, not raw PCM streaming.
- [x] Keep transcript/session contracts independent of the capture implementation.
- [ ] Consider a native PCM capture module and a WebSocket/gRPC bridge only if latency measurements show the managed Expo path is insufficient.

### Exit criteria

- [x] Audio ingestion covers accepted, duplicate, unsupported, silent, and provider-failure contracts.
- [x] Backend tests, TypeScript checking, and Expo web/Android exports pass.
- [x] The demo browser workflow remains functional.
- [ ] A physical Android device produces stable incremental transcripts through the deployed backend under realistic venue noise.

Reference: [Milestone 3 details](docs/MILESTONE_3.md).

---

## Milestone 4 — Conversational Difficulty Detection

**Status: Complete locally; physical-device calibration and venue evaluation pending**

### Objective

Estimate when conversational assistance might be useful through conservative, configurable, non-clinical signals while keeping manual help authoritative.

### Local analysis pipeline

- [x] Define a local four-second scalar ring-buffer interface independent of upload chunk boundaries.
- [x] Extract privacy-preserving voice activity, pause duration, energy variation, and speaking-rate estimates from microphone levels and transcript timing.
- [x] Detect filler and repeated-speech counts from transcript events without retaining transcript words in the detector.
- [x] Normalize microphone levels against a recent adaptive noise floor.
- [x] Produce a bounded assistance score with `low`, `medium`, and `high` product-facing states.
- [x] Store only bounded derived scalar samples and counts; never store raw audio in the detector.
- [x] Keep detector features out of operational telemetry.

### Intervention policy

- [x] Require a separate per-session opt-in for automatic assistance.
- [x] Retain the manual **Get me unstuck** action regardless of automatic-detection settings.
- [x] Define minimum confidence, two consecutive high windows, a 45-second cooldown, three-intervention session cap, and low-state recovery.
- [x] Suppress interventions while the assistant is speaking, during recorder transitions, and for five seconds after user interaction.
- [x] Explain why an automatic suggestion appeared without claiming emotional or medical knowledge.
- [x] Allow users to disable automatic assistance immediately.

### Evaluation

- [x] Create synthetic fixtures for speech, long pauses, fillers, repetition, silence, crowd noise, and music-like levels.
- [x] Add deterministic unit tests for feature extraction and policy state transitions.
- [x] Measure local synthetic false triggers, gating, trigger latency, and cooldown behavior; the current test set produces no false triggers in its three negative fixtures.
- [ ] Test across several Android devices, microphones, voices, and venue-noise conditions.
- [x] Document heuristic limitations and prohibit clinical interpretation.

### Exit criteria

- [x] No automatic intervention occurs without explicit opt-in in local policy tests.
- [x] Manual help remains immediate and independent of the detector.
- [x] Synthetic false-positive behavior is measured and acceptable for local demonstration; venue/device acceptance remains pending.
- [x] The UI and documentation consistently use non-clinical language.

Reference: [Milestone 4 details](docs/MILESTONE_4.md).

---

## Milestone 5 — Gemma Conversation Intelligence

**Status: Complete locally; live Vertex AI and quality/performance evaluation pending**

### Objective

Integrate Gemma through a real provider-specific adapter and generate brief, safe, contextually useful assistance and summaries.

### Provider integration

- [x] Select and document Gemma 3 27B IT through Vertex AI Model Garden's OpenAI-compatible endpoint, global location, and Application Default Credentials; deployed quota and pricing remain external checks.
- [x] Implement a Gemma adapter behind the existing inference interface.
- [x] Keep Gemma's provider-specific request and authentication contract separate from Gemini.
- [x] Add provider timeouts, bounded retries, circuit breaking, and a deterministic text fallback.
- [x] Validate structured JSON output against schemas and safety rules before returning cues.
- [x] Add contract tests using mocked provider responses and malformed-output cases.

### Context construction

- [x] Build a bounded context assembler using recent conversation, rolling summary, authenticated profile, opt-in contact notes, and current assistance signal.
- [x] Weight recent conversation above background profile information.
- [x] Exclude full profiles, résumé summaries, full transcripts, and contact histories; include only capped relevant fields.
- [x] Treat all transcript/profile/contact text as escaped untrusted data and reinforce that boundary in the provider system message.
- [x] Keep public-information retrieval disabled; no background retrieval or unattributed enrichment occurs.

### Cue generation

- [x] Generate short follow-up questions, natural transitions, talking points, and optional experience-introduction suggestions.
- [x] Keep suggestions socially appropriate, low pressure, and easy to ignore.
- [x] Support explicit help requests independently from automatic M4 triggers.
- [x] Avoid sensitive-trait inference, manipulation, impersonation, clinical claims, and invented personal facts through prompts and output validation.
- [x] Enforce length, category, count, duplicate, schema, and safety validation.

### Summaries and follow-up

- [x] Implement independent approximately two-minute summary checkpoints.
- [x] Run checkpoint work in a separate task so it does not block urgent cue requests.
- [x] Use checkpoint sequence claims and prefix-only folding to tolerate retry and concurrent newer fragments.
- [x] Generate a bounded final summary and optional follow-up message draft.
- [x] Persist contact notes only after explicit opt-in.

### Evaluation and exit criteria

- [x] Create a curated scenario set for networking, recruiting, student, and social conversations.
- [ ] Measure relevance, hallucination rate, latency, verbosity, safety, and profile-grounding accuracy.
- [x] Contract-test both provider-shaped output and the deterministic fallback across curated scenarios; comparative quality scoring remains pending.
- [ ] Validate deployed quotas, cold starts, concurrency, and cost.
- [x] Demonstrate in tests that cues receive recent context and selected profile fields without the résumé summary or unrelated profile data.

Reference: [Milestone 5 details](docs/MILESTONE_5.md).

---

## Milestone 6 — Digital Identity and Contact Exchange

**Status: Implemented locally; physical-device QR/NFC validation pending**

### Objective

Let users share a controlled digital business card and manage exchanged contacts through reliable QR/public-link fallbacks plus compatible NFC behavior.

### Digital card

- [x] Define private profile fields versus public card fields.
- [x] Add a card editor and preview.
- [x] Generate an unguessable or user-controlled public card URL.
- [x] Add per-field visibility and a global publish/unpublish control.
- [x] Render an accessible, responsive public card that does not require Wings.
- [x] Generate a downloadable standards-compatible vCard.
- [x] Add card rotation/revocation and abuse controls.

### QR and NFC exchange

- [x] Generate a QR code for the public card URL.
- [x] Add QR scanning with permission handling and validation.
- [x] Open shared cards safely and require confirmation before saving a contact.
- [ ] Evaluate Android NFC capabilities on the actual target devices and OS versions.
- [x] Implement only supported NFC tag/read flows; do not promise universal phone-to-phone NFC sharing. (No native NFC flow is enabled until target-device evaluation supports one.)
- [x] Always offer QR code, link, and vCard alternatives.

### Contact management

- [x] Add a user-isolated contact record schema.
- [x] Store source, exchange time, user notes, and consented public-card snapshot.
- [x] Provide search, edit, export, and delete controls.
- [x] Connect conversation notes only through explicit user action.
- [x] Avoid scraping LinkedIn or other third-party services without authorization.

### Exit criteria

- [x] A non-Wings user can open the card and download a vCard.
- [ ] QR exchange works reliably on target Android devices.
- [x] NFC capability and fallback behavior are accurately communicated.
- [x] Public fields, revocation, contact deletion, and authorization are tested.

Reference: [Milestone 6 details](docs/MILESTONE_6.md).

---

## Milestone 7 — Observability, Privacy, and Cloud Deployment

**Status: Pending**

### Objective

Deploy the system with measurable reliability, explicit retention and deletion behavior, privacy-safe telemetry, and operational safeguards.

### Google Cloud deployment

- [ ] Provision separate development/demo and production-like projects or environments.
- [ ] Deploy FastAPI to Cloud Run with least-privilege service identity.
- [ ] Configure Firebase Authentication, Firestore, Speech-to-Text, Gemma hosting, Secret Manager, and optional Cloud Storage.
- [ ] Validate Firestore indexes, transaction contention, TTL policy, backups, and restore procedures.
- [ ] Configure Cloud Storage lifecycle and deletion behavior if summaries are stored there.
- [ ] Configure domain, HTTPS, CORS, Android network security, and environment promotion.
- [ ] Add deployment smoke tests and rollback instructions.

### Observability

- [ ] Install and configure OpenTelemetry SDKs and exporters.
- [ ] Add redacted spans around HTTP, storage, audio ingestion, speech recognition, detection, inference, TTS, and summaries.
- [ ] Emit latency, failure, intervention, queue, resource, quota, and cost metrics.
- [ ] Configure Cloud Logging, Monitoring, Trace, dashboards, and alerts.
- [ ] Evaluate Sentry only after redaction and data-location requirements are understood.
- [ ] Add telemetry tests that reject transcript, audio, credentials, profile fields, contact data, and prompts.

### Security and privacy completion

- [ ] Add API-edge rate limiting, abuse controls, and budget/quota guards.
- [ ] Implement complete account, profile, contact, session, summary-object, and provider-copy deletion workflows where supported.
- [ ] Define and enforce retention periods for every data type.
- [ ] Validate Firebase, Firestore, Storage, Cloud Run, and Secret Manager IAM/rules.
- [ ] Add dependency scanning and a supported remediation policy.
- [ ] Create incident-response, key-rotation, audit, and privacy runbooks.
- [ ] Perform threat modeling and privacy/legal review for recording and third-party data use.

### Exit criteria

- [ ] The deployed service has passing smoke tests, dashboards, alerts, rollback, and cost limits.
- [ ] Telemetry redaction tests pass.
- [ ] Retention and deletion controls are demonstrably enforced.
- [ ] IAM and security rules have been reviewed in the deployed environment.

---

## Milestone 8 — Integration, Testing, and Hackathon Demonstration

**Status: Pending**

### Objective

Validate the complete Android experience, harden recovery paths, and deliver a polished, truthful demonstration.

### End-to-end validation

- [ ] Test account creation, profile setup, session start, consent, recording, incremental transcription, manual help, automatic help, cue speech, summary, contact exchange, memory, deletion, and sign-out.
- [ ] Test on multiple physical Android devices and supported OS versions.
- [ ] Test wired headphones, Bluetooth headphones, speaker routing, and audio interruptions.
- [ ] Test weak connectivity, offline transitions, request loss, retries, provider outages, token expiry, and app restarts.
- [ ] Test long sessions, background/foreground transitions, screen locking, battery use, memory use, and thermal behavior.
- [ ] Test accessibility: screen reader labels, focus order, contrast, touch targets, text scaling, and reduced motion where relevant.

### Performance and reliability targets

- [ ] Define and measure microphone-to-transcript latency.
- [ ] Define and measure assistance-request-to-cue latency.
- [ ] Define acceptable transcription loss, provider error, intervention, and crash rates.
- [ ] Load-test concurrent sessions within the intended demonstration scale.
- [ ] Verify quotas and cost budgets under rehearsal traffic.

### Demonstration readiness

- [ ] Create a repeatable demo scenario with clear participant consent.
- [ ] Prepare deterministic fallback data for unreliable venue connectivity.
- [ ] Show recording, pause, privacy, and delete controls during the demonstration.
- [ ] Clearly distinguish implemented behavior, simulated fallback behavior, and future work.
- [ ] Prepare screenshots, architecture diagrams, setup instructions, troubleshooting notes, and a concise demo script.
- [ ] Produce and install a signed Android preview/release build.
- [ ] Complete final regression, security, privacy, and dependency reviews.

### Exit criteria

- [ ] The primary demo succeeds repeatedly on a physical Android device.
- [ ] The offline/degraded fallback succeeds without cloud credentials.
- [ ] Critical recovery and deletion flows are demonstrated.
- [ ] Documentation matches the released behavior with no unsupported claims.

---

## Current next actions

1. Begin Milestone 4 with a device-independent feature and policy interface.
2. In parallel, run the unchecked M2/M3 Firebase, Speech-to-Text, and physical Android validations.
3. Preserve the manual assistance path and demo mode while adding automatic signals.
4. Record latency and false-positive baselines before choosing M4 thresholds.

## Current validation snapshot

- [x] Backend test suite: 9 tests passing.
- [x] TypeScript type checking passing.
- [x] Expo web export passing.
- [x] Expo Android export passing.
- [x] Demo browser session/transcript smoke test passing.
- [x] Secret-pattern scan and Git whitespace validation passing.
- [ ] Deployed Firebase/Google Cloud end-to-end test.
- [ ] Physical Android audio and authentication test.
- [ ] Production security, privacy, retention, observability, and performance validation.
