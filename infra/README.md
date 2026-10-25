# AWS deployment

Legacy reference only. The backend now uses Google Cloud. Use [gcp/README.md](gcp/README.md) instead; this AWS workflow is incompatible with the current backend.

This stack creates DynamoDB session storage, a 30-day summary bucket, ECR, App Runner, and a private S3/CloudFront web frontend. DynamoDB and summaries are retained if the stack is deleted; the web build is disposable. The App Runner role is limited to this table, summary prefix, and two generated Secrets Manager secrets.

Prerequisites: an AWS identity with permission to manage CloudFormation, IAM, ECR, App Runner, DynamoDB, S3, CloudFront, and Secrets Manager; Docker; Python dependencies from `backend/requirements.txt`; and server-side Gemini and Groq API keys. AWS charges apply. Use a dedicated development account or role with a budget alarm.

Choose a region and deploy the foundation:

```bash
export AWS_REGION=us-east-1
.venv/bin/python infra/deploy.py --foundation
```

Review the created resources. Then make the provider keys available to the deployment process without writing them to a file:

```bash
export GEMINI_API_KEY='...'
export GROQ_API_KEY='...'
.venv/bin/python infra/deploy.py --application
```

The application phase builds and pushes the backend container, updates the stack, exports the web app with the App Runner URL, uploads it to the private site bucket, and invalidates CloudFront. Its final JSON output contains `WebUrl` and `ApiUrl`.

Do not commit provider keys. CloudFormation receives them as `NoEcho` parameters and stores them in Secrets Manager. They can still be seen by principals allowed to retrieve the secrets. Rotate them in Secrets Manager and redeploy the App Runner service after rotation.

This environment currently has no AWS identity, so the template has not been deployed or validated against an AWS account. Before public use, add end-user authentication, an AWS WAF or gateway-level creation limit, monitoring alarms, a custom domain, and a retention/consent policy appropriate to microphone data.
