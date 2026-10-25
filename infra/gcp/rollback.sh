#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
: "${REVISION:?Set the known-good Cloud Run revision name}"
REGION="${GCP_REGION:-us-central1}"
DEPLOY_ENV="${DEPLOY_ENV:-development}"
SERVICE_SUFFIX="dev"
[[ "$DEPLOY_ENV" == "production" ]] && SERVICE_SUFFIX="prod"
SERVICE="${SERVICE:-cowingman-api-$SERVICE_SUFFIX}"
gcloud run services update-traffic "$SERVICE" --project "$GOOGLE_CLOUD_PROJECT" --region "$REGION" --to-revisions "$REVISION=100"
API_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$GOOGLE_CLOUD_PROJECT" --format='value(status.url)')"
API_URL="$API_URL" bash "$(dirname "$0")/smoke.sh"
