import json
import os
import subprocess  # noqa: S404 - fixed CLI smoke command
import sys


def test_evaluation_command(tmp_path):
    result = subprocess.run(  # noqa: S603 - fixed CLI smoke command
        [sys.executable, "-m", "brainstorm_agent.cli", "eval", "--output", str(tmp_path)],
        env={**os.environ, "LLM_MODE": "fake"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads((tmp_path / "report.json").read_text())
    assert all(s["passed"] for s in report["models"][0]["scenarios"])
