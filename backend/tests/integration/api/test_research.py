"""Owner API benchmark execution, persistence, selection and exports."""

import json
import os

import pytest

from brainstorm_agent.persistence.session import upgrade_database
from pathlib import Path  # noqa: TC003

from fastapi.testclient import TestClient

from brainstorm_agent.api.main import create_app
from brainstorm_agent.settings import Settings


@pytest.mark.parametrize("postgres", [False, True])
def test_benchmark_flow(tmp_path: Path, postgres: bool) -> None:
    if postgres and not os.environ.get("TEST_POSTGRES_URL"):
        pytest.skip("TEST_POSTGRES_URL is not configured")
    database_url = os.environ["TEST_POSTGRES_URL"] if postgres else f"sqlite:///{tmp_path / 'research.db'}"
    upgrade_database(database_url=database_url)
    settings = Settings(
        llm_mode="fake",
        search_provider="fake",
        database_url=database_url,
        redis_url="redis://localhost:6399/0",
    )
    client = TestClient(create_app(settings))
    sid = client.post("/api/v1/sessions").json()["session_id"]
    base = f"/api/v1/sessions/{sid}"
    assert client.post(base + "/research").status_code == 409
    pitch = "pitch: A tool for teams to frame projects.\nclear: Staged workflow\nambiguities: Audience\nmissing: Adoption target"
    assert client.post(base + "/messages", json={"content": pitch}).status_code == 200
    assert (
        client.post(base + "/messages", json={"content": "problem: Teams need project framing"}).status_code
        == 200
    )
    stream = client.post(base + "/research")
    assert "event: research.completed" in stream.text, stream.text
    benchmark = client.get(base + "/research").json()["benchmarks"][-1]
    selected = [item["id"] for item in benchmark["synthesis"]["features"]]
    assert len(selected) == 2
    selection_url = base + f"/research/{benchmark['id']}/selection"
    assert client.patch(selection_url, json={"selected_ids": ["unknown"]}).status_code == 409
    assert client.patch(selection_url, json={"selected_ids": selected}).status_code == 200
    documents = client.get(base + "/stages/stage_1_problem_framing/documents").json()
    assert "## Benchmark" in documents[-1]["markdown"]
    assert "### Decisions (owner selected)\n- Shared framing\n- Markdown export" in documents[-1]["markdown"]
    assert client.get("/api/v1/sessions/missing/research").status_code == 404
    assert client.patch(base + "/research/missing/selection", json={"selected_ids": []}).status_code == 404
    fresh = TestClient(create_app(settings))
    assert fresh.get(base + "/research").json()["benchmarks"][-1]["selected_ids"] == selected
    assert "Shared framing" in json.dumps(client.get(base + "/export/json").json())
