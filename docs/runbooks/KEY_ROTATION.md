# Key and Credential Rotation

Cloud Run should use its attached service account and Application Default Credentials, not downloaded service-account keys. Inventory Secret Manager versions, Firebase client restrictions, CI identities, domain/DNS access, OTLP exporter credentials, and any Gemini compatibility secret.

For a secret: create a new Secret Manager version, grant only the environment runtime identity access, deploy a new revision pinned to `latest` or the reviewed version, run smoke tests, disable the old version, observe errors, then destroy it after the recovery window. For a suspected compromise, disable first and accept temporary provider fallback.

For IAM: create the replacement identity/permission, deploy and verify, remove the old binding, then inspect Cloud Audit Logs. Never paste secret values into logs, issues, commits, build arguments, or mobile `EXPO_PUBLIC_*` variables.
