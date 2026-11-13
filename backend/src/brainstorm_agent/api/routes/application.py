"""Thin HTTP transport for the application session service."""

from collections.abc import AsyncIterator  # noqa: TC003
from contextlib import aclosing
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from brainstorm_agent.api.dependencies import get_session_service
from brainstorm_agent.api.schemas import PostMessageRequest  # noqa: TC001
from brainstorm_agent.core.application import (
    BacklogExport,
    CommentInput,
    DocumentDiff,
    FieldPatch,
    ReviewInput,
    SessionPage,
    SessionPatch,
    SliceSpecsExport,
    StagePatch,
)
from brainstorm_agent.core.enums import Stage  # noqa: TC001
from brainstorm_agent.core.models import SessionOverview, StepDocument  # noqa: TC001
from brainstorm_agent.core.research import Benchmark, FeatureSelection  # noqa: TC001
from brainstorm_agent.services.search import SearchProviderName
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.services.streaming import Keepalive, research_in_worker, stream_in_worker

router = APIRouter(prefix="/sessions", tags=["application"])
Service = Annotated[SessionService, Depends(get_session_service)]


@router.get("")
def list_sessions(
    service: Service,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    *,
    include_archived: bool = False,
) -> SessionPage:
    """List owner sessions with bounded pagination.

    Args:
        service (Service): Request parameter or session service.
        offset (Annotated[int, Query(ge=0)]): Request parameter or session service.
        limit (Annotated[int, Query(ge=1, le=100)]): Request parameter or session service.
        include_archived (bool): Request parameter or session service.

    Returns:
        SessionPage: Application service result.
    """
    return service.list_sessions(offset=offset, limit=limit, include_archived=include_archived)


@router.patch("/{session_id}")
def update_session(session_id: str, payload: SessionPatch, service: Service) -> SessionOverview:
    """Rename or archive an owned session.

    Args:
        session_id (str): Request parameter or session service.
        payload (SessionPatch): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.update_session(session_id, payload)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: str, service: Service) -> None:
    """Soft-delete an owned session.

    Args:
        session_id (str): Request parameter or session service.
        service (Service): Request parameter or session service.
    """
    service.update_session(session_id, SessionPatch(), delete=True)


@router.post("/{session_id}/stages/{stage}/reopen")
def reopen_stage(session_id: str, stage: Stage, service: Service) -> SessionOverview:
    """Reopen a previously visited stage, marking downstream stages stale.

    Args:
        session_id (str): Request parameter or session service.
        stage (Stage): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.reopen_stage(session_id, stage)


@router.patch("/{session_id}/stages/{stage}")
def edit_stage(session_id: str, stage: Stage, payload: StagePatch, service: Service) -> SessionOverview:
    """Replace supplied fields/item collections and revalidate without advancing.

    Args:
        session_id (str): Request parameter or session service.
        stage (Stage): Request parameter or session service.
        payload (StagePatch): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.edit_stage(session_id, stage, payload)


@router.patch("/{session_id}/stages/{stage}/fields/{field}")
def edit_field(
    session_id: str,
    stage: Stage,
    field: str,
    payload: FieldPatch,
    service: Service,
) -> SessionOverview:
    """Edit one stage field using its typed JSON value.

    Args:
        session_id (str): Request parameter or session service.
        stage (Stage): Request parameter or session service.
        field (str): Request parameter or session service.
        payload (FieldPatch): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.edit_stage(session_id, stage, StagePatch(fields={field: payload.value}))


@router.post("/{session_id}/comments")
def add_comment(session_id: str, payload: CommentInput, service: Service) -> SessionOverview:
    """Save section feedback for the next successful turn.

    Args:
        session_id (str): Request parameter or session service.
        payload (CommentInput): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.add_comment(session_id, payload)


@router.post("/{session_id}/review")
def submit_review(session_id: str, payload: ReviewInput, service: Service) -> SessionOverview:
    """Approve, reject, or request changes on the pending stage.

    Args:
        session_id (str): Request parameter or session service.
        payload (ReviewInput): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SessionOverview: Application service result.
    """
    return service.submit_review(session_id, payload)


@router.get("/{session_id}/stages/{stage}/documents")
def stage_documents(session_id: str, stage: Stage, service: Service) -> list[StepDocument]:
    """List immutable versions for one owned stage.

    Args:
        session_id (str): Request parameter or session service.
        stage (Stage): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        list[StepDocument]: Application service result.
    """
    return [item for item in service.list_documents(session_id) if item.stage == stage]


@router.get("/{session_id}/stages/{stage}/documents/diff")
def document_diff(
    session_id: str,
    stage: Stage,
    service: Service,
    from_version: Annotated[int, Query(ge=1)],
    to_version: Annotated[int, Query(ge=1)],
) -> DocumentDiff:
    """Compare two versions of the same stage document.

    Args:
        session_id (str): Request parameter or session service.
        stage (Stage): Request parameter or session service.
        service (Service): Request parameter or session service.
        from_version (Annotated[int, Query(ge=1)]): Request parameter or session service.
        to_version (Annotated[int, Query(ge=1)]): Request parameter or session service.

    Returns:
        DocumentDiff: Application service result.
    """
    return service.document_diff(session_id, stage, from_version, to_version)


@router.get("/{session_id}/export/backlog_json")
def export_backlog(session_id: str, service: Service) -> BacklogExport:
    """Export validated backlog assignments, dependencies and delivery waves.

    Args:
        session_id (str): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        BacklogExport: Application service result.
    """
    return service.export_backlog(session_id)


@router.get("/{session_id}/export/slice_specs")
def export_specs(session_id: str, service: Service) -> SliceSpecsExport:
    """Export validated standalone Markdown slice specifications.

    Args:
        session_id (str): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        SliceSpecsExport: Application service result.
    """
    return service.export_slice_specs(session_id)


@router.post(
    "/{session_id}/turns",
    responses={
        200: {
            "description": "SSE: event is the discriminant, data is JSON. Deltas are tentative until turn.completed. "
            "Exactly one terminal event: turn.completed or error. No replay/resume support. "
            "While the turn is silent, a `: keepalive` SSE comment is sent every 15 s; clients ignore it.",
            "content": {"text/event-stream": {"schema": {"$ref": "#/components/schemas/TurnEvent"}}},
        },
    },
)
async def stream_turn(session_id: str, payload: PostMessageRequest, service: Service) -> StreamingResponse:
    """Stream analysis status, live reply deltas, committed state, and terminal result.

    Args:
        session_id (str): Request parameter or session service.
        payload (PostMessageRequest): Request parameter or session service.
        service (Service): Request parameter or session service.

    Returns:
        StreamingResponse: Application service result.
    """
    await run_in_threadpool(service.prepare_turn, session_id)

    async def events() -> AsyncIterator[str]:
        async with aclosing(stream_in_worker(service, session_id, payload.content)) as stream:
            async for event in stream:
                if isinstance(event, Keepalive):
                    yield ": keepalive\n\n"
                else:
                    yield f"event: {event.type}\ndata: {event.model_dump_json()}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{session_id}/research")
def research_history(session_id: str, service: Service) -> dict:
    """Read owned benchmark history and configured availability.

    Args:
        session_id (str): Owned session.
        service (Service): Application service.

    Returns:
        dict: Availability and versioned results.
    """
    return {
        "enabled": service.settings.search_provider is not SearchProviderName.NONE,
        "benchmarks": service.list_benchmarks(session_id),
    }


@router.post("/{session_id}/research")
async def research_products(session_id: str, service: Service) -> StreamingResponse:
    """Stream research completion while its async network calls execute.

    Args:
        session_id (str): Owned session.
        service (Service): Application service.

    Returns:
        StreamingResponse: Start and terminal SSE events.
    """
    await run_in_threadpool(service.prepare_research, session_id)

    async def events() -> AsyncIterator[str]:
        yield "event: research.started\ndata: {}\n\n"
        try:
            result = await research_in_worker(service, session_id)
            yield f"event: research.completed\ndata: {result.model_dump_json()}\n\n"
        except Exception:
            await run_in_threadpool(service.db_session.rollback)
            yield 'event: error\ndata: {"message":"La recherche a échoué. Vérifiez le fournisseur ou réessayez."}\n\n'

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/{session_id}/research/{benchmark_id}/selection")
def select_research_features(
    session_id: str,
    benchmark_id: str,
    payload: FeatureSelection,
    service: Service,
) -> Benchmark:
    """Persist explicit owner selection.

    Args:
        session_id (str): Owned session.
        benchmark_id (str): Execution id.
        payload (FeatureSelection): Selected candidate ids.
        service (Service): Application service.

    Returns:
        Benchmark: Updated execution.
    """
    return service.select_features(session_id, benchmark_id, payload)
