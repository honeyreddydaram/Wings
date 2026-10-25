# Google Cloud deployment

Transcription configuration: enable `speech.googleapis.com`; grant the runtime service account `roles/speech.client`; set `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION=us`, and `SPEECH_LANGUAGE=en-US`. The deployment script does this automatically. No Groq key or separate Google transcription key is required. The Speech location `us` is separate from the Cloud Run region `us-central1`.

This integration uses synchronous recognition of completed recordings, not streaming. Keep chunks under 60 seconds and 8 MB. Browser WebM/Opus and native audio formats need live-device verification with Chirp 3. `/readyz` checks Firestore and inference authentication only; a successful audio request is required to validate Speech permissions, quota and model availability. Cloud transcription has not yet been tested with project credentials.

The active deployment targets Cloud Run for the API and web app and Firestore for session state and personal notes. Vertex AI Gemma 4 12B generates cues and summaries using the Cloud Run service account via a dedicated endpoint; Google Speech-to-Text V2 Chirp 3 transcribes audio. Device speech provides cue voice. SQLite demo mode still works without cloud credentials.

The API also serves public digital-card pages, QR images, and vCards. `PUBLIC_BASE_URL` must be its externally reachable HTTPS origin; `deploy.sh` updates this automatically after Cloud Run assigns the API URL. Public card routes are intentionally unauthenticated, while card editing and exchanged-contact routes use Firebase identity in a production configuration.

Firebase authentication is optional during deployment. Enable Email/Password in the Firebase console, export `AUTH_MODE=firebase`, and provide every `EXPO_PUBLIC_FIREBASE_*` value listed in `mobile/.env.example` before running the script. The backend uses Application Default Credentials to verify client ID tokens; no service-account key belongs in the mobile build. If `AUTH_MODE` is omitted, deployment preserves demo identity behavior.

1. Create separate Google Cloud projects for development and production-like use, link billing, and choose a region (default `us-central1`). Never point both environments at one Firestore database.
2. Authenticate the Google Cloud CLI using your deployment identity. It needs permission to enable APIs, deploy Cloud Run/source builds, create Firestore, manage the runtime service account, and grant the documented roles. Source builds also need the Cloud Build service account configured with Cloud Run builder permissions for your project's build policy.
3. Run from the repository root:

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GCP_REGION=us-central1
export DEPLOY_ENV=development # use production only with the separate production project
# Optional after Firebase client configuration is exported:
# export AUTH_MODE=firebase
bash infra/gcp/deploy.sh
```

The script creates environment-suffixed services, runtime identities, and Firestore collections. It enables Logging, Monitoring, and Trace APIs; installs the Firestore session TTL; optionally creates a lifecycle-managed summary bucket; deploys the API/web services; and runs smoke tests. Set `OTEL_EXPORTER_OTLP_ENDPOINT` only for a reviewed OTLP/HTTP collector and optionally set `OTEL_SAMPLE_RATIO`. Set `SUMMARY_BUCKET` to enable ephemeral summary objects. Set `GEMINI_SECRET` to a Secret Manager secret name only when using the Gemini compatibility path.

Install the Cloud Run dashboard and base 5xx alert after deployment:

```bash
bash infra/gcp/configure-monitoring.sh
```

Attach and test a notification channel in Cloud Monitoring. Configure a Cloud Billing budget separately; budget alerts notify but do not cap spend. The API provider budget, Cloud Run max instances, and provider quota are independent safeguards.

The script creates a runtime service account with Firestore, Speech-to-Text, and Vertex AI access. Firestore session documents have an `expires_at` TTL timestamp; profiles and personal notes remain until deleted. Transactions reject stale session updates. Cloud Run services have public HTTPS endpoints; use Firebase mode plus gateway abuse protection before a public production launch.

Optional summary storage is off by default. When `SUMMARY_BUCKET` is exported, the script creates or updates a uniform-access bucket with the repository's 30-day summary lifecycle and grants the environment runtime identity object administration on that bucket only. Delete permission is required for account erasure.

Cloud Run scales to zero with a maximum of three instances per service. Billing applies to builds, storage and traffic as well as runtime. No cloud resources have been deployed or provider requests verified by this repository work.

After each release, keep the previous revision name. Roll back with `REVISION=<known-good> DEPLOY_ENV=<environment> bash infra/gcp/rollback.sh`. Export Firestore with `BACKUP_BUCKET=<private-bucket> bash infra/gcp/backup.sh` and rehearse restoration only in an isolated development project. See the runbooks under `docs/runbooks/`.

Cloud Run remains publicly reachable because public cards and the authenticated mobile API share one service. Before production traffic, place it behind a supported distributed edge control, prevent direct-origin bypass, verify Firebase/IAM/Secret Manager rules, and test CORS and any custom HTTPS domain. The in-process limiter is not a distributed denial-of-service control.

The old files directly under `infra/` are retained as legacy AWS references and must not be used for this backend.
