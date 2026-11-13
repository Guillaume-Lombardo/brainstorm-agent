"""Application contract, owner isolation and persistent editing tests."""

from collections.abc import Iterator  # noqa: TC003
from pathlib import Path  # noqa: TC003

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from brainstorm_agent.api.dependencies import get_session_service
from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import StageState
from brainstorm_agent.persistence.repositories import SessionRepository
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
    assert client.get(base + "/document").json()["stage"] == STAGE
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
    assert client.get(base + "/export/slice_specs").status_code == 409
    assert client.get(base + "/export/backlog_json").status_code == 409
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
            password="strong-password",  # noqa: S106  # pragma: allowlist secret
        )
        db.commit()
        other_id = user.id

    def other_service() -> Iterator[SessionService]:
        with app.state.session_factory() as db:
            yield SessionService(db_session=db, settings=app.state.settings, owner_id=other_id)

    app.dependency_overrides[get_session_service] = other_service
    assert client.request(method, f"/api/v1/sessions/{sid}{path}", json=body).status_code == 404
    assert client.get("/api/v1/sessions").json()["items"] == []


@pytest.mark.parametrize("action", ["approve", "reject", "request_changes"])
def test_explicit_reviews_persist_action_and_note(tmp_path: Path, action: str) -> None:
    client = client_for(tmp_path)
    assert isinstance(client.app, FastAPI)
    client.app.state.settings.require_human_validation_for_transitions = True
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    assert client.post(base + "/messages", json={"content": PITCH}).json()["requires_human_review"]
    assert client.post(base + "/turns", json={"content": "continue"}).status_code == 409
    assert (
        client.post(base + "/review", json={"stage": "stage_1_problem_framing", "action": action}).status_code
        == 409
    )
    result = client.post(base + "/review", json={"stage": STAGE, "action": action, "note": "Review feedback"})
    assert result.status_code == 200
    assert result.json()["pending_human_review"] is None
    assert result.json()["comments"][-1]["body"] == "Review feedback"
    assert (result.json()["current_stage"] != STAGE) == (action == "approve")
    stored = client.get(base + "/reviews").json()["items"][-1]
    assert (
        stored["decision"]
        == {"approve": "approved", "reject": "rejected", "request_changes": "request_changes"}[action]
    )


def test_direct_edit_rechecks_gate_questions(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    client.post(base + "/messages", json={"content": "pitch: A project framing service for teams."})
    before = client.get(base).json()["stage_states"][STAGE]
    assert not before["stage_is_clear_enough"]
    result = client.patch(
        base + f"/stages/{STAGE}",
        json={
            "fields": {
                "clear_points": ["Guided framing"],
                "ambiguities": ["Audience"],
                "missing_information": ["Adoption target"],
            },
        },
    )
    assert result.status_code == 200
    edited = result.json()["stage_states"][STAGE]
    assert not edited["stage_is_clear_enough"]
    assert client.patch(base + f"/stages/{STAGE}", json={"items": {"open_questions": []}}).status_code == 409
    assert all(check["passed"] for check in edited["readiness"] if check["id"] != "blocking_questions")
    assert not any(question["id"].startswith("gate:") for question in edited["open_questions"])


def test_edit_rebuilds_pending_review(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    assert isinstance(client.app, FastAPI)
    client.app.state.settings.require_human_validation_for_transitions = True
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    client.post(base + "/messages", json={"content": PITCH})
    edited = client.patch(
        base + f"/stages/{STAGE}/fields/pitch_summary",
        json={"value": "Updated project framing service for teams"},
    )
    assert edited.json()["pending_human_review"] is not None
    assert client.post(base + "/review", json={"stage": STAGE, "action": "approve"}).status_code == 200


def test_identical_edit_preserves_partial_coverage(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    assert isinstance(client.app, FastAPI)
    client.app.state.settings.require_human_validation_for_transitions = True
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    client.post(base + "/messages", json={"content": PITCH})
    with client.app.state.session_factory() as db:
        repository = SessionRepository(db)
        state = repository.to_state(repository.require(sid))
        stage = state.stage_states[STAGE]
        original = stage.extracted_fields.get("pitch_summary")
        stage.partial_fields["pitch_summary"] = "Audience remains vague."
        repository.save_state(sid, state)
        db.commit()
    result = client.patch(base + f"/stages/{STAGE}/fields/pitch_summary", json={"value": original}).json()
    assert result["stage_states"][STAGE]["coverage"]["pitch_summary"] == "partial"
    assert result["pending_human_review"] is None


def test_delivery_exports_use_domain_plan_and_reject_stale_or_invalid(tmp_path: Path) -> None:
    client = client_for(tmp_path)
    assert isinstance(client.app, FastAPI)
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    with client.app.state.session_factory() as db:
        repository = SessionRepository(db)
        state = repository.to_state(repository.require(sid))
        for stage, fields in {
            "stage_2_user_story_mapping": {"capabilities": ["Reporting"]},
            "stage_3_event_storming": {"event_storming_relevant": False},
            "stage_6_backlog_synthesis": {
                "mvp_user_stories": [{"id": "story", "statement": "Export reports"}],
            },
            "stage_7_delivery_slicing": {
                "slices": [
                    {
                        "id": "slice-0",
                        "goal": "Walking skeleton",
                        "provided_contracts": [{"id": "api", "specification": "GET /reports"}],
                        "integration_scenarios": [
                            {"given": "Running", "when": "Health requested", "then": "Ready"},
                        ],
                    },
                    {
                        "id": "reports",
                        "goal": "Export reports",
                        "owned_domain": ["Reporting"],
                        "backlog_item_ids": ["story"],
                        "consumed_contracts": ["api"],
                        "integration_scenarios": [
                            {"ears": "WHEN export requested THE SYSTEM SHALL return CSV"},
                        ],
                    },
                ],
            },
        }.items():
            state.stage_states[stage] = StageState.model_validate({
                "stage": stage,
                "extracted_fields": fields,
            })
        state.current_stage = Stage.STAGE_7_DELIVERY_SLICING
        repository.save_state(sid, state)
        db.commit()
    specs = client.get(base + "/export/slice_specs").json()
    assert set(specs["specs"]) == {"slice-0.md", "reports.md"}
    assert "Effective dependencies" in specs["specs"]["reports.md"]
    backlog = client.get(base + "/export/backlog_json").json()
    assert backlog["waves"] == [["slice-0"], ["reports"]]
    assert backlog["slices"][1]["dependencies"] == ["slice-0"]
    assert backlog["backlog"]["mvp_user_stories"][0]["id"] == "story"
    assert (
        client.patch(base + "/stages/stage_7_delivery_slicing", json={"fields": {"slices": []}}).status_code
        == 200
    )
    assert client.get(base + "/export/slice_specs").status_code == 409
    assert client.post(base + "/stages/stage_6_backlog_synthesis/reopen").status_code == 200
    assert client.get(base + "/export/backlog_json").status_code == 409
