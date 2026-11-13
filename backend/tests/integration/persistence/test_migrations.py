from __future__ import annotations

from typing import TYPE_CHECKING

from alembic import command
from sqlalchemy import inspect, text

from brainstorm_agent.persistence.session import alembic_config, create_engine_from_settings, upgrade_database
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path


def test_alembic_upgrade_creates_expected_tables(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'migrations.db'}"
    upgrade_database(database_url=database_url)
    engine = create_engine_from_settings(Settings(database_url=database_url))

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    assert "sessions" in tables
    assert "messages" in tables
    assert "documents" in tables
    assert "open_questions" in tables
    assert "human_review_decisions" in tables


def test_ownership_backfill_and_downgrade(tmp_path: Path) -> None:
    url = f"sqlite+pysqlite:///{tmp_path / 'backfill.db'}"
    upgrade_database(database_url=url, revision="0001_initial_schema")
    engine = create_engine_from_settings(Settings(database_url=url))
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO sessions (id, current_stage, state_payload, created_at, updated_at) VALUES ('legacy', 'stage_0_pitch', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
            ),
        )
    upgrade_database(database_url=url)
    with engine.connect() as connection:
        owner = connection.execute(text("SELECT owner_id FROM sessions WHERE id='legacy'")).scalar_one()
        assert (
            connection.execute(text("SELECT email FROM users WHERE id=:id"), {"id": owner}).scalar_one()
            == "bootstrap@localhost.invalid"
        )
    command.downgrade(alembic_config(database_url=url), "0001_initial_schema")
    assert "users" not in inspect(engine).get_table_names()
    assert "owner_id" not in {column["name"] for column in inspect(engine).get_columns("sessions")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT id FROM sessions")).scalar_one() == "legacy"
    upgrade_database(database_url=url)
    engine.dispose()
