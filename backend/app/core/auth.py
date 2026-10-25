"""Authentication boundary for demo identities and Firebase ID tokens."""

from dataclasses import dataclass

from fastapi import HTTPException, Request

from .config import Settings


@dataclass(frozen=True)
class Identity:
    user_id: str
    email: str | None
    provider: str


def verify_firebase_token(settings: Settings, token: str) -> Identity:
    """Verify a client ID token with Firebase Admin and return trusted claims."""
    import firebase_admin
    from firebase_admin import auth

    try:
        firebase_admin.get_app()
    except ValueError:
        options = {"projectId": settings.firebase_project_id} if settings.firebase_project_id else None
        firebase_admin.initialize_app(options=options)
    claims = auth.verify_id_token(token, check_revoked=settings.firebase_check_revoked)
    uid = claims.get("uid") or claims.get("sub")
    if not isinstance(uid, str) or not uid:
        raise ValueError("Firebase token has no user ID")
    email = claims.get("email")
    return Identity(uid, email if isinstance(email, str) else None, "firebase")


def resolve_identity(settings: Settings, request: Request, demo_owner: str = "") -> Identity:
    if settings.auth_mode == "demo":
        owner = demo_owner or request.headers.get("x-demo-owner", "")
        if not 24 <= len(owner) <= 128:
            raise HTTPException(401, "A valid demo identity is required")
        return Identity(owner, None, "demo")

    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Firebase authentication is required")
    try:
        return verify_firebase_token(settings, token)
    except Exception:
        # Provider details can expose token or account metadata; keep the response generic.
        raise HTTPException(401, "Invalid or expired authentication token") from None
