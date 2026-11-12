from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

    from pytest_mock import MockerFixture

import pytest

from brainstorm_agent.exceptions import NotFoundError
from brainstorm_agent.persistence.session import (
    create_engine_from_settings,
    create_session_factory,
    upgrade_database,
)
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.services.users import UserService
from brainstorm_agent.settings import Settings


def test_shared_service_requires_owner_on_every_operation(tmp_path: Path, mocker: MockerFixture) -> None:
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'owners.db'}")
    upgrade_database(database_url=settings.database_url)
    engine = create_engine_from_settings(settings)
    with create_session_factory(engine)() as db:
        users = UserService(db)
        first = users.create("first@example.invalid", "First", "password")
        second = users.create("second@example.invalid", "Second", "password")
        db.commit()
        service = SessionService(db_session=db, settings=settings, owner_id=first.id)
        session_id = service.create_session().session_id
        other = SessionService(db_session=db, settings=settings, owner_id=second.id)
        mocker.patch.object(
            other.lock_manager, "lock", side_effect=AssertionError("Unauthorized lock access")
        )
        for operation in [
            other.get_session,
            other.list_messages,
            other.get_current_document,
            other.list_documents,
            other.export_markdown,
            other.export_json,
            other.list_human_reviews,
        ]:
            with pytest.raises(NotFoundError):
                operation(session_id)
        with pytest.raises(NotFoundError):
            other.process_user_message(session_id=session_id, content="Unauthorized")
        with pytest.raises(NotFoundError):
            other.review_pending_transition(session_id=session_id, approved=True)
        assert len(service.list_messages(session_id)) == 1
        first.active = False
        db.commit()
        with pytest.raises(NotFoundError):
            service.get_session(session_id)
    engine.dispose()


def test_oidc_conflicts_and_disabled_identity(tmp_path: Path) -> None:
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'oidc-users.db'}")
    upgrade_database(database_url=settings.database_url)
    engine = create_engine_from_settings(settings)
    with create_session_factory(engine)() as db:
        users = UserService(db)
        local = users.create("local@example.invalid", "Local", "password")
        with pytest.raises(ValueError, match="Identity unavailable"):
            users.provision_oidc("issuer", "subject", local.email, "Attacker")
        oidc = users.provision_oidc("issuer", "subject", "new@example.invalid", "New")
        db.commit()
        assert users.provision_oidc("issuer", "subject", "changed@example.invalid", "Changed").id == oidc.id
        oidc.active = False
        db.commit()
        with pytest.raises(ValueError, match="Identity unavailable"):
            users.provision_oidc("issuer", "subject", oidc.email, "New")
    engine.dispose()
