from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
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
    assert health.json() == {"status": "ok"}

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


def test_missing_session_returns_not_found(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    response = client.get("/api/v1/sessions/missing-session")

    assert response.status_code == 404
    assert "was not found" in response.json()["detail"]
