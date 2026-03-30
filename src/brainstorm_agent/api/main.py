"""FastAPI application entry point."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from brainstorm_agent.api.dependencies import configure_application_state
from brainstorm_agent.api.routes.sessions import router as session_router
from brainstorm_agent.exceptions import LLMResponseError, LockAcquisitionError, NotFoundError
from brainstorm_agent.settings import get_settings

if TYPE_CHECKING:
    from brainstorm_agent.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the FastAPI application.

    Args:
        settings: Optional application settings override.

    Returns:
        FastAPI: Configured application instance.
    """
    app_settings = settings or get_settings()
    app = FastAPI(
        title="brainstorm-agent",
        version="0.1.0",
        description="Strict staged brainstorming backend with LangGraph orchestration.",
    )
    configure_application_state(app, app_settings)
    app.include_router(session_router, prefix=app_settings.api_v1_prefix)

    @app.get("/healthz")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(NotFoundError)
    def handle_not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(LLMResponseError)
    def handle_llm_response_error(_: Request, exc: LLMResponseError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(LockAcquisitionError)
    def handle_lock_timeout(_: Request, exc: LockAcquisitionError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    return app
