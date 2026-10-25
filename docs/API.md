# API Contracts

Base URL in local development: `http://localhost:8000`. JSON is used except for audio upload and WAV playback. FastAPI also exposes generated OpenAPI documentation at `/docs` while the application is running.

All `/session/{sid}/...` operations require the session capability in `Authorization: Bearer <token>`. In Firebase auth mode, `/session/start` and `/profile/me` instead require a Firebase ID token in that header. Demo profile calls use `X-Demo-Owner`; that header is explicitly not production authentication. Common session errors are `401` invalid token, `410` expired/ended session, `429` per-session limit exceeded, and `409` concurrent session update. Validation failures return FastAPI’s standard `422` detail envelope.

## Health

### `GET /healthz`

Process liveness. No authentication. Returns `200`:

```json
{"status":"ok","mode":"demo"}
```

### `GET /readyz`

Dependency readiness. No authentication. Demo mode checks SQLite and reports providers as simulated. Live mode checks storage and configured inference-provider authorization.

Success (`200`):

```json
{"ready":true,"mode":"demo","checks":{"storage":true,"providers":"simulated"}}
```

Live dependency failure returns `503` with `ready: false` and Boolean storage/inference-auth checks. This does not validate Speech-to-Text or inference quota.

## Profile

### `GET /profile/me`

Returns the current user’s persistent professional profile. Authentication is Firebase bearer token or the demo identity header described above. An absent profile returns `200` with empty fields rather than `404`.

### `PUT /profile/me`

Replaces the current user’s profile. Authentication is required.

```json
{"display_name":"Avery","headline":"CS student","organization":"University","skills":["Python"],"interests":["AI"],"networking_goals":"Meet ML engineers","accomplishments":"Built a campus app","portfolio_url":"https://example.com","resume_summary":"Backend and ML experience"}
```

Strings and lists are bounded; portfolio URLs must use HTTP or HTTPS. The response adds trusted `email` when available and `updated_at`. Errors: `401` missing/invalid identity and `422` invalid fields.

### `DELETE /profile/me`

Deletes the current user’s stored profile and returns `{"deleted":true}`. This does not delete the Firebase account, conversation sessions, or provider-held data.

## Sessions

### `POST /session/start`

Creates a session. Firebase mode requires and verifies a Firebase ID token; the trusted UID becomes the session owner. Demo mode retains the local owner capability for credential-free development.

Request:

```json
{"name":"Alex","context":"Met at Gator Hacks","contact":"optional label","remember":false,"owner":"minimum-24-character-device-capability"}
```

`name` ≤100 chars, `context` ≤600, and `contact` ≤300. `owner` is required only in demo mode and must be 24–128 chars there; it is ignored as an identity claim in Firebase mode. Response `200`:

```json
{"id":"uuid","token":"opaque bearer token","memory":"","mode":"demo"}
```

Possible errors: `422` invalid input; storage/concurrency failures may surface as server errors or `409`.

### `GET /session/{sid}/status`

Revalidates a stored active-session capability during app recovery. Requires the session bearer token and returns no transcript, cue text, contact identity, or profile data.

```json
{"active":true,"mode":"demo","memory":"","signal":"low","has_context":false,"expires_at":1792944000.0}
```

The client restores display state only. It never resumes microphone capture automatically. Errors are the common session errors, including `401` for a wrong capability and `410` for an expired or ended session.

### `POST /session/{sid}/transcript`

Adds recent text and updates the current assistance signal. Requires bearer token.

Request:

```json
{"text":"Conversation fragment","pause_count":0}
```

`text` is 1–2000 chars; `pause_count` is 0–100. Response `200`:

```json
{"text":"Conversation fragment","signal":"low","window_chars":21}
```

The text is echoed for client compatibility. Long active context is summarized and reduced to a bounded recent window. Errors: common session errors and `422` validation.

### `POST /session/{sid}/audio`

Transcribes one short completed audio chunk, then applies the transcript contract. Requires bearer token. Send multipart form data with `file`, non-negative integer `chunk_index`, and optional non-negative `captured_at_ms`. `chunk_index` defaults to `0` for older clients. Supported content types are M4A/MP4, WebM, and generic binary. The configured default maximum is 8 MiB.

Response `200` extends the transcript response:

```json
{"text":"Conversation fragment","signal":"low","window_chars":21,"chunk_index":7,"duplicate":false}
```

The server retains results for the latest 32 chunk indexes in session state. Retrying an accepted index returns the cached response with `duplicate: true` without retranscribing or duplicating context. Errors: `413` too large; `415` unsupported media type; `422` no speech/invalid form; `502` transcription unavailable; `503` disabled in demo; common session errors. Raw audio is not intentionally persisted by this handler.

### `POST /session/{sid}/cue`

Generates two to four bounded cues from recent conversation first, plus limited opted-in background. Categories are `question`, `transition`, `talking_point`, and `experience`. Requires bearer token; request body is empty.

Response `200`:

```json
{"cues":[{"category":"question","text":"...","id":"uuid"}],"signal":"low","fallback":false}
```

The implementation normally returns three cues. Malformed, unsafe, or unavailable provider output returns deterministic cues with `fallback: true`. Errors: `409` no conversation context and common session errors.

### `POST /session/{sid}/cue/{cid}/speak`

Synthesizes a cue in live mode. Requires bearer token; request body is empty. Success is `200 audio/wav`. Errors: `404` cue missing; `502` voice unavailable; `503` demo uses device speech; common session errors.

### `DELETE /session/{sid}/memory`

Deletes the current contact’s saved note and disables remembering for this session. Requires bearer token. Response `200`:

```json
{"deleted":true}
```

Errors: common session errors.

### `POST /session/{sid}/end`

Creates the final bounded summary, optionally updates contact notes, clears active fragments/cues/memory from the session, and marks it ended. Requires bearer token; request body is empty.

Response `200`:

```json
{"summary":"Topics discussed: ...","follow_up":"It was great talking...","saved":false}
```

Optional Cloud Storage failure does not fail the response. Provider summary failure uses a bounded deterministic summary and follow-up. Common session errors still apply. Further session calls return `410`.

## Public cards

Authenticated card management uses the same Firebase bearer token or demo identity header as profiles.

- `GET /card/me` creates or returns the caller's separate card draft.
- `PUT /card/me` replaces card fields, per-field visibility, and `published`. A visible name is required to publish.
- `POST /card/me/rotate` invalidates the previous unguessable URL and returns a new one.
- `DELETE /card/me` immediately unpublishes and rotates the URL.

The following read-only routes are public and rate limited. Unpublished, revoked, malformed, and old rotated links return `404` without disclosing their state.

- `GET /c/{slug}` returns a responsive HTML card with restrictive browser headers and no Wings account requirement.
- `GET /c/{slug}/data` returns only the owner's currently visible fields.
- `GET /c/{slug}/qr.svg` returns a standards-based QR code containing the public URL.
- `GET /c/{slug}.vcf` downloads a vCard 3.0 file containing only visible fields.

Set `PUBLIC_BASE_URL` to the externally reachable HTTPS API origin before publishing cards.

## Exchanged contacts

All contact routes require an authenticated identity and use a separate owner-isolated record collection.

- `GET /contacts?q=` lists or searches the caller's saved snapshots and notes.
- `POST /contacts` saves a confirmed public-card snapshot with `source`, exchange time, and private notes.
- `PUT /contacts/{id}` updates private user notes.
- `POST /contacts/{id}/conversation-note` explicitly attaches a user-selected note; conversations are never linked automatically.
- `DELETE /contacts/{id}` deletes one saved contact.
- `GET /contacts.vcf` exports the caller's contacts as concatenated vCards.

Cross-owner IDs return `404`. Contact creation accepts only the documented bounded snapshot, source, and note fields.
# Privacy and account deletion

- `GET /privacy/me` requires demo/Firebase identity and returns counts plus the active retention policy, never record contents.
- `DELETE /account/me` requires demo/Firebase identity and deletes owned application records, public-card pointer, optional summary objects, and Firebase identity where configured. A 503 means external cleanup needs operator follow-up.
