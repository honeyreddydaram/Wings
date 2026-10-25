# API Contracts

Base URL in local development: `http://localhost:8000`. JSON is used except for audio upload and WAV playback. FastAPI also exposes generated OpenAPI documentation at `/docs` while the application is running.

All `/session/{sid}/...` operations require `Authorization: Bearer <token>` except session creation. The token is returned once by session creation. Common session errors are `401` invalid token, `410` expired/ended session, `429` per-session limit exceeded, and `409` concurrent session update. Validation failures return FastAPI’s standard `422` detail envelope.

## Health

### `GET /healthz`

Process liveness. No authentication. Returns `200`:

```json
{"status":"ok","mode":"demo"}
```

### `GET /readyz`

Dependency readiness. No authentication. Demo mode checks SQLite and reports providers as simulated. Live mode checks storage and Gemini model-list authorization.

Success (`200`):

```json
{"ready":true,"mode":"demo","checks":{"storage":true,"providers":"simulated"}}
```

Live dependency failure returns `503` with `ready: false` and Boolean `storage`/`gemini` checks. This does not validate Speech-to-Text or inference quota.

## Sessions

### `POST /session/start`

Creates a session. No session authentication (a known pre-M2 gap).

Request:

```json
{"name":"Alex","context":"Met at Gator Hacks","contact":"optional label","remember":false,"owner":"minimum-24-character-device-capability"}
```

`name` ≤100 chars, `context` ≤600, `contact` ≤300, and `owner` is 24–128 chars. Response `200`:

```json
{"id":"uuid","token":"opaque bearer token","memory":"","mode":"demo"}
```

Possible errors: `422` invalid input; storage/concurrency failures may surface as server errors or `409`.

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

Transcribes one completed audio chunk, then applies the transcript contract. Requires bearer token. Send multipart form data with field `file`. The configured default maximum is 8 MiB.

Response `200` is the transcript response above. Errors: `413` too large; `422` no speech; `502` transcription unavailable; `503` disabled in demo; common session errors. Raw audio is not intentionally persisted by this handler.

### `POST /session/{sid}/cue`

Generates two questions and one suggestion from bounded context. Requires bearer token; request body is empty.

Response `200`:

```json
{"cues":[{"category":"question","text":"...","id":"uuid"}],"signal":"low","demo":true}
```

The implementation returns three cues. Errors: `409` no conversation context; `502` live provider unavailable; common session errors.

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
{"summary":"Topics discussed: ...","saved":false}
```

Optional Cloud Storage failure does not fail the response. Provider summary failure in live mode can return `503`/provider-derived failure; common session errors also apply. Further session calls return `410`.

## Future proposals (not implemented)

M2 may add authenticated profile endpoints; M3 may add streaming transport; M6 may add card/QR/vCard endpoints. These are intentionally excluded from the current contract until implemented.
