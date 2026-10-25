# Milestone 6 — Digital Identity and Contact Exchange

## Data boundaries

The professional profile remains private and serves authenticated personalization. The public card is a separate record with bounded name, headline, organization, email, phone, website, and bio fields. Every public field has its own visibility switch, and publishing has a separate global switch. Public responses are projections created at request time, so hiding a field takes effect without changing saved contact snapshots that another user previously consented to keep.

Card URLs use a cryptographically random 24-character URL-safe slug. Rotation invalidates the old mapping and retains publish state; revocation unpublishes and rotates in one operation. Malformed, old, revoked, and unpublished URLs all return the same `404`. Public reads have a per-instance IP rate limit, restrictive browser headers, escaped output, and `noindex` metadata. Milestone 7 still needs an API-edge distributed limiter for multi-instance deployment.

## Exchange behavior

Published cards expose responsive HTML, JSON for a validated scanner preview, an SVG QR code, and vCard 3.0. A recipient does not need Wings to open the HTML page or download the vCard. The Android/web app renders the card QR locally, requests camera permission only when scanning begins, accepts only QR codes on the configured API origin with the exact Wings slug shape, fetches the current public projection, and requires a separate **Save contact** action.

Managed Expo does not offer a reliable universal phone-to-phone NFC exchange contract. No native NFC claim is made. The UI explains that compatible pre-written NDEF tags may open a URL on supported hardware and always presents QR, public link, and vCard alternatives. Target Android device/OS testing remains required before enabling any NFC writer or reader flow.

## Contacts

Contact records are keyed by the authenticated owner and contain a random ID, source, exchange timestamp, consented public-card snapshot, private user notes, and an optional explicitly attached conversation note. APIs and UI support search, note editing, aggregate vCard export, and deletion. Cross-owner access returns `404`. Conversation summaries are attached only when the user selects the action after a completed conversation; no automatic matching occurs. Wings does not fetch or scrape LinkedIn or any other third-party profile service.

## Validation and remaining work

Automated tests cover per-field projection, public HTML escaping and security headers, QR/vCard responses, rotation/revocation, invalid slugs, owner isolation, search, editing, explicit note attachment, export, and deletion. TypeScript, mobile unit tests, web export, and Android export verify the client builds with camera and QR dependencies.

Physical-device validation is still required for camera focus, low-light QR scans, denied/permanently-denied permission recovery, deep-link behavior, and the tested Android versions. NFC capability is deliberately documentation-only until that evaluation is completed. `PUBLIC_BASE_URL` must be the deployed HTTPS API URL; the Google Cloud deployment script sets it after Cloud Run assigns the service URL.
