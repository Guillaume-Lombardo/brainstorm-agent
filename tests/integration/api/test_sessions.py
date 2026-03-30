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
        database_url=f"sqlite+pysqlite:///{tmp_path / 'api.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
    )


def test_session_api_round_trip(tmp_path: Path) -> None:
    app = create_app(settings=_build_settings(tmp_path))
    client = TestClient(app)

    created = client.post("/api/v1/sessions")
    assert created.status_code == 201
    session_id = created.json()["session_id"]

    first_turn = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"content": "A service that helps teams turn rough project ideas into structured plans."},
    )
    assert first_turn.status_code == 200
    first_payload = first_turn.json()
    assert first_payload["processed_stage"] == "stage_0_pitch"
    assert first_payload["current_stage"] == "stage_1_problem_framing"
    assert first_payload["next_stage"] == "stage_1_problem_framing"
    assert "# Structured Summary" in first_payload["step_markdown"]

    blocked_turn = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"content": "problem: Teams lack a repeatable project framing workflow."},
    )
    assert blocked_turn.status_code == 200
    blocked_payload = blocked_turn.json()
    assert blocked_payload["current_stage"] == "stage_1_problem_framing"
    assert blocked_payload["stage_clear_enough"] is False
    assert blocked_payload["open_questions"]

    session_state = client.get(f"/api/v1/sessions/{session_id}")
    assert session_state.status_code == 200
    assert session_state.json()["current_stage"] == "stage_1_problem_framing"

    current_document = client.get(f"/api/v1/sessions/{session_id}/document")
    assert current_document.status_code == 200
    assert current_document.json()["stage"] == "stage_1_problem_framing"
