"""Full fake-provider application stream with committed persistence."""

import json
from pathlib import Path  # noqa: TC003

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.settings import Settings


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
