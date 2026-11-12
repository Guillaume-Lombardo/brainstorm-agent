from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def test_full_initial_transition_and_stage_blocking(tmp_path: Path) -> None:
    settings = Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'end2end.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
    )
    client = TestClient(create_app(settings=settings))

    create_response = client.post("/api/v1/sessions")
    session_id = create_response.json()["session_id"]

    pitch_response = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"content": "An internal agent to structure software project framing with staged deliverables."},
    )
    assert pitch_response.status_code == 200
    assert pitch_response.json()["current_stage"] == "stage_1_problem_framing"

    problem_response = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"content": "problem: teams jump into execution without alignment"},
    )
    assert problem_response.status_code == 200
    payload = problem_response.json()
    assert payload["current_stage"] == "stage_1_problem_framing"
    assert payload["stage_clear_enough"] is False
    assert "users_actors" in payload["transition_decision_reason"]

    documents_response = client.get(f"/api/v1/sessions/{session_id}/documents")
    assert documents_response.status_code == 200
    assert len(documents_response.json()["items"]) == 2
