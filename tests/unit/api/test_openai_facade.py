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
        database_url=f"sqlite+pysqlite:///{tmp_path / 'unit-openai.db'}",
        llm_mode=LLMMode.HEURISTIC,
        redis_url="redis://localhost:6399/0",
        openai_facade_model_name="brainstorm-agent",
    )


def test_openai_models_lists_public_alias(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    response = client.get("/v1/models")

    assert response.status_code == 200
    payload = response.json()
    assert payload["object"] == "list"
    assert payload["data"][0]["id"] == "brainstorm-agent"


def test_openai_chat_completion_returns_session_metadata(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "brainstorm-agent",
            "messages": [
                {
                    "role": "user",
                    "content": "An agent that turns rough project ideas into structured staged documents.",
                },
            ],
        },
    )

    assert response.status_code == 200
    assert response.headers["X-Brainstorm-Session-Id"]
    payload = response.json()
    assert payload["model"] == "brainstorm-agent"
    assert payload["brainstorm"]["session_id"] == response.headers["X-Brainstorm-Session-Id"]
    assert payload["choices"][0]["message"]["role"] == "assistant"
    assert "# Structured Summary" in payload["choices"][0]["message"]["content"]


def test_openai_chat_completion_rejects_unknown_model(tmp_path: Path) -> None:
    client = TestClient(create_app(settings=_build_settings(tmp_path)))

    response = client.post(
        "/v1/chat/completions",
        json={
            "model": "unknown-model",
            "messages": [{"role": "user", "content": "Hello"}],
        },
    )

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == "model_not_found"
