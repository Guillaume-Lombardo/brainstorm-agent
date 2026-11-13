from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

import jwt
from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import AuthMode, LLMMode
from brainstorm_agent.services.auth import hash_api_key
from brainstorm_agent.services.users import UserService
from brainstorm_agent.settings import Settings

TEST_SECRET = "local-test-signing-value-32-chars!"  # noqa: S105  # pragma: allowlist secret
BRIDGE = {"X-Auth-Bridge": "test-bridge"}


def test_login_ownership_and_revocation(tmp_path: Path) -> None:
    settings = Settings(
        llm_mode=LLMMode.FAKE,
        database_url=f"sqlite:///{tmp_path / 'auth.db'}",
        redis_url="redis://localhost:6399",
        enable_auth=True,
        auth_mode=AuthMode.HYBRID,
        jwt_secret_key=TEST_SECRET,
        auth_api_keys=["service-test"],
        auth_bridge_secret=BRIDGE["X-Auth-Bridge"],
    )
    app = create_app(settings)
    with app.state.session_factory() as db:
        users = UserService(db)
        alice = users.create("alice@example.invalid", "Alice", "alice-password")
        bob = users.create("bob@example.invalid", "Bob", "bob-password")
        db.commit()
    settings.auth_api_key_owners = {hash_api_key("service-test"): alice.id}
    client = TestClient(app)
    assert (
        client.post(
            "/api/v1/auth/verify",
            json={"email": alice.email, "password": "alice-password"},  # pragma: allowlist secret
        ).status_code
        == 401
    )
    for email, password in [(alice.email, "wrong"), ("absent@example.invalid", "wrong")]:
        assert (
            client.post(
                "/api/v1/auth/verify",
                headers=BRIDGE,
                json={"email": email, "password": password},
            ).status_code
            == 401
        )
    login = client.post(
        "/api/v1/auth/verify",
        headers=BRIDGE,
        json={"email": alice.email, "password": "alice-password"},  # pragma: allowlist secret
    )
    assert login.json() == {"id": alice.id, "email": alice.email, "display_name": "Alice"}

    def headers(user_id: str) -> dict[str, str]:
        return {
            "Authorization": "Bearer "
            + jwt.encode(
                {"sub": user_id, "exp": datetime.now(UTC) + timedelta(minutes=5)},
                TEST_SECRET,
                algorithm="HS256",
            ),
        }

    alice_headers, bob_headers = headers(alice.id), headers(bob.id)
    created = client.post("/api/v1/sessions", headers=alice_headers)
    assert created.status_code == 201
    session_id = created.json()["session_id"]
    assert (
        client.get(f"/api/v1/sessions/{session_id}", headers={"X-API-Key": "service-test"}).status_code == 200
    )
    for suffix in [
        "",
        "/messages",
        "/document",
        "/documents",
        "/export/json",
        "/export/markdown",
        "/reviews",
    ]:
        assert client.get(f"/api/v1/sessions/{session_id}{suffix}", headers=bob_headers).status_code == 404
    assert (
        client.post(
            f"/api/v1/sessions/{session_id}/messages",
            headers=bob_headers,
            json={"content": "stolen"},
        ).status_code
        == 404
    )
    facade_body = {
        "model": "brainstorm-agent",
        "messages": [{"role": "user", "content": "A useful framing tool"}],
        "metadata": {"session_id": session_id},
    }
    assert client.post("/v1/chat/completions", headers=bob_headers, json=facade_body).status_code == 404
    assert client.post("/v1/chat/completions", headers=alice_headers, json=facade_body).status_code == 200
    with app.state.session_factory() as db:
        user = UserService(db).get_active(alice.id)
        assert user
        user.active = False
        db.commit()
    assert client.get(f"/api/v1/sessions/{session_id}", headers=alice_headers).status_code == 401
    assert (
        client.get(f"/api/v1/sessions/{session_id}", headers={"X-API-Key": "service-test"}).status_code == 401
    )
    assert (
        client.post(
            "/api/v1/auth/verify",
            headers=BRIDGE,
            json={"email": alice.email, "password": "alice-password"},  # pragma: allowlist secret
        ).status_code
        == 401
    )


def test_login_throttle_and_oidc(tmp_path: Path) -> None:
    app = create_app(
        Settings(
            llm_mode=LLMMode.FAKE,
            database_url=f"sqlite:///{tmp_path / 'oidc.db'}",
            redis_url="redis://localhost:6399",
            auth_bridge_secret=BRIDGE["X-Auth-Bridge"],
            oidc_issuer="https://identity.example.invalid",
            login_rate_limit_requests=3,
        ),
    )
    client = TestClient(app)
    claims = {
        "issuer": "https://identity.example.invalid",
        "subject": "subject-1",
        "email": "oidc@example.invalid",
        "display_name": "OIDC User",
    }
    first = client.post("/api/v1/auth/oidc", headers=BRIDGE, json=claims)
    assert first.status_code == 200
    assert client.post("/api/v1/auth/oidc", headers=BRIDGE, json=claims).json() == first.json()
    claims["subject"] = "subject-2"
    assert client.post("/api/v1/auth/oidc", headers=BRIDGE, json=claims).status_code == 409
    claims["subject"] = "subject-1"
    assert client.post("/api/v1/auth/oidc", headers=BRIDGE, json=claims).status_code == 200
    throttled = client.post(
        "/api/v1/auth/oidc",
        headers=BRIDGE,
        json=claims,
    )
    assert throttled.status_code == 429
    assert int(throttled.headers["Retry-After"]) > 0


def test_login_budget_isolated_by_identity_and_flow(tmp_path: Path) -> None:
    app = create_app(
        Settings(
            database_url=f"sqlite:///{tmp_path / 'login-budgets.db'}",
            llm_mode=LLMMode.FAKE,
            redis_url="redis://localhost:6399",
            auth_bridge_secret=BRIDGE["X-Auth-Bridge"],
            login_rate_limit_requests=2,
            oidc_issuer="https://identity.example.invalid",
        )
    )
    with app.state.session_factory() as db:
        UserService(db).create("bob@example.invalid", "Bob", "bob-password")
        db.commit()
    client = TestClient(app)
    for email in ["alice@example.invalid", " ALICE@example.invalid "]:
        assert (
            client.post(
                "/api/v1/auth/verify", headers=BRIDGE, json={"email": email, "password": "wrong"}
            ).status_code
            == 401
        )
    limited = client.post(
        "/api/v1/auth/verify", headers=BRIDGE, json={"email": "alice@example.invalid", "password": "wrong"}
    )
    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0
    assert (
        client.post(
            "/api/v1/auth/verify",
            headers=BRIDGE,
            json={"email": "bob@example.invalid", "password": "bob-password"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/oidc",
            headers=BRIDGE,
            json={
                "issuer": "https://identity.example.invalid",
                "subject": "alice-oidc",
                "email": "alice@example.invalid",
                "display_name": "Alice",
            },
        ).status_code
        == 200
    )
