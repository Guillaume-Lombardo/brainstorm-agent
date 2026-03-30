from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.exceptions import LLMResponseError
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def _build_settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'unit-api.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
    )


def test_healthcheck_and_session_flow(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "ok"
    assert health.headers["X-Request-Id"]

    created = client.post("/api/v1/sessions")
    assert created.status_code == 201
    session_id = created.json()["session_id"]

    history = client.get(f"/api/v1/sessions/{session_id}/messages")
    assert history.status_code == 200
    assert len(history.json()["items"]) == 1

    first_turn = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"content": "A backend that structures project framing in fixed stages."},
    )
    assert first_turn.status_code == 200

    current_document = client.get(f"/api/v1/sessions/{session_id}/document")
    assert current_document.status_code == 200
    assert current_document.json()["stage"] == "stage_0_pitch"

    documents = client.get(f"/api/v1/sessions/{session_id}/documents")
    assert documents.status_code == 200
    assert len(documents.json()["items"]) == 1

    metrics = client.get("/metrics")
    assert metrics.status_code == 200
    assert "brainstorm_agent_http_requests_total" in metrics.text


def test_missing_session_returns_not_found(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    response = client.get("/api/v1/sessions/missing-session")

    assert response.status_code == 404
    assert "was not found" in response.json()["detail"]


def test_llm_response_errors_return_bad_gateway(tmp_path: Path) -> None:
    app = create_app(settings=_build_settings(tmp_path))

    @app.get("/boom")
    def boom() -> None:
        raise LLMResponseError(stage="stage_0_pitch", raw_output_excerpt="not-json")

    client = TestClient(app)
    response = client.get("/boom")

    assert response.status_code == 502
    assert "could not be parsed" in response.json()["detail"]


def test_auth_blocks_requests_when_enabled(tmp_path: Path) -> None:
    settings = _build_settings(tmp_path)
    settings.enable_auth = True
    settings.auth_api_keys = ["secret-token"]
    client = TestClient(create_app(settings=settings))

    blocked = client.post("/api/v1/sessions")
    assert blocked.status_code == 401

    allowed = client.post("/api/v1/sessions", headers={"X-API-Key": "secret-token"})
    assert allowed.status_code == 201
