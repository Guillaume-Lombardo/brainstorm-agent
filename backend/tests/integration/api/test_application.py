"""Application contract, owner isolation and persistent editing tests."""

from collections.abc import Iterator  # noqa: TC003
from pathlib import Path  # noqa: TC003

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from brainstorm_agent.api.dependencies import get_session_service
from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.services.users import UserService
from brainstorm_agent.settings import Settings

PITCH = "pitch: A tool for teams to frame projects.\nclear: Staged workflow\nambiguities: Audience\nmissing: Adoption target"
STAGE = "stage_0_pitch"


def client_for(tmp_path: Path) -> TestClient:
    return TestClient(
        create_app(
            Settings(
                database_url=f"sqlite+pysqlite:///{tmp_path / 'app.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
            ),
        ),
    )


def test_metadata_pagination_soft_delete(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    ids = [client.post("/api/v1/sessions", json={"title": name}).json()["session_id"] for name in ["A", "B"]]
    page = client.get("/api/v1/sessions?limit=1").json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert (
        client.get("/api/v1/sessions?offset=1&limit=1").json()["items"][0]["session_id"]
        != page["items"][0]["session_id"]
    )
    base = f"/api/v1/sessions/{ids[0]}"
    assert client.patch(base, json={"title": "Renamed", "archived": True}).json()["title"] == "Renamed"
    assert client.get("/api/v1/sessions").json()["total"] == 1
    assert client.get("/api/v1/sessions?include_archived=true").json()["total"] == 2
    assert client.delete(base).status_code == 204
    assert client.get(base).status_code == 404
    assert client.post(base + "/turns", json={"content": "hello"}).status_code == 404
    assert client.get("/api/v1/sessions?include_archived=true").json()["total"] == 1


def test_reopen_edits_versions_comments_and_exports(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    assert client.post(base + "/messages", json={"content": PITCH}).status_code == 200
    assert (
        client.post(base + "/messages", json={"content": "problem: Teams need framing."}).status_code == 200
    )
    reopened = client.post(base + f"/stages/{STAGE}/reopen").json()
    assert reopened["stage_states"]["stage_1_problem_framing"]["stale"]
    assert reopened["current_stage"] == STAGE
    edited = client.patch(
        base + f"/stages/{STAGE}",
        json={
            "fields": {"pitch_summary": "A revised project pitch"},
            "items": {"facts": [{"id": "fact-1", "statement": "Owner correction"}]},
        },
    )
    assert edited.status_code == 200
    state = edited.json()["stage_states"][STAGE]
    assert state["coverage"]["pitch_summary"] == "clear"
    assert state["readiness"]
    assert state["facts"][0]["id"] == "fact-1"
    versions = client.get(base + f"/stages/{STAGE}/documents").json()
    assert len(versions) == 2
    diff = client.get(base + f"/stages/{STAGE}/documents/diff?from_version=1&to_version=2")
    assert "A revised project pitch" in diff.json()["diff"]
    assert client.patch(base + f"/stages/{STAGE}", json={"fields": {"unknown": "bad"}}).status_code == 409
    assert client.patch(base + f"/stages/{STAGE}/fields/clear_points", json={"value": 42}).status_code == 409
    comment = client.post(
        base + "/comments",
        json={"stage": STAGE, "section": "Facts", "body": "Check adoption"},
    )
    assert not comment.json()["comments"][0]["consumed"]
    assert (
        client.post(base + "/messages", json={"content": "pitch: Confirm revised pitch"}).status_code == 200
    )
    assert client.get(base).json()["comments"][0]["consumed"]
    assert client.get(base + "/export/slice_specs").json() == {"available": False, "specs": []}
    assert client.get(base + "/export/backlog_json").json()["items"] == []
    assert client.get(base + "/export/markdown").status_code == 200


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("patch", "", {"title": "Hijacked"}),
        ("delete", "", None),
        ("post", "/turns", {"content": "hello"}),
        ("post", f"/stages/{STAGE}/reopen", None),
        ("patch", f"/stages/{STAGE}", {"fields": {}}),
        ("patch", f"/stages/{STAGE}/fields/pitch_summary", {"value": "bad"}),
        ("post", "/comments", {"stage": STAGE, "section": "Facts", "body": "bad"}),
        ("post", "/review", {"stage": STAGE, "action": "approve"}),
        ("get", f"/stages/{STAGE}/documents", None),
        ("get", f"/stages/{STAGE}/documents/diff?from_version=1&to_version=2", None),
        ("get", "/export/slice_specs", None),
        ("get", "/export/backlog_json", None),
    ],
)
def test_new_endpoints_hide_other_owners(tmp_path: Path, method: str, path: str, body: dict | None) -> None:

    client = client_for(tmp_path)
    app = client.app
    assert isinstance(app, FastAPI)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    with app.state.session_factory() as db:
        user = UserService(db).create(
            email="other@example.com",
            display_name="Other",
            password="strong-password",  # noqa: S106
        )
        db.commit()
        other_id = user.id

    def other_service() -> Iterator[SessionService]:
        with app.state.session_factory() as db:
            yield SessionService(db_session=db, settings=app.state.settings, owner_id=other_id)

    app.dependency_overrides[get_session_service] = other_service
    assert client.request(method, f"/api/v1/sessions/{sid}{path}", json=body).status_code == 404
    assert client.get("/api/v1/sessions").json()["items"] == []
