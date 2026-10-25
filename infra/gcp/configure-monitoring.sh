#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
gcloud monitoring dashboards create --project "$GOOGLE_CLOUD_PROJECT" --config-from-file "$ROOT/infra/gcp/monitoring-dashboard.json"
gcloud alpha monitoring policies create --project "$GOOGLE_CLOUD_PROJECT" --policy-from-file "$ROOT/infra/gcp/monitoring-alert-policy.json"
echo "Dashboard and base 5xx alert created. Attach a tested notification channel before production traffic."
