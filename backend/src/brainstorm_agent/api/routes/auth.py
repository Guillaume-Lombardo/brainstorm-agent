"""Server-to-server authentication bridge for Auth.js."""

from __future__ import annotations

import json
from hashlib import sha256
from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session  # noqa: TC002 - FastAPI resolves annotations at runtime

from brainstorm_agent.api.dependencies import get_db_session
from brainstorm_agent.services.users import UserService

router = APIRouter(prefix="/auth", tags=["authentication"])


class CredentialsRequest(BaseModel):
    """Credentials submitted by the trusted Next.js server."""

    email: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)


class OIDCRequest(BaseModel):
    """Claims already verified by the trusted Next.js OIDC callback."""

    issuer: str = Field(min_length=1, max_length=500)
    subject: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=1, max_length=320)
    display_name: str = Field(min_length=1, max_length=200)


class UserResponse(BaseModel):
    """Public identity; password hashes never leave the backend."""

    id: str
    email: str
    display_name: str


def require_bridge(request: Request) -> None:
    """Authenticate the frontend server before processing credential claims.

    Args:
        request: Request: Incoming bridge request.

    Raises:
        HTTPException: Missing bridge credentials.
    """
    settings = request.app.state.settings
    expected = settings.auth_bridge_secret
    provided = request.headers.get("X-Auth-Bridge", "")
    if not expected or not compare_digest(expected.encode(), provided.encode()):
        raise HTTPException(401, "Valid bridge credentials are required.")


def enforce_login_limit(request: Request, *, identity: str) -> None:
    """Throttle one normalized identity without retaining it in limiter keys.

    Args:
        request: Request: Incoming bridge request.
        identity: str: Flow-prefixed normalized identity.

    Raises:
        HTTPException: Identity login budget exhausted.
    """
    settings = request.app.state.settings
    allowed, retry = request.app.state.rate_limiter.check(
        identifier=f"login:{sha256(identity.encode()).hexdigest()}",
        limit=settings.login_rate_limit_requests,
        window_seconds=settings.login_rate_limit_window_seconds,
    )
    if not allowed:
        raise HTTPException(429, "Login rate limit exceeded.", headers={"Retry-After": str(retry)})


@router.post("/verify", dependencies=[Depends(require_bridge)])
def verify_credentials(
    body: CredentialsRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
) -> UserResponse:
    """Verify local credentials for the Credentials provider.

    Args:
        body: CredentialsRequest: Candidate login.
        request: Request: Incoming bridge request.
        db: Session: Request transaction.

    Returns:
        UserResponse: Verified user.

    Raises:
        HTTPException: Invalid credentials or disabled account.
    """
    enforce_login_limit(request, identity=f"verify:{body.email.strip().lower()}")
    user = UserService(db).verify(body.email, body.password)
    if user is None:
        raise HTTPException(401, "Invalid credentials.")
    db.commit()
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name)


@router.post("/oidc", dependencies=[Depends(require_bridge)])
def provision_oidc(
    body: OIDCRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
) -> UserResponse:
    """Resolve trusted OIDC claims using issuer and subject.

    Args:
        body: OIDCRequest: Verified provider identity.
        request: Request: Incoming bridge request.
        db: Session: Request transaction.

    Returns:
        UserResponse: Provisioned or linked user.

    Raises:
        HTTPException: OIDC disabled, wrong issuer or identity conflict.
    """
    if not request.app.state.settings.oidc_issuer or body.issuer != request.app.state.settings.oidc_issuer:
        raise HTTPException(403, "OIDC issuer is not enabled.")
    enforce_login_limit(request, identity="oidc:" + json.dumps([body.issuer, body.subject]))
    try:
        user = UserService(db).provision_oidc(body.issuer, body.subject, body.email, body.display_name)
        db.commit()
    except (ValueError, IntegrityError) as exc:
        db.rollback()
        raise HTTPException(409, "Identity unavailable.") from exc
    return UserResponse(id=user.id, email=user.email, display_name=user.display_name)
