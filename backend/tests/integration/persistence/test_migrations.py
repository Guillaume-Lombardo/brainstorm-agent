from __future__ import annotations

import os
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

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


@pytest.fixture(params=["sqlite", "postgres"])
def document_kind_database_url(tmp_path: Path, request: pytest.FixtureRequest):
    if request.param == "sqlite":
        yield f"sqlite+pysqlite:///{tmp_path / 'document-kind.db'}"
        return
    postgres_url = os.environ.get("TEST_POSTGRES_URL")
    if not postgres_url:
        pytest.skip("TEST_POSTGRES_URL requires an isolated PostgreSQL test database.")
    assert make_url(postgres_url).database == "brainstorm_test"
    engine = create_engine(postgres_url)
    schema = f"document_kind_{uuid4().hex}"
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    try:
        # An unescaped '=' is valid in a query value and avoids ConfigParser interpolation.
        separator = "&" if make_url(postgres_url).query else "?"
        yield f"{postgres_url}{separator}options=-csearch_path={schema}"
    finally:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


def test_document_kind_backfill_and_downgrade(document_kind_database_url: str) -> None:
    url = document_kind_database_url
    upgrade_database(database_url=url, revision="0003")
    engine = create_engine_from_settings(Settings(database_url=url))
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO sessions (id, owner_id, current_stage, state_payload, created_at, updated_at) "
                "SELECT 'legacy-final', id, 'stage_0_pitch', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM users LIMIT 1",
            ),
        )
        connection.execute(
            text(
                "INSERT INTO documents (id, session_id, stage, version, markdown, summary, facts_payload, "
                "assumptions_payload, decisions_payload, uncertainties_payload, open_questions_payload, "
                "risks_payload, is_current, created_at) VALUES ('legacy-doc', 'legacy-final', 'stage_0_pitch', 1, "
                "'Legacy document', 'Legacy', '[]', '[]', '[]', '[]', '[]', '[]', true, CURRENT_TIMESTAMP)",
            ),
        )
    upgrade_database(database_url=url)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT kind FROM documents")).scalar_one() == "working"
    command.downgrade(alembic_config(database_url=url), "0003")
    assert "kind" not in {column["name"] for column in inspect(engine).get_columns("documents")}
    with engine.connect() as connection:
        assert connection.execute(text("SELECT markdown FROM documents")).scalar_one() == "Legacy document"
    upgrade_database(database_url=url)
    engine.dispose()
