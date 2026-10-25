#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
REGION="${GCP_REGION:-us-central1}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PROJECT="$GOOGLE_CLOUD_PROJECT"
AUTH_MODE="${AUTH_MODE:-demo}"
ACCOUNT="cowingman-runtime@$PROJECT.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com speech.googleapis.com --project "$PROJECT"
if [ "$AUTH_MODE" = "firebase" ]; then
  gcloud services enable identitytoolkit.googleapis.com --project "$PROJECT"
fi
if ! gcloud iam service-accounts describe "$ACCOUNT" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create cowingman-runtime --project "$PROJECT"
fi
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/datastore.user --condition=None >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/speech.client --condition=None >/dev/null
if ! gcloud firestore databases describe --database='(default)' --project "$PROJECT" >/dev/null 2>&1; then
  gcloud firestore databases create --database='(default)' --location="$REGION" --type=firestore-native --project "$PROJECT"
fi
gcloud firestore fields ttls update expires_at --collection-group=cowingman --enable-ttl --project "$PROJECT"
for secret in GEMINI_API_KEY; do
  gcloud secrets versions describe latest --secret="$secret" --project "$PROJECT" >/dev/null
  gcloud secrets add-iam-policy-binding "$secret" --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor --project "$PROJECT" >/dev/null
done
gcloud run deploy cowingman-api --source backend --region "$REGION" --project "$PROJECT" --service-account "$ACCOUNT" --port 8000 --memory 512Mi --cpu 1 --min 0 --max 3 --allow-unauthenticated --set-env-vars "APP_MODE=live,AUTH_MODE=$AUTH_MODE,FIREBASE_PROJECT_ID=$PROJECT,FIRESTORE_COLLECTION=cowingman,GOOGLE_CLOUD_PROJECT=$PROJECT,SPEECH_LOCATION=us,SPEECH_LANGUAGE=en-US" --set-secrets GEMINI_API_KEY=GEMINI_API_KEY:latest
API_URL="$(gcloud run services describe cowingman-api --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
EXPO_PUBLIC_API_URL="$API_URL" EXPO_HOME=/tmp/wings-expo EXPO_NO_TELEMETRY=1 npm run build --prefix mobile
STAGING="$(mktemp -d /tmp/cowingman-web.XXXXXX)"
mkdir -p "$STAGING/mobile"
cp -R mobile/dist "$STAGING/mobile/dist"
cp infra/gcp/frontend.Dockerfile "$STAGING/Dockerfile"
gcloud run deploy cowingman-web --source "$STAGING" --region "$REGION" --project "$PROJECT" --port 80 --memory 256Mi --cpu 1 --min 0 --max 3 --allow-unauthenticated
WEB_URL="$(gcloud run services describe cowingman-web --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
gcloud run services update cowingman-api --region "$REGION" --project "$PROJECT" --update-env-vars "CORS_ORIGINS=$WEB_URL"
curl --fail --silent --show-error "$API_URL/readyz"
printf '\nWebsite: %s\nAPI: %s\n' "$WEB_URL" "$API_URL"
