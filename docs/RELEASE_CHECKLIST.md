# Android Release Checklist

## Before building

- Complete every release-blocking row in [TEST_MATRIX.md](TEST_MATRIX.md).
- Use a separate production Google Cloud/Firebase project with reviewed IAM, quotas, budget alerts, retention, deletion, backup/restore, and notification channels.
- Set the production HTTPS API URL and public Firebase client configuration in the EAS environment. Never put service-account JSON, bearer tokens, Gemini secrets, or OTLP credentials in `EXPO_PUBLIC_*`.
- Review version name/code, privacy text, permissions, package identifier, dependency reports, source diff, and build provenance.

## Builds

```bash
cd mobile
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

The preview profile produces an internally distributed APK. The production profile produces an auto-incremented Android App Bundle. EAS account/project linkage and signing credentials are intentionally not stored in this repository.

## Verification

Install the preview on every target device. Verify clean install, upgrade, account creation/sign-in/out, SecureStore recovery, consent/recording/pause, typed fallback, audio transcript, manual/automatic cues, device speech, summary, card/QR/vCard, contact notes, privacy inventory, erasure, offline transition, backgrounding, accessibility, and crash-free 30-minute use.

Record the EAS build ID, source commit, signing certificate fingerprint, backend revision, environment, test evidence, approver, and release decision. Retain the prior Cloud Run revision and mobile artifact for rollback. Do not publish until privacy/legal review is complete.
