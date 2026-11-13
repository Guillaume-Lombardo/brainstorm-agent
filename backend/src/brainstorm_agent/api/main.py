"""FastAPI application entry point."""

from __future__ import annotations

from time import perf_counter
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import TypeAdapter
from sqlalchemy import text

from brainstorm_agent.api.dependencies import configure_application_state, enforce_api_security
from brainstorm_agent.api.routes.application import router as application_router
from brainstorm_agent.api.routes.auth import router as auth_router
from brainstorm_agent.api.routes.openai import router as openai_router
from brainstorm_agent.api.routes.sessions import router as session_router
from brainstorm_agent.core.application import TurnEvent
from brainstorm_agent.core.stage_contracts import STAGE_MODELS
from brainstorm_agent.exceptions import ConflictError, LLMResponseError, LockAcquisitionError, NotFoundError
from brainstorm_agent.logging import get_logger
from brainstorm_agent.settings import get_settings

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from brainstorm_agent.settings import Settings


def _build_health_payload(app: FastAPI) -> dict[str, object]:
    """Build the shared health payload.

    Args:
        app: FastAPI application.

    Returns:
        dict[str, object]: Health payload.
    """
    database_status = "ok"
    try:
        with app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        database_status = "degraded"
    return {
        "status": "ok",
        "database": database_status,
        "redis": "ok" if app.state.redis is not None else "degraded",
        "auth_enabled": app.state.settings.enable_auth,
        "human_review_required": app.state.settings.require_human_validation_for_transitions,
    }


def _register_exception_handlers(app: FastAPI) -> None:
    """Register exception handlers on the FastAPI app.

    Args:
        app: FastAPI application.
    """

    @app.exception_handler(NotFoundError)
    def handle_not_found(_: Request, exc: NotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(ConflictError)
    def handle_conflict(_: Request, exc: ConflictError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": str(exc)})

    @app.exception_handler(LLMResponseError)
    def handle_llm_response_error(_: Request, exc: LLMResponseError) -> JSONResponse:
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(LockAcquisitionError)
    def handle_lock_timeout(_: Request, exc: LockAcquisitionError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})


def _register_health_routes(app: FastAPI) -> None:
    """Register health and metrics routes.

    Args:
        app: FastAPI application.
    """

    @app.get("/healthz")
    def healthcheck() -> dict[str, object]:
        return _build_health_payload(app)

    @app.get("/livez")
    def livez() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz(response: Response) -> dict[str, object]:
        payload = _build_health_payload(app)
        if payload["database"] != "ok":
            response.status_code = 503
        return payload

    @app.get("/metrics", response_class=PlainTextResponse, dependencies=[Depends(enforce_api_security)])
    def metrics() -> str:
        return app.state.metrics.render_prometheus()


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
    if app_settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=app_settings.cors_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "X-API-Key"],
        )
    logger = get_logger("brainstorm_agent.api")
    configure_application_state(app, app_settings)
    app.include_router(auth_router, prefix=app_settings.api_v1_prefix)
    app.include_router(openai_router, dependencies=[Depends(enforce_api_security)])
    app.include_router(
        application_router,
        prefix=app_settings.api_v1_prefix,
        dependencies=[Depends(enforce_api_security)],
    )
    app.include_router(
        session_router,
        prefix=app_settings.api_v1_prefix,
        dependencies=[Depends(enforce_api_security)],
    )

    @app.middleware("http")
    async def add_request_context(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("X-Request-Id", str(uuid4()))
        request.state.request_id = request_id
        start = perf_counter()
        response = await call_next(request)
        duration = perf_counter() - start
        route = request.scope.get("route")
        route_path = getattr(route, "path", "unmatched")
        app.state.metrics.record_request(
            method=request.method,
            path=str(route_path),
            status_code=response.status_code,
            duration_seconds=duration,
        )
        response.headers["X-Request-Id"] = request_id
        logger.info(
            "request_completed",
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_seconds=round(duration, 6),
        )
        return response

    _register_health_routes(app)
    _register_exception_handlers(app)
    original_openapi = app.openapi

    def application_openapi() -> dict[str, Any]:
        schema = original_openapi()
        event = TypeAdapter(TurnEvent).json_schema(ref_template="#/components/schemas/{model}")
        schema["components"]["schemas"].update(event.pop("$defs", {}))
        components = schema["components"]["schemas"]
        components["TurnEvent"] = event
        concrete_fields = []
        for model in STAGE_MODELS.values():
            fields = model.model_json_schema(ref_template="#/components/schemas/{model}")  # noqa: RUF027
            components.update(fields.pop("$defs", {}))
            components[model.__name__] = fields
            concrete_fields.append({"$ref": f"#/components/schemas/{model.__name__}"})
        components["StageFields"] = {"anyOf": concrete_fields}
        return schema

    app.openapi: Any = application_openapi
    return app
