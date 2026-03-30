from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import inspect

from brainstorm_agent.persistence.session import create_engine_from_settings, upgrade_database
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
