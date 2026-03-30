"""FastAPI dependency wiring."""

from __future__ import annotations

from secrets import compare_digest
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Header, HTTPException, Request, status
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
from brainstorm_agent.services.metrics import MetricsRegistry
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


def get_prompt_loader(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> PromptLoader:
    """Build the prompt loader dependency.

    Args:
        settings: Application settings.

    Returns:
        PromptLoader: Prompt loader backed by packaged resources.
    """
    return PromptLoader.from_settings(settings)


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


def get_metrics(request: Request) -> MetricsRegistry:
    """Return the shared metrics registry.

    Args:
        request: FastAPI request.

    Returns:
        MetricsRegistry: Shared in-process metrics registry.
    """
    return request.app.state.metrics


def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    """Require a configured API key when auth is enabled.

    Args:
        request: FastAPI request.
        x_api_key: API key provided by the caller.

    Raises:
        HTTPException: If auth is enabled and the API key is missing or invalid.
    """
    settings = request.app.state.settings
    if not settings.enable_auth:
        return
    if x_api_key and any(compare_digest(x_api_key, candidate) for candidate in settings.auth_api_keys):
        return
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid X-API-Key header is required.",
    )


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
    app.state.metrics = MetricsRegistry()
    try:
        redis_client = Redis.from_url(settings.redis_url)
        redis_client.ping()
        app.state.redis = redis_client
        app.state.lock_manager = RedisSessionLockManager(
            redis_client,
            timeout_seconds=settings.redis_lock_timeout_seconds,
            blocking_timeout_seconds=settings.redis_lock_blocking_timeout_seconds,
        )
    except Exception:
        app.state.redis = None
        app.state.lock_manager = NoopSessionLockManager()
