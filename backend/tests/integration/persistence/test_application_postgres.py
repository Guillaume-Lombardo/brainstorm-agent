"""Application persistence against the same PostgreSQL major version as production."""

from __future__ import annotations

import os
import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import String, create_engine, inspect
from sqlalchemy.engine import make_url

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.persistence.session import upgrade_database
from brainstorm_agent.settings import Settings

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")


@pytest.mark.skipif(
    not POSTGRES_URL,
    reason="TEST_POSTGRES_URL requires an isolated PostgreSQL test database.",
)
def test_application_migrations_ids_and_reviews_on_postgres() -> None:
    assert POSTGRES_URL is not None
    assert make_url(POSTGRES_URL).database == "brainstorm_test"
    upgrade_database(database_url=POSTGRES_URL)
    engine = create_engine(POSTGRES_URL)
    columns = {item["name"]: item for item in inspect(engine).get_columns("open_questions")}
    id_type = columns["id"]["type"]
    assert isinstance(id_type, String)
    id_length = id_type.length
    review_columns = {item["name"]: item for item in inspect(engine).get_columns("human_review_decisions")}
    assert id_length == 36
    decision_type = review_columns["decision"]["type"]
    assert isinstance(decision_type, String)
    assert decision_type.length is not None
    assert len("request_changes") <= decision_type.length

    client = TestClient(
        create_app(
            Settings(
                database_url=POSTGRES_URL,
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
                auto_create_schema=False,
                run_db_migrations_on_startup=False,
                require_human_validation_for_transitions=True,
            ),
        ),
    )
    sid = client.post("/api/v1/sessions", json={"title": "PostgreSQL framing"}).json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    incomplete = client.post(base + "/turns", json={"content": "pitch: A framing service for product teams."})
    assert incomplete.status_code == 200
    assert "event: turn.completed" in incomplete.text
    questions = client.get(base).json()["open_questions"]
    gate_ids = [question["id"] for question in questions if question["id"].startswith("gate:")]
    assert gate_ids
    assert all(re.fullmatch(r"gate:[0-9a-f]{31}", value) for value in gate_ids)
    assert all(len(question["id"]) <= id_length for question in questions)

    complete = client.post(
        base + "/turns",
        json={
            "content": "pitch: A framing service for product teams.\nclear: Guided framing\nambiguities: Audience\nmissing: Adoption target",
        },
    )
    assert "event: review.required" in complete.text
    review = client.post(
        base + "/review",
        json={"stage": "stage_0_pitch", "action": "request_changes", "note": "Refine the audience."},
    )
    assert review.status_code == 200
    assert client.get(base + "/reviews").json()["items"][-1]["decision"] == "request_changes"
    assert client.patch(base, json={"archived": True}).status_code == 200
    assert client.delete(base).status_code == 204
    assert client.get(base).status_code == 404
    engine.dispose()
