from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt

from brainstorm_agent.core.enums import AuthMode
from brainstorm_agent.services.auth import AuthenticationService, hash_api_key
from brainstorm_agent.settings import Settings


def test_hash_api_key_is_stable() -> None:
    first = hash_api_key("secret")
    second = hash_api_key("secret")

    assert first == second
    assert first != hash_api_key("other")


def test_auth_service_accepts_hashed_api_key() -> None:
    settings = Settings(
        enable_auth=True,
        auth_mode=AuthMode.API_KEY,
        auth_api_key_hashes=[hash_api_key("secret-token")],
    )
    service = AuthenticationService(settings)

    principal = service.authenticate(x_api_key="secret-token", authorization=None)

    assert principal is not None
    assert principal.auth_mode is AuthMode.API_KEY


def test_auth_service_accepts_jwt_bearer() -> None:
    jwt_secret = "0123456789abcdef0123456789abcdef"  # noqa: S105  # pragma: allowlist secret
    settings = Settings(
        enable_auth=True,
        auth_mode=AuthMode.JWT,
        jwt_secret_key=jwt_secret,
        jwt_audience="brainstorm-users",
        jwt_issuer="brainstorm-agent",
    )
    token = jwt.encode(
        {
            "sub": "user-123",
            "exp": datetime.now(tz=UTC) + timedelta(minutes=5),
            "aud": "brainstorm-users",
            "iss": "brainstorm-agent",
            "scope": "brainstorm:write brainstorm:read",
        },
        key=jwt_secret,
        algorithm="HS256",
    )
    service = AuthenticationService(settings)

    principal = service.authenticate(x_api_key=None, authorization=f"Bearer {token}")

    assert principal is not None
    assert principal.auth_mode is AuthMode.JWT
    assert principal.subject == "user-123"
    assert "brainstorm:write" in principal.scopes
