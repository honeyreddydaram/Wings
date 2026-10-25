#!/usr/bin/env bash
set -euo pipefail
: "${API_URL:?Set the deployed API URL}"
curl --fail --silent --show-error --retry 5 --retry-all-errors "$API_URL/healthz" >/dev/null
curl --fail --silent --show-error --retry 5 --retry-all-errors "$API_URL/readyz" >/dev/null
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$API_URL/c/not-a-valid-card")"
[[ "$status" == "404" ]] || { echo "Expected invalid public card to return 404, got $status" >&2; exit 1; }
if [[ -n "${WEB_URL:-}" ]]; then
  curl --fail --silent --show-error --retry 5 --retry-all-errors "$WEB_URL" >/dev/null
fi
echo "Deployment smoke tests passed."
