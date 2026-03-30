from __future__ import annotations

from brainstorm_agent.logging import configure_logging, get_logger
from brainstorm_agent.settings import Settings


def test_structlog_logger_is_configured(capsys) -> None:
    configure_logging(settings=Settings(log_json=False, log_level="INFO"), force=True)
    logger = get_logger("tests")
    logger.info("hello")

    captured = capsys.readouterr()
    assert "hello" in captured.err.lower()
