# Co-Wingman

A quiet conversation companion: live context first, two questions and a gentle suggestion when you need a nudge. Built from the Co-Wingman blueprint with an Expo/React Native client (including web) and a FastAPI backend.

## Run locally

Requires Python 3.12 and Node 20.19+.

```bash
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm ci --prefix mobile --cache /tmp/wings-npm-cache
.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
# In another terminal:
cd mobile
EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run web
```

Open the Expo-provided web address. Start a conversation, tap the mic to insert the demo sample, and select **Get me unstuck**. Alternatively enter your own conversation text. Cue cards replay with device speech. Enable topic notes before starting to retain summary notes; the Personal notes view can delete the current contact's notes. End clears session fragments.

The default is an explicit **demo mode**: local SQLite storage, topic-based preset cues, keyword summaries, and device speech. It makes no AI provider calls. It is not a simulation of clinical anxiety detection. Microphone transcription is only available with live providers.

## Validation

```bash
.venv/bin/pytest backend -q
npm run typecheck --prefix mobile
EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run build --prefix mobile
curl http://localhost:8000/readyz
```

## Live providers and Google Cloud

Use [the Google Cloud deployment guide](infra/gcp/README.md) and `infra/gcp/deploy.sh`. The active target is Cloud Run, Firestore, and Secret Manager, with optional Cloud Storage summaries. The AWS files are retained only as historical references; do not run them with this backend.

Configure server-side environment variables from `backend/.env.example` in your runtime. Environment files are not automatically loaded. Set `APP_MODE=live`, `GEMINI_API_KEY`, and `FIRESTORE_COLLECTION=cowingman`. Google libraries use Application Default Credentials and the Cloud Run service account. Enable Firestore TTL on `expires_at` for session cleanup. Contact notes have no TTL and are kept until deleted. Optional `SUMMARY_BUCKET` enables summary-only Cloud Storage writes; failures do not block the end response. Never put keys in the mobile app.

The Gemini cue model defaults to `gemini-2.5-flash` (override with `GEMINI_MODEL`); this implementation does not assume Gemma supports structured output. Voice uses Gemini's preview TTS model, which must be available to your project. Transcription uses Google Cloud Speech-to-Text V2 with `chirp_3` and service-account authentication. Provider integrations are implemented but need credentials for validation. `/readyz` tests storage and provider model-list authorization in live mode; it does not guarantee inference quota.

Build `backend/Dockerfile` from the backend directory for a port-8000 container. Cloud Run deployment, Secret Manager injection, least-privilege IAM, alarms, Sentry, and HTTPS hosting still need provisioning. Set `CORS_ORIGINS` to your actual frontend origins. Set `EXPO_PUBLIC_API_URL` before starting or exporting the mobile app. A real device needs a reachable HTTPS backend, not localhost. Local HTTP is for loopback development only.

Session bearer tokens are random, stored hashed, expire after two hours, and are required for all session operations. Session updates use optimistic concurrency; a conflicting request receives 409 and can be retried. Per-session throttling is persisted. Session creation is public for the demo; add real user authentication and gateway abuse limits before public deployment. The client identity is a local capability, not an account login. Clear device storage and you lose access to associated notes. Persistent native identity and cloud voice playback on native remain follow-up work.

Recent transcript context is capped to 800 characters before cue generation, with a separate background cap of 400. Crossing the window threshold triggers topic summarization; old fragments are removed. Active session fragments are stored in Firestore in live mode (not merely process memory). Audio is forwarded in memory and not saved. Provider retention policies still apply. Arrange participant awareness and consent before recording.

## Native builds

```bash
cd mobile
npx expo start
# With an Expo/EAS account and configured project:
npx eas-cli build --platform android --profile preview
```

The preview profile requests an APK. No APK has been built or published. Native recording uses expo-av metering for pause detection where the platform supports it; manual stop remains available. Recording stops after a pause and must be restarted for the next turn. Web metering is not available consistently, so use manual stop. Native permission behavior and VAD thresholds need device testing. NFC, résumé parsing, LinkedIn enrichment, and native continuous listening are not implemented; LinkedIn is a contact identifier only. No scraping occurs.

## Layout

- `mobile/App.tsx`: responsive Expo app, contact setup, transcript, cues, voice, privacy and notes.
- `backend/app/main.py`: authenticated session API, storage adapters, summaries, providers, rate limits.
- `backend/test_app.py`: session lifecycle, isolation, context cap, note deletion, cleanup and rate limits.

This is a working local MVP, not a production deployment. Live Google Cloud/provider integrations, device builds, monitoring, and load testing have not been validated.
