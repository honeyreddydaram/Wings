# Milestone 2 — Android Application, Authentication, and Profiles

## Implemented scope

- Firebase email/password sign-up and sign-in through the Expo-compatible Firebase JS SDK.
- Platform-specific auth persistence: browser local persistence on web and AsyncStorage on native.
- Firebase Admin ID-token verification at the FastAPI boundary.
- Verified UID ownership for new sessions and persistent profiles.
- Separate conversation session capabilities retained as defense in depth.
- Authenticated profile get, replace, and delete contracts.
- Bounded profile fields for professional identity, skills, interests, goals, accomplishments, portfolio URL, and résumé summary.
- Profile and sign-in UI integrated into desktop and compact Android-oriented navigation.
- Persistent demo-device identity so the credential-free MVP remains useful across native restarts.
- Tests covering profile CRUD, identity isolation, missing authentication, and verified Firebase UID binding.

## Configuration modes

`AUTH_MODE=demo` is the default and requires no Firebase account. Profile calls use the local `X-Demo-Owner` capability and must never be treated as production security.

`AUTH_MODE=firebase` requires `FIREBASE_PROJECT_ID` (or `GOOGLE_CLOUD_PROJECT`) and Application Default Credentials on the backend. The client must receive all required `EXPO_PUBLIC_FIREBASE_*` web-app values. Client and backend modes must match.

## Explicitly deferred

- Google/Apple or other OAuth providers.
- Email verification enforcement, password reset UI, MFA, custom claims, and organization roles.
- Firebase account deletion and complete cross-store erasure.
- Hardware-backed storage for conversation session capabilities.
- Résumé file upload/parsing; M2 stores only a user-entered résumé summary.
- Profile-aware AI prompts, which belong to M5.
- Native-device and deployed-Firebase end-to-end validation, which requires project credentials and an Android build.

## M3 handoff

Audio work can treat the authenticated UID and persisted profile as stable application context. It should keep Firebase ID tokens at identity/profile boundaries, use the narrower session capability for an active conversation, and avoid sending profile data with every audio chunk.
