# Backup and Restore

Create a separate private backup bucket with uniform access, lifecycle policy, and an operator-only restoration role. Set `BACKUP_BUCKET` and run `infra/gcp/backup.sh`. Firestore export is asynchronous; verify completion in Cloud Logging and record the export URI without copying record contents.

Restore rehearsals must use an isolated development project. Import the selected export with `gcloud firestore import`, validate document counts and application ownership isolation, run API smoke and deletion tests, then destroy the rehearsal project/data according to policy. Never test restore directly over the production database.

Cloud Storage summaries are ephemeral 30-day objects and are not included in the Firestore export. Decide explicitly whether they should be excluded from backup; the default is exclusion.
