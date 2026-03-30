"""FastAPI dependency wiring."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Request
from redis import Redis
from sqlalchemy.orm import Session  # noqa: TC002

from brainstorm_agent.persistence.session import (
    create_all,
    create_engine_from_settings,
    create_session_factory,
)
from brainstorm_agent.services.llm_client import BrainstormLLM, build_llm
from brainstorm_agent.services.locks import (
    NoopSessionLockManager,
    RedisSessionLockManager,
    SessionLockManager,
)
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings  # noqa: TC001

if TYPE_CHECKING:
    from collections.abc import Iterator

    from fastapi import FastAPI


def get_app_settings(request: Request) -> Settings:
    """Return application settings dependency.

    Args:
        request: FastAPI request.

    Returns:
        Settings: Loaded application settings.
    """
    return request.app.state.settings


def get_db_session(request: Request) -> Iterator[Session]:
    """Yield a request-scoped database session.

    Args:
        request: FastAPI request.

    Yields:
        Session: SQLAlchemy session.
    """
    session_factory = request.app.state.session_factory
    db_session = session_factory()
    try:
        yield db_session
    finally:
        db_session.close()


def get_prompt_loader() -> PromptLoader:
    """Build the prompt loader dependency.

    Returns:
        PromptLoader: Prompt loader rooted at the repository prompt directory.
    """
    return PromptLoader(base_path=Path(__file__).resolve().parents[3] / "prompts")


def get_llm(
    settings: Annotated[Settings, Depends(get_app_settings)],
    prompt_loader: Annotated[PromptLoader, Depends(get_prompt_loader)],
) -> BrainstormLLM:
    """Build the configured LLM dependency.

    Args:
        settings: Application settings.
        prompt_loader: Prompt loader.

    Returns:
        BrainstormLLM: Structured LLM implementation.
    """
    return build_llm(settings=settings, prompt_loader=prompt_loader)


def get_lock_manager(request: Request) -> SessionLockManager:
    """Return the configured session lock manager.

    Args:
        request: FastAPI request.

    Returns:
        SessionLockManager: Configured lock manager.
    """
    return request.app.state.lock_manager


def get_session_service(
    db_session: Annotated[Session, Depends(get_db_session)],
    settings: Annotated[Settings, Depends(get_app_settings)],
    llm: Annotated[BrainstormLLM, Depends(get_llm)],
    prompt_loader: Annotated[PromptLoader, Depends(get_prompt_loader)],
    lock_manager: Annotated[SessionLockManager, Depends(get_lock_manager)],
) -> SessionService:
    """Build the session service dependency.

    Args:
        db_session: Database session.
        settings: Application settings.
        llm: Structured LLM adapter.
        prompt_loader: Prompt loader.
        lock_manager: Session lock manager.

    Returns:
        SessionService: Configured application service.
    """
    return SessionService(
        db_session=db_session,
        settings=settings,
        llm=llm,
        prompt_loader=prompt_loader,
        lock_manager=lock_manager,
    )


def configure_application_state(app: FastAPI, settings: Settings) -> None:
    """Configure shared application state.

    Args:
        app: FastAPI application.
        settings: Application settings.
    """
    engine = create_engine_from_settings(settings)
    app.state.settings = settings
    create_all(engine)
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    try:
        redis_client = Redis.from_url(settings.redis_url)
        redis_client.ping()
        app.state.redis = redis_client
        app.state.lock_manager = RedisSessionLockManager(redis_client)
    except Exception:
        app.state.redis = None
        app.state.lock_manager = NoopSessionLockManager()
