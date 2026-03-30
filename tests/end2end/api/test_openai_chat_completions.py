from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def test_openai_compatible_chat_flow_preserves_session_state(tmp_path: Path) -> None:
    settings = Settings(
        database_url=f"sqlite+pysqlite:///{tmp_path / 'openai-end2end.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
        openai_facade_model_name="brainstorm-agent",
    )
    client = TestClient(create_app(settings=settings))

    pitch_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "brainstorm-agent",
            "messages": [
                {
                    "role": "user",
                    "content": "An internal agent that guides teams through structured product framing before delivery starts.",
                },
            ],
        },
    )
    assert pitch_response.status_code == 200
    session_id = pitch_response.json()["brainstorm"]["session_id"]
    assert pitch_response.json()["brainstorm"]["current_stage"] == "stage_1_problem_framing"

    problem_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "brainstorm-agent",
            "messages": [
                {"role": "user", "content": "problem: teams jump into execution without alignment"},
            ],
            "metadata": {"session_id": session_id},
        },
    )
    assert problem_response.status_code == 200
    problem_payload = problem_response.json()
    assert problem_payload["brainstorm"]["session_id"] == session_id
    assert problem_payload["brainstorm"]["current_stage"] == "stage_1_problem_framing"
    assert problem_payload["brainstorm"]["stage_clear_enough"] is False
    assert "users_actors" in problem_payload["brainstorm"]["transition_decision_reason"]
