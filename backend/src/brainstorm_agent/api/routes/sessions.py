"""Session API routes."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse

from brainstorm_agent.api.dependencies import get_session_service
from brainstorm_agent.api.schemas import (
    ConversationHistoryResponse,
    CreateSessionResponse,
    DocumentsResponse,
    ExportJsonResponse,
    ExportMarkdownResponse,
    HumanReviewRequest,
    HumanReviewsResponse,
    PostMessageRequest,
    PostMessageResponse,
    SessionResponse,
)
from brainstorm_agent.core.models import StepDocument  # noqa: TC001
from brainstorm_agent.services.session_service import SessionService  # noqa: TC001

if TYPE_CHECKING:
    from collections.abc import Iterator

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
def create_session(
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> CreateSessionResponse:
    """Create a new brainstorming session.

    Args:
        session_service: Session application service.

    Returns:
        CreateSessionResponse: Newly created session payload.
    """
    overview = session_service.create_session()
    return CreateSessionResponse(
        session_id=overview.session_id,
        current_stage=overview.current_stage,
        message="Please share your initial project pitch. Keep it free-form if needed.",
    )


@router.post("/{session_id}/messages", response_model=PostMessageResponse)
def post_message(
    session_id: str,
    payload: PostMessageRequest,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> PostMessageResponse:
    """Process one user message for a session.

    Args:
        session_id: Session identifier.
        payload: Message payload.
        session_service: Session application service.

    Returns:
        PostMessageResponse: Structured assistant response.
    """
    output = session_service.process_user_message(
        session_id=session_id,
        content=payload.content,
        modality=payload.modality,
    )
    return PostMessageResponse.model_validate(output.model_dump(mode="json"))


@router.post("/{session_id}/messages/stream")
def post_message_stream(
    session_id: str,
    payload: PostMessageRequest,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> StreamingResponse:
    """Process one user message and return an SSE stream with the final payload.

    Args:
        session_id: Session identifier.
        payload: Message payload.
        session_service: Session application service.

    Returns:
        StreamingResponse: Server-sent events stream.
    """
    output = session_service.process_user_message(
        session_id=session_id,
        content=payload.content,
        modality=payload.modality,
    )
    event_payload = PostMessageResponse.model_validate(output.model_dump(mode="json")).model_dump(mode="json")

    def event_stream() -> Iterator[str]:
        yield "event: session.message.completed\n"
        yield f"data: {json.dumps(event_payload)}\n\n"
        yield "event: done\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/{session_id}", response_model=SessionResponse)
def get_session(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> SessionResponse:
    """Return the current state of a session.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        SessionResponse: Session snapshot.
    """
    return SessionResponse.model_validate(session_service.get_session(session_id).model_dump(mode="json"))


@router.get("/{session_id}/messages", response_model=ConversationHistoryResponse)
def list_messages(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> ConversationHistoryResponse:
    """Return message history for a session.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        ConversationHistoryResponse: Ordered conversation turns.
    """
    return ConversationHistoryResponse(items=session_service.list_messages(session_id))


@router.get("/{session_id}/document")
def get_current_document(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> StepDocument:
    """Return the latest current stage document.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        StepDocument: Current stage document.
    """
    return session_service.get_current_document(session_id)


@router.get("/{session_id}/documents", response_model=DocumentsResponse)
def list_documents(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> DocumentsResponse:
    """Return all versioned stage documents for a session.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        DocumentsResponse: Versioned documents.
    """
    return DocumentsResponse(items=session_service.list_documents(session_id))


@router.get("/{session_id}/export/markdown", response_model=ExportMarkdownResponse)
def export_markdown(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> ExportMarkdownResponse:
    """Export the full session as consolidated Markdown.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        ExportMarkdownResponse: Markdown export payload.
    """
    return ExportMarkdownResponse(
        session_id=session_id,
        markdown=session_service.export_markdown(session_id),
    )


@router.get("/{session_id}/export/json", response_model=ExportJsonResponse)
def export_json(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> ExportJsonResponse:
    """Export the full session as structured JSON.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        ExportJsonResponse: Structured JSON export payload.
    """
    return ExportJsonResponse(
        session_id=session_id,
        payload=session_service.export_json(session_id),
    )


@router.get("/{session_id}/reviews", response_model=HumanReviewsResponse)
def list_human_reviews(
    session_id: str,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> HumanReviewsResponse:
    """List human review decisions for a session.

    Args:
        session_id: Session identifier.
        session_service: Session application service.

    Returns:
        HumanReviewsResponse: Human review history.
    """
    return HumanReviewsResponse(items=session_service.list_human_reviews(session_id))


@router.post("/{session_id}/reviews", response_model=SessionResponse)
def review_pending_transition(
    session_id: str,
    payload: HumanReviewRequest,
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> SessionResponse:
    """Approve or reject a pending human-reviewed transition.

    Args:
        session_id: Session identifier.
        payload: Review payload.
        session_service: Session application service.

    Returns:
        SessionResponse: Updated session overview.
    """
    overview = session_service.review_pending_transition(
        session_id=session_id,
        approved=payload.decision.value == "approved",
        note=payload.note,
    )
    return SessionResponse.model_validate(overview.model_dump(mode="json"))
