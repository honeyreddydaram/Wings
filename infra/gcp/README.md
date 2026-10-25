# Google Cloud deployment

Transcription configuration: enable `speech.googleapis.com`; grant the runtime service account `roles/speech.client`; set `GOOGLE_CLOUD_PROJECT`, `SPEECH_LOCATION=us`, and `SPEECH_LANGUAGE=en-US`. The deployment script does this automatically. No Groq key or separate Google transcription key is required. The Speech location `us` is separate from the Cloud Run region `us-central1`.

This integration uses synchronous recognition of completed recordings, not streaming. Keep chunks under 60 seconds and 8 MB. Browser WebM/Opus and native audio formats need live-device verification with Chirp 3. `/readyz` checks Firestore and inference authentication only; a successful audio request is required to validate Speech permissions, quota and model availability. Cloud transcription has not yet been tested with project credentials.

The active deployment targets Cloud Run for the API and web app and Firestore for session state and personal notes. Vertex AI Gemma 3 27B IT generates cues and summaries using the Cloud Run service account; Google Speech-to-Text V2 Chirp 3 transcribes audio. Device speech provides cue voice. SQLite demo mode still works without cloud credentials.

Firebase authentication is optional during deployment. Enable Email/Password in the Firebase console, export `AUTH_MODE=firebase`, and provide every `EXPO_PUBLIC_FIREBASE_*` value listed in `mobile/.env.example` before running the script. The backend uses Application Default Credentials to verify client ID tokens; no service-account key belongs in the mobile build. If `AUTH_MODE` is omitted, deployment preserves demo identity behavior.

1. Select or create a Google Cloud project and link billing. Choose a region (default `us-central1`).
2. Authenticate the Google Cloud CLI using your deployment identity. It needs permission to enable APIs, deploy Cloud Run/source builds, create Firestore, manage the runtime service account, and grant the documented roles. Source builds also need the Cloud Build service account configured with Cloud Run builder permissions for your project's build policy.
3. Run from the repository root:

```bash
export GOOGLE_CLOUD_PROJECT=your-project-id
export GCP_REGION=us-central1
# Optional after Firebase client configuration is exported:
# export AUTH_MODE=firebase
bash infra/gcp/deploy.sh
```

The script creates a runtime service account with Firestore, Speech-to-Text, and Vertex AI access. Firestore session documents have an `expires_at` TTL timestamp; profiles and personal notes remain until deleted. Transactions reject stale session updates. Cloud Run services have public HTTPS endpoints; use Firebase mode plus gateway abuse protection before a public production launch.

Optional summary storage: create a private Cloud Storage bucket with a 30-day lifecycle policy, grant the runtime service account `roles/storage.objectCreator` on that bucket only, then set `SUMMARY_BUCKET` on the API service. This is off by default.

Cloud Run scales to zero with a maximum of three instances per service. Billing applies to builds, storage and traffic as well as runtime. No cloud resources have been deployed or provider requests verified by this migration. The old files under `infra/` are retained as legacy AWS references and must not be used for this backend.
