import json
import socket
import sys

from brainstorm_agent.cli import main
from brainstorm_agent.settings import get_settings


def test_recorded_cli_never_connects(tmp_path, monkeypatch):
    def forbidden(*_args: object, **_kwargs: object) -> None:
        message = "Network access forbidden"
        raise AssertionError(message)

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setenv("LLM_MODE", "fake")
    monkeypatch.setattr(sys, "argv", ["brainstorm-agent", "eval", "--output", str(tmp_path)])
    get_settings.cache_clear()
    try:
        assert main() == 0
    finally:
        get_settings.cache_clear()
    report = json.loads((tmp_path / "report.json").read_text())["models"][0]
    assert report["model"] == "recorded-fixtures"
    assert report["metrics"]["transition_precision"] == 1
    assert report["metrics"]["transition_recall"] == 1
    assert report["metrics"]["schema_failures"] == 0
    assert all(s["passed"] for s in report["scenarios"])
    assert sum(s["completed"] for s in report["scenarios"]) == 2
    assert "recorded-fixtures" in (tmp_path / "report.md").read_text()
