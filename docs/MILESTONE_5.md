# Milestone 5 — Gemma Conversation Intelligence

## Provider decision

The supported Gemma path is `google/gemma-3-27b-it` through Vertex AI Model Garden's OpenAI-compatible chat-completions endpoint in the `global` location. The backend authenticates with Google Application Default Credentials and the Cloud Run runtime service account; no model API key is placed in the client. `GEMMA_BASE_URL` can point to another OpenAI-compatible, authorized host such as a future NaviGator endpoint, but compatibility must be verified before use.

The deployed project must enable `aiplatform.googleapis.com` and grant the runtime identity `roles/aiplatform.user`. Model availability, acceptable-use terms, quota, token pricing, regional processing, cold-start behavior, and concurrency have not been verified against a real project. Check the current Vertex AI model card, quota page, and pricing page before deployment; these can change independently of the repository.

## Reliability and fallback

The Gemma adapter uses a 20-second configurable timeout, up to two bounded retries for transient transport, rate-limit, and 5xx failures, and a 30-second circuit after three exhausted calls. Invalid JSON, schema failures, unsafe categories/content, duplicates, and provider failures produce deterministic bounded cues instead of blocking the live conversation. The fallback is clearly reported by the API.

Gemini remains a separately implemented adapter for compatibility. Selecting Gemma does not reuse Gemini's REST request. Device speech remains the mobile voice path.

## Context and safety

Context is assembled in this order: recent fragments, running summary, opted-in contact notes, short contact context, then selected profile background. Each layer has an independent hard character cap. The full résumé summary, email, portfolio URL, full profile, and unrelated history are excluded. All context is escaped and enclosed as untrusted data, with a separate system instruction prohibiting obedience to embedded instructions.

Cue output supports `question`, `transition`, `talking_point`, and `experience`. It requires two to four unique cues, each no longer than 160 characters. Validation rejects unsupported categories and explicit diagnostic, sensitive-trait, manipulative, deceptive, or impersonation language. This is a narrow filter plus provider prompting, not a complete safety classifier.

## Summaries

Session state schedules an independent checkpoint approximately every `SUMMARY_CHECKPOINT_SECONDS` (120 seconds by default). A sequence claim prevents duplicate application, and the task folds only the fragment prefix it claimed so newer speech is preserved. Cue requests do not wait on checkpoints. Finalization returns a bounded topic summary and optional low-pressure follow-up draft. Contact notes are merged only when the user opted in.

## Local evaluation and remaining work

The repository includes networking, recruiting, student, and social scenarios. Tests cover Vertex request shape, ADC token use, retry/circuit behavior, context bounds and ordering, prompt-injection escaping, résumé exclusion, output validation, deterministic fallback, and concurrent checkpoint preservation.

Live Gemma quality has not been measured. Before calling this production-ready, evaluate relevance, hallucinations, profile grounding, verbosity, safety, latency, quotas, and cost with consented scenarios and the deployed project. Compare the same inputs against the deterministic fallback and record reviewer criteria before testing.
