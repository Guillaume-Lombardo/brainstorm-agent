from __future__ import annotations

from argparse import Namespace

import pytest

from brainstorm_agent import cli
from brainstorm_agent.settings import Settings


def test_build_parser_supports_version_flag(capsys) -> None:
    parser = cli.build_parser()

    with pytest.raises(SystemExit) as exc_info:
        parser.parse_args(["--version"])
    assert exc_info.value.code == 0

    captured = capsys.readouterr()
    assert "0.1.0" in captured.out


def test_main_initializes_logging_and_returns_zero(mocker) -> None:
    dummy_parser = mocker.Mock()
    dummy_parser.parse_args.return_value = None

    mocker.patch("brainstorm_agent.cli.build_parser", return_value=dummy_parser)
    mocker.patch("brainstorm_agent.cli.get_settings", return_value=Settings())
    mock_configure = mocker.patch("brainstorm_agent.cli.configure_logging")
    mock_logger = mocker.Mock()
    mocker.patch("brainstorm_agent.cli.get_logger", return_value=mock_logger)

    result = cli.main()

    assert result == 0
    mock_configure.assert_called_once()
    mock_logger.info.assert_called_once()


def test_main_hash_api_key_command_prints_digest(mocker, capsys) -> None:
    dummy_parser = mocker.Mock()
    dummy_parser.parse_args.return_value = Namespace(
        command="hash-api-key",
        value="secret-token",
        pepper=None,
    )

    mocker.patch("brainstorm_agent.cli.build_parser", return_value=dummy_parser)
    get_settings = mocker.patch("brainstorm_agent.cli.get_settings")
    configure_logging = mocker.patch("brainstorm_agent.cli.configure_logging")
    get_logger = mocker.patch("brainstorm_agent.cli.get_logger")

    result = cli.main()

    assert result == 0
    assert capsys.readouterr().out.strip().startswith("sha256$")
    get_settings.assert_not_called()
    configure_logging.assert_not_called()
    get_logger.assert_not_called()


def test_main_hash_api_key_command_supports_pepper(mocker, capsys) -> None:
    dummy_parser = mocker.Mock()
    dummy_parser.parse_args.return_value = Namespace(
        command="hash-api-key",
        value="secret-token",
        pepper="pepper-value",
    )

    mocker.patch("brainstorm_agent.cli.build_parser", return_value=dummy_parser)

    result = cli.main()

    assert result == 0
    assert capsys.readouterr().out.strip().startswith("v1$")
