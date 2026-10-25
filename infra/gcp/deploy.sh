#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
REGION="${GCP_REGION:-us-central1}"
DEPLOY_ENV="${DEPLOY_ENV:-development}"
if [[ "$DEPLOY_ENV" != "development" && "$DEPLOY_ENV" != "production" ]]; then
  echo "DEPLOY_ENV must be development or production" >&2
  exit 2
fi
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PROJECT="$GOOGLE_CLOUD_PROJECT"
AUTH_MODE="${AUTH_MODE:-demo}"
if [[ "$DEPLOY_ENV" == "production" && "$AUTH_MODE" != "firebase" ]]; then
  echo "Production deployment requires AUTH_MODE=firebase" >&2
  exit 2
fi
SERVICE_SUFFIX="dev"
[[ "$DEPLOY_ENV" == "production" ]] && SERVICE_SUFFIX="prod"
API_SERVICE="cowingman-api-$SERVICE_SUFFIX"
WEB_SERVICE="cowingman-web-$SERVICE_SUFFIX"
ACCOUNT_NAME="cowingman-$SERVICE_SUFFIX-runtime"
ACCOUNT="$ACCOUNT_NAME@$PROJECT.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com speech.googleapis.com aiplatform.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudtrace.googleapis.com --project "$PROJECT"
if [ "$AUTH_MODE" = "firebase" ]; then
  gcloud services enable identitytoolkit.googleapis.com --project "$PROJECT"
fi
if ! gcloud iam service-accounts describe "$ACCOUNT" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$ACCOUNT_NAME" --project "$PROJECT"
fi
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/datastore.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/speech.client --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/aiplatform.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/logging.logWriter --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/monitoring.metricWriter --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/cloudtrace.agent --condition=None >/dev/null
if ! gcloud firestore databases describe --database='(default)' --project "$PROJECT" >/dev/null 2>&1; then
  gcloud firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --project "$PROJECT"
fi
gcloud firestore fields ttls update expires_at --collection-group="cowingman-$SERVICE_SUFFIX" --enable-ttl --project "$PROJECT"
RUNTIME_ENV="APP_MODE=live,AUTH_MODE=$AUTH_MODE,FIREBASE_PROJECT_ID=$PROJECT,FIRESTORE_COLLECTION=cowingman-$SERVICE_SUFFIX,GOOGLE_CLOUD_PROJECT=$PROJECT,SPEECH_LOCATION=us,SPEECH_LANGUAGE=en-US,INFERENCE_PROVIDER=gemma,GEMMA_MODEL=google/gemma-3-27b-it,GEMMA_LOCATION=global,LOG_FORMAT=json,SESSION_ACCESS_TTL_HOURS=2,SESSION_STORAGE_TTL_DAYS=1,SUMMARY_OBJECT_TTL_DAYS=30,EDGE_RATE_LIMIT_PER_MINUTE=180,PROVIDER_BUDGET_PER_MINUTE=60"
if [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]]; then
  RUNTIME_ENV="$RUNTIME_ENV,OTEL_ENABLED=true,OTEL_SERVICE_NAME=$API_SERVICE,OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT,OTEL_SAMPLE_RATIO=${OTEL_SAMPLE_RATIO:-0.1}"
fi
if [[ -n "${SUMMARY_BUCKET:-}" ]]; then
  if ! gcloud storage buckets describe "gs://$SUMMARY_BUCKET" --project "$PROJECT" >/dev/null 2>&1; then
    gcloud storage buckets create "gs://$SUMMARY_BUCKET" --project "$PROJECT" --location "$REGION" --uniform-bucket-level-access
  fi
  gcloud storage buckets update "gs://$SUMMARY_BUCKET" --lifecycle-file infra/gcp/storage-lifecycle.json
  gcloud storage buckets add-iam-policy-binding "gs://$SUMMARY_BUCKET" --member="serviceAccount:$ACCOUNT" --role=roles/storage.objectAdmin >/dev/null
  RUNTIME_ENV="$RUNTIME_ENV,SUMMARY_BUCKET=$SUMMARY_BUCKET"
fi
DEPLOY_ARGS=(run deploy "$API_SERVICE" --source backend --region "$REGION" --project "$PROJECT" --service-account "$ACCOUNT" --port 8000 --memory 512Mi --cpu 1 --min 0 --max 3 --concurrency 40 --timeout 60 --allow-unauthenticated --set-env-vars "$RUNTIME_ENV")
if [[ -n "${GEMINI_SECRET:-}" ]]; then
  gcloud secrets add-iam-policy-binding "$GEMINI_SECRET" --project "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor >/dev/null
  DEPLOY_ARGS+=(--set-secrets "GEMINI_API_KEY=$GEMINI_SECRET:latest")
fi
gcloud "${DEPLOY_ARGS[@]}"
API_URL="$(gcloud run services describe "$API_SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
gcloud run services update "$API_SERVICE" --region "$REGION" --project "$PROJECT" --update-env-vars "PUBLIC_BASE_URL=$API_URL"
EXPO_PUBLIC_API_URL="$API_URL" EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run build --prefix mobile
STAGING="$(mktemp -d /tmp/cowingman-web.XXXXXX)"
mkdir -p "$STAGING/mobile"
cp -R mobile/dist "$STAGING/mobile/dist"
cp infra/gcp/frontend.Dockerfile "$STAGING/Dockerfile"
gcloud run deploy "$WEB_SERVICE" --source "$STAGING" --region "$REGION" --project "$PROJECT" --port 80 --memory 256Mi --cpu 1 --min 0 --max 3 --concurrency 80 --timeout 30 --allow-unauthenticated
WEB_URL="$(gcloud run services describe "$WEB_SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
gcloud run services update "$API_SERVICE" --region "$REGION" --project "$PROJECT" --update-env-vars "CORS_ORIGINS=$WEB_URL"
API_URL="$API_URL" WEB_URL="$WEB_URL" bash infra/gcp/smoke.sh
printf '\nWebsite: %s\nAPI: %s\n' "$WEB_URL" "$API_URL"
