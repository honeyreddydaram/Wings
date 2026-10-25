#!/usr/bin/env python3
"""Deploy Co-Wingman to AWS using boto3 and Docker.

Run once with --foundation, then build/push and run with --application.
Secret values are read from the process environment and never written to disk.
"""

import argparse
import base64
import mimetypes
import json
import os
import pathlib
import subprocess
import sys
import time

import boto3
from botocore.exceptions import ClientError


ROOT = pathlib.Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "infra" / "cloudformation.yaml"


def run(*args: str, env: dict[str, str] | None = None) -> None:
    subprocess.run(args, cwd=ROOT, env=env, check=True)


def stack_outputs(cf, stack_name: str) -> dict[str, str]:
    stacks = cf.describe_stacks(StackName=stack_name)["Stacks"]
    return {item["OutputKey"]: item["OutputValue"] for item in stacks[0].get("Outputs", [])}


def deploy_stack(cf, stack_name: str, parameters: list[dict[str, str]]) -> None:
    body = TEMPLATE.read_text()
    kwargs = {
        "StackName": stack_name,
        "TemplateBody": body,
        "Parameters": parameters,
        "Capabilities": ["CAPABILITY_IAM"],
    }
    try:
        cf.describe_stacks(StackName=stack_name)
        cf.update_stack(**kwargs)
        waiter = cf.get_waiter("stack_update_complete")
    except ClientError as exc:
        if "does not exist" in str(exc):
            cf.create_stack(**kwargs, OnFailure="DELETE")
            waiter = cf.get_waiter("stack_create_complete")
        elif "No updates are to be performed" in str(exc):
            return
        else:
            raise
    waiter.wait(StackName=stack_name, WaiterConfig={"Delay": 15, "MaxAttempts": 120})


def ecr_login(ecr, repository_uri: str) -> None:
    auth = ecr.get_authorization_token()["authorizationData"][0]
    username, password = base64.b64decode(auth["authorizationToken"]).decode().split(":", 1)
    process = subprocess.run(
        ["docker", "login", "--username", username, "--password-stdin", auth["proxyEndpoint"]],
        input=password,
        text=True,
        check=True,
    )
    if process.returncode:
        raise RuntimeError("ECR login failed")


def require_secret(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise SystemExit(f"Set {name} in your shell or secure CI secret store.")
    return value


def publish_web(session, bucket: str, distribution_id: str) -> None:
    s3 = session.client("s3")
    root = ROOT / "mobile" / "dist"
    expected = set()
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        key = path.relative_to(root).as_posix()
        expected.add(key)
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        cache_control = "no-cache" if key in {"index.html", "metadata.json"} else "public,max-age=31536000,immutable"
        with path.open("rb") as body:
            s3.put_object(Bucket=bucket, Key=key, Body=body, ContentType=content_type, CacheControl=cache_control)
    paginator = s3.get_paginator("list_objects_v2")
    stale = []
    for page in paginator.paginate(Bucket=bucket):
        stale.extend({"Key": item["Key"]} for item in page.get("Contents", []) if item["Key"] not in expected)
    for offset in range(0, len(stale), 1000):
        s3.delete_objects(Bucket=bucket, Delete={"Objects": stale[offset : offset + 1000]})
    session.client("cloudfront").create_invalidation(
        DistributionId=distribution_id,
        InvalidationBatch={"Paths": {"Quantity": 1, "Items": ["/*"]}, "CallerReference": str(time.time_ns())},
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    phase = parser.add_mutually_exclusive_group(required=True)
    phase.add_argument("--foundation", action="store_true")
    phase.add_argument("--application", action="store_true")
    parser.add_argument("--stack", default="co-wingman")
    parser.add_argument("--region", default=os.getenv("AWS_REGION", "us-east-1"))
    args = parser.parse_args()

    session = boto3.Session(region_name=args.region)
    cf = session.client("cloudformation")
    if args.foundation:
        deploy_stack(cf, args.stack, [{"ParameterKey": "ImageIdentifier", "ParameterValue": ""}])
        print(json.dumps(stack_outputs(cf, args.stack), indent=2))
        return

    outputs = stack_outputs(cf, args.stack)
    repository = outputs["EcrRepositoryUri"]
    tag = str(int(time.time()))
    image = f"{repository}:{tag}"
    ecr_login(session.client("ecr"), repository)
    run("docker", "build", "--platform", "linux/amd64", "-t", image, str(ROOT / "backend"))
    run("docker", "push", image)
    deploy_stack(
        cf,
        args.stack,
        [
            {"ParameterKey": "ImageIdentifier", "ParameterValue": image},
            {"ParameterKey": "GeminiApiKey", "ParameterValue": require_secret("GEMINI_API_KEY")},
            {"ParameterKey": "GroqApiKey", "ParameterValue": require_secret("GROQ_API_KEY")},
        ],
    )
    outputs = stack_outputs(cf, args.stack)
    mobile_env = dict(os.environ, EXPO_PUBLIC_API_URL=outputs["ApiUrl"], EXPO_HOME="/tmp/wings-expo", EXPO_NO_TELEMETRY="1")
    run("npm", "run", "build", "--prefix", "mobile", env=mobile_env)
    publish_web(session, outputs["WebBucketName"], outputs["WebDistributionId"])
    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    raise SystemExit('AWS deployment is retired. Use bash infra/gcp/deploy.sh; see infra/gcp/README.md.')
