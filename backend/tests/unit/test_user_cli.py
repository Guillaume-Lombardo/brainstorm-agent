from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

if TYPE_CHECKING:
    from pytest_mock import MockerFixture

from brainstorm_agent import cli
from brainstorm_agent.persistence.session import (
    create_engine_from_settings,
    create_session_factory,
    upgrade_database,
)
from brainstorm_agent.services.users import UserService
from brainstorm_agent.settings import Settings


def test_administrator_user_lifecycle(tmp_path: Path, mocker: MockerFixture) -> None:
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'cli.db'}")
    upgrade_database(database_url=settings.database_url)
    mocker.patch.object(cli, "get_settings", return_value=settings)
    mocker.patch.object(cli, "getpass", side_effect=["first-password", "second-password"])
    for args in [
        ["create", "local@example.invalid", "--display-name", "Local"],
        ["set-password", "local@example.invalid"],
        ["disable", "local@example.invalid"],
    ]:
        mocker.patch("sys.argv", ["brainstorm-agent", "user", *args])
        assert cli.main() == 0
        engine = create_engine_from_settings(settings)
        with create_session_factory(engine)() as db:
            users = UserService(db)
            if args[0] == "create":
                assert users.verify("local@example.invalid", "first-password")
            elif args[0] == "set-password":
                assert users.verify("local@example.invalid", "second-password")
                assert users.verify("local@example.invalid", "first-password") is None
            else:
                assert users.verify("local@example.invalid", "second-password") is None
        engine.dispose()
