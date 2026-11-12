from __future__ import annotations

import runpy
import sys

import pytest


def test_cli_help(capsys: pytest.CaptureFixture[str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["brainstorm_agent.cli", "--help"])
    monkeypatch.delitem(sys.modules, "brainstorm_agent.cli", raising=False)

    with pytest.raises(SystemExit) as exc_info:
        runpy.run_module("brainstorm_agent.cli", run_name="__main__")

    assert exc_info.value.code == 0
    captured = capsys.readouterr()
    assert "usage" in captured.out.lower()
