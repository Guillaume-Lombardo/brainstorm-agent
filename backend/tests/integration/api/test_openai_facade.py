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
        database_url=f"sqlite+pysqlite:///{tmp_path / 'openai-facade.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
        openai_facade_model_name="brainstorm-agent",
    )


def test_openai_facade_continues_existing_session(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    first_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "brainstorm-agent",
            "messages": [
                {
                    "role": "user",
                    "content": "A service that structures ambiguous software ideas into staged project framing artifacts.",
                },
            ],
        },
    )
    assert first_response.status_code == 200
    session_id = first_response.json()["brainstorm"]["session_id"]

    second_response = client.post(
        "/v1/chat/completions",
        json={
            "model": "brainstorm-agent",
            "messages": [
                {"role": "assistant", "content": first_response.json()["choices"][0]["message"]["content"]},
                {"role": "user", "content": "problem: teams start building before alignment exists"},
            ],
            "metadata": {"session_id": session_id},
        },
    )

    assert second_response.status_code == 200
    second_payload = second_response.json()
    assert second_payload["brainstorm"]["session_id"] == session_id
    assert second_payload["brainstorm"]["processed_stage"] == "stage_1_problem_framing"
    assert second_payload["brainstorm"]["current_stage"] == "stage_1_problem_framing"
    assert second_payload["brainstorm"]["stage_clear_enough"] is False
