#!/usr/bin/env bash
set -euo pipefail
: "${GOOGLE_CLOUD_PROJECT:?Set your Google Cloud project ID}"
: "${BACKUP_BUCKET:?Set a private backup bucket name}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
gcloud firestore export "gs://$BACKUP_BUCKET/firestore/$STAMP" --project "$GOOGLE_CLOUD_PROJECT" --database='(default)'
echo "Firestore export started at gs://$BACKUP_BUCKET/firestore/$STAMP"
