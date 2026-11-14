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
        llm_mode=LLMMode.FAKE,
        redis_url="redis://localhost:6399/0",
    )
    client = TestClient(create_app(settings=settings))

    create_response = client.post("/api/v1/sessions")
    session_id = create_response.json()["session_id"]

    pitch_response = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={
            "content": "pitch: An internal agent to structure software project framing with staged deliverables.\nclear: Staged framing\nambiguities: Audience to confirm\nmissing: Adoption target",
        },
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
    assert [item["kind"] for item in documents_response.json()["items"]] == ["working", "final", "working"]


def test_human_approval_persists_a_clean_final_and_export(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite:///{tmp_path / 'approved.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
                require_human_validation_for_transitions=True,
            ),
        ),
    )
    sid = client.post("/api/v1/sessions", json={"title": "Meal planner"}).json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    pitch = "pitch: A weekly meal planner that builds the shopping list\nclear: weekly plan\nambiguous: budgets\nmissing: pricing"
    assert client.post(base + "/messages", json={"content": pitch}).json()["requires_human_review"]
    before = client.get(base + "/documents").json()["items"]
    assert [item["kind"] for item in before] == ["working"]
    assert (
        client.post(base + "/review", json={"stage": "stage_0_pitch", "action": "approve"}).status_code == 200
    )
    documents = client.get(base + "/documents").json()["items"]
    assert [item["kind"] for item in documents] == ["working", "final"]
    assert documents[0] == before[0]
    markdown = client.get(base + "/export/markdown").json()["markdown"]
    assert markdown.startswith("# Meal planner\n")
    assert "weekly meal planner" in markdown
    assert documents[-1]["markdown"] in markdown
    assert "Readiness" not in markdown
    assert "pitch_summary" not in markdown
    assert sid not in markdown
