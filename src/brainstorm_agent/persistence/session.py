"""Database engine and session helpers."""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from brainstorm_agent.persistence.base import Base

if TYPE_CHECKING:
    from collections.abc import Iterator

    from sqlalchemy.engine import Engine
    from sqlalchemy.orm import Session

    from brainstorm_agent.settings import Settings


def create_engine_from_settings(settings: Settings) -> Engine:
    """Create a SQLAlchemy engine from settings.

    Args:
        settings: Application settings.

    Returns:
        Engine: Configured SQLAlchemy engine.
    """
    connect_args: dict[str, object] = {}
    if settings.is_sqlite:
        connect_args["check_same_thread"] = False
    return create_engine(settings.database_url, future=True, connect_args=connect_args)


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    """Create a SQLAlchemy session factory.

    Args:
        engine: Database engine.

    Returns:
        sessionmaker[Session]: Configured session factory.
    """
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def create_all(engine: Engine) -> None:
    """Create all database tables.

    Args:
        engine: Database engine.
    """
    Base.metadata.create_all(engine)


@contextmanager
def session_scope(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    """Yield a managed database session.

    Args:
        session_factory: Session factory to use.

    Yields:
        Session: Managed SQLAlchemy session.
    """
    session = session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
