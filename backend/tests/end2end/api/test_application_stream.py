"""Full fake-provider application stream with committed persistence."""

import asyncio
import json
from pathlib import Path  # noqa: TC003
from typing import TYPE_CHECKING

from fastapi.testclient import TestClient
from pytest_mock import MockerFixture  # noqa: TC002

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.services.llm_client import FakeBrainstormLLM
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from brainstorm_agent.core.models import AssistantAnalysis, BrainstormSessionState, StageState


def test_typed_stream_orders_deltas_and_committed_events(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite+pysqlite:///{tmp_path / 'stream.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
            ),
        ),
    )
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    response = client.post(
        base + "/turns",
        json={
            "content": "pitch: Project framing for teams.\nclear: Workflow\nambiguities: Audience\nmissing: Adoption",
        },
    )
    assert response.status_code == 200
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    types = [item["type"] for item in events]
    assert types[:2] == ["turn.started", "analysis.status"]
    assert types[-1] == "turn.completed"
    assert types.index("message.delta") < types.index("document.updated") < types.index("coverage.updated")
    output = events[-1]["output"]
    assert (
        "".join(item["delta"] for item in events if item["type"] == "message.delta")
        == output["assistant_message"]
    )
    assert client.get(base + "/document").json()["markdown"] == output["step_markdown"]
    assert events[-1]["turn_id"] == events[0]["turn_id"]
    schema = client.get("/openapi.json").json()
    assert schema["components"]["schemas"]["TurnEvent"]["discriminator"]["propertyName"] == "type"


def test_stream_error_is_terminal_sanitized_and_rolls_back(tmp_path: Path, mocker: MockerFixture) -> None:
    client = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite+pysqlite:///{tmp_path / 'failure.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
            ),
        ),
    )
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    mocker.patch(
        "brainstorm_agent.services.llm_client.FakeBrainstormLLM.analyze",
        side_effect=RuntimeError("private provider detail"),
    )
    response = client.post(base + "/turns", json={"content": "hello"})
    assert response.status_code == 200
    events = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
    assert [item["type"] for item in events] == ["turn.started", "analysis.status", "error"]
    assert "private provider detail" not in response.text
    assert len(client.get(base + "/messages").json()["items"]) == 1
    assert client.get(base + "/documents").json()["items"] == []


def test_slow_turn_streams_keepalive_comments_until_completion(tmp_path: Path, mocker: MockerFixture) -> None:
    client = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite+pysqlite:///{tmp_path / 'keepalive.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
            ),
        ),
    )
    sid = client.post("/api/v1/sessions").json()["session_id"]
    mocker.patch("brainstorm_agent.services.streaming.TURN_KEEPALIVE_SECONDS", 0.05)
    analyze = FakeBrainstormLLM.analyze

    async def slow_analyze(
        self: FakeBrainstormLLM,
        *,
        stage: Stage,
        user_message: str,
        session_state: BrainstormSessionState,
        current_stage_state: StageState | None,
    ) -> AssistantAnalysis:
        await asyncio.sleep(0.3)
        return await analyze(
            self,
            stage=stage,
            user_message=user_message,
            session_state=session_state,
            current_stage_state=current_stage_state,
        )

    mocker.patch.object(FakeBrainstormLLM, "analyze", slow_analyze)
    response = client.post(f"/api/v1/sessions/{sid}/turns", json={"content": "pitch: A framing tool."})
    assert response.status_code == 200
    frames = response.text.split("\n\n")
    assert frames.count(": keepalive") >= 2
    # Comments come only while the turn runs: the terminal event closes the stream.
    assert frames.index(": keepalive") > 0
    assert [frame for frame in frames if frame][-1].startswith("event: turn.completed")


def test_openapi_exposes_concrete_stage_fields(tmp_path: Path) -> None:
    client = TestClient(
        create_app(
            Settings(
                database_url=f"sqlite+pysqlite:///{tmp_path / 'schema.db'}",
                llm_mode=LLMMode.FAKE,
                redis_url="redis://localhost:6399/0",
            ),
        ),
    )
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert {"$ref": "#/components/schemas/PitchFields"} in schemas["StageFields"]["anyOf"]
    assert "pitch_summary" in schemas["PitchFields"]["properties"]
