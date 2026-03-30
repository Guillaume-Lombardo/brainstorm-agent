"""OpenAI-compatible API facade routes."""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse, StreamingResponse

from brainstorm_agent.api.dependencies import get_app_settings, get_session_service
from brainstorm_agent.api.schemas import (
    OpenAIBrainstormPayload,
    OpenAIChatCompletionRequest,
    OpenAIChatCompletionResponse,
    OpenAICompletionChoice,
    OpenAICompletionMessage,
    OpenAIModelCard,
    OpenAIModelsResponse,
    OpenAIResponseOutputMessage,
    OpenAIResponseOutputText,
    OpenAIResponsesRequest,
    OpenAIResponsesResponse,
    OpenAIUsage,
)
from brainstorm_agent.exceptions import InvalidOpenAIRequestError, NotFoundError, UnsupportedOpenAIModelError
from brainstorm_agent.services.openai_facade import OpenAIChatFacade, OpenAIChatFacadeResult
from brainstorm_agent.services.session_service import SessionService  # noqa: TC001
from brainstorm_agent.settings import Settings  # noqa: TC001

if TYPE_CHECKING:
    from collections.abc import Iterator, Sequence

router = APIRouter(prefix="/v1", tags=["openai-compatible"])


def _openai_error(
    *,
    status_code: int,
    message: str,
    code: str,
    error_type: str = "invalid_request_error",
) -> JSONResponse:
    """Build an OpenAI-compatible error response.

    Args:
        status_code: HTTP status code.
        message: Human-readable error message.
        code: Stable error code.
        error_type: OpenAI-compatible error type.

    Returns:
        JSONResponse: OpenAI-shaped error payload.
    """
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": message,
                "type": error_type,
                "param": None,
                "code": code,
            },
        },
    )


def _build_facade(
    *,
    settings: Settings,
    session_service: SessionService,
) -> OpenAIChatFacade:
    """Build the OpenAI facade service.

    Args:
        settings: Application settings.
        session_service: Session application service.

    Returns:
        OpenAIChatFacade: Configured facade service.
    """
    return OpenAIChatFacade(
        session_service=session_service,
        public_model_name=settings.openai_facade_model_name,
    )


def _run_facade(
    *,
    facade: OpenAIChatFacade,
    model: str,
    messages: Sequence[tuple[str, str]],
    metadata: dict[str, object],
) -> OpenAIChatFacadeResult:
    """Run the facade with shared error handling delegated to the route.

    Args:
        facade: OpenAI facade service.
        model: Requested model alias.
        messages: Flattened messages.
        metadata: Request metadata.

    Returns:
        OpenAIChatFacadeResult: Processed facade result.
    """
    return facade.process_chat_completion(model=model, messages=messages, metadata=metadata)


def _build_chat_completion_response(result: OpenAIChatFacadeResult) -> OpenAIChatCompletionResponse:
    """Build a chat completions response from a facade result.

    Args:
        result: Processed facade result.

    Returns:
        OpenAIChatCompletionResponse: OpenAI-compatible completion payload.
    """
    return OpenAIChatCompletionResponse(
        model=result.public_model_name,
        choices=[
            OpenAICompletionChoice(
                message=OpenAICompletionMessage(content=result.content),
            ),
        ],
        usage=OpenAIUsage(
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.prompt_tokens + result.completion_tokens,
        ),
        brainstorm=OpenAIBrainstormPayload(
            session_id=result.session_id,
            current_stage=result.output.current_stage,
            processed_stage=result.output.processed_stage,
            next_stage=result.output.next_stage,
            stage_clear_enough=result.output.stage_clear_enough,
            summary=result.output.summary,
            open_questions=result.output.open_questions,
            transition_decision_reason=result.output.transition_decision_reason,
        ),
    )


def _build_responses_response(result: OpenAIChatFacadeResult) -> OpenAIResponsesResponse:
    """Build a `/v1/responses` payload from a facade result.

    Args:
        result: Processed facade result.

    Returns:
        OpenAIResponsesResponse: OpenAI-compatible responses payload.
    """
    return OpenAIResponsesResponse(
        model=result.public_model_name,
        output=[
            OpenAIResponseOutputMessage(
                content=[OpenAIResponseOutputText(text=result.content)],
            ),
        ],
        usage=OpenAIUsage(
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.prompt_tokens + result.completion_tokens,
        ),
        brainstorm=OpenAIBrainstormPayload(
            session_id=result.session_id,
            current_stage=result.output.current_stage,
            processed_stage=result.output.processed_stage,
            next_stage=result.output.next_stage,
            stage_clear_enough=result.output.stage_clear_enough,
            summary=result.output.summary,
            open_questions=result.output.open_questions,
            transition_decision_reason=result.output.transition_decision_reason,
        ),
    )


def _stream_chat_completion_payload(result: OpenAIChatFacadeResult) -> StreamingResponse:
    """Stream a single OpenAI-style completion as server-sent events.

    Args:
        result: Processed facade result.

    Returns:
        StreamingResponse: SSE payload.
    """
    response_payload = _build_chat_completion_response(result).model_dump(mode="json")

    def event_stream() -> Iterator[str]:
        chunk = {
            "id": response_payload["id"],
            "object": "chat.completion.chunk",
            "created": response_payload["created"],
            "model": response_payload["model"],
            "choices": [
                {
                    "index": 0,
                    "delta": {"role": "assistant", "content": result.content},
                    "finish_reason": "stop",
                },
            ],
            "brainstorm": response_payload["brainstorm"],
        }
        yield f"data: {json.dumps(chunk)}\n\n"
        yield "data: [DONE]\n\n"

    stream_response = StreamingResponse(event_stream(), media_type="text/event-stream")
    stream_response.headers["X-Brainstorm-Session-Id"] = result.session_id
    return stream_response


def _stream_responses_payload(result: OpenAIChatFacadeResult) -> StreamingResponse:
    """Stream a single `/v1/responses` result as server-sent events.

    Args:
        result: Processed facade result.

    Returns:
        StreamingResponse: SSE payload.
    """
    response_payload = _build_responses_response(result).model_dump(mode="json")

    def event_stream() -> Iterator[str]:
        yield f"event: response.created\ndata: {json.dumps(response_payload)}\n\n"
        yield (
            "event: response.output_text.delta\n"
            f"data: {json.dumps({'delta': result.content, 'session_id': result.session_id})}\n\n"
        )
        yield "event: response.completed\ndata: {}\n\n"

    stream_response = StreamingResponse(event_stream(), media_type="text/event-stream")
    stream_response.headers["X-Brainstorm-Session-Id"] = result.session_id
    return stream_response


def _handle_facade_errors(exc: Exception) -> JSONResponse:
    """Convert facade exceptions into OpenAI-compatible errors.

    Args:
        exc: Raised exception.

    Returns:
        JSONResponse: OpenAI-compatible error response.
    """
    if isinstance(exc, NotFoundError):
        return _openai_error(
            status_code=status.HTTP_404_NOT_FOUND,
            message=str(exc),
            code="session_not_found",
        )
    if isinstance(exc, UnsupportedOpenAIModelError):
        return _openai_error(
            status_code=status.HTTP_404_NOT_FOUND,
            message=str(exc),
            code="model_not_found",
        )
    return _openai_error(
        status_code=status.HTTP_400_BAD_REQUEST,
        message=str(exc),
        code="invalid_messages",
    )


@router.get("/models", response_model=OpenAIModelsResponse)
def list_models(
    settings: Annotated[Settings, Depends(get_app_settings)],
) -> OpenAIModelsResponse:
    """List the OpenAI-compatible models exposed by the backend.

    Args:
        settings: Application settings.

    Returns:
        OpenAIModelsResponse: Exposed public model aliases.
    """
    return OpenAIModelsResponse(
        data=[
            OpenAIModelCard(
                id=settings.openai_facade_model_name,
                created=0,
            ),
        ],
    )


@router.post("/chat/completions", response_model=OpenAIChatCompletionResponse)
def create_chat_completion(
    payload: OpenAIChatCompletionRequest,
    response: Response,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> OpenAIChatCompletionResponse | JSONResponse | StreamingResponse:
    """Process an OpenAI-compatible chat completion request.

    Args:
        payload: OpenAI-compatible request payload.
        response: FastAPI response object used for response headers.
        settings: Application settings.
        session_service: Session application service.

    Returns:
        OpenAIChatCompletionResponse | JSONResponse | StreamingResponse:
            Completion payload, stream, or OpenAI-shaped error.
    """
    facade = _build_facade(settings=settings, session_service=session_service)
    flattened_messages = [(message.role, message.as_text()) for message in payload.messages]

    try:
        result = _run_facade(
            facade=facade,
            model=payload.model,
            messages=flattened_messages,
            metadata=payload.metadata,
        )
    except (NotFoundError, UnsupportedOpenAIModelError, InvalidOpenAIRequestError) as exc:
        return _handle_facade_errors(exc)

    if payload.stream:
        return _stream_chat_completion_payload(result)

    response.headers["X-Brainstorm-Session-Id"] = result.session_id
    return _build_chat_completion_response(result)


@router.post("/responses", response_model=OpenAIResponsesResponse)
def create_response(
    payload: OpenAIResponsesRequest,
    response: Response,
    settings: Annotated[Settings, Depends(get_app_settings)],
    session_service: Annotated[SessionService, Depends(get_session_service)],
) -> OpenAIResponsesResponse | JSONResponse | StreamingResponse:
    """Process an OpenAI-compatible `/v1/responses` request.

    Args:
        payload: OpenAI-compatible responses request payload.
        response: FastAPI response object used for response headers.
        settings: Application settings.
        session_service: Session application service.

    Returns:
        OpenAIResponsesResponse | JSONResponse | StreamingResponse: Response payload or stream.
    """
    facade = _build_facade(settings=settings, session_service=session_service)
    if isinstance(payload.input, str):
        flattened_messages = [("user", payload.input)]
    else:
        flattened_messages = [(message.role, message.as_text()) for message in payload.input]
    try:
        result = _run_facade(
            facade=facade,
            model=payload.model,
            messages=flattened_messages,
            metadata=payload.metadata,
        )
    except (NotFoundError, UnsupportedOpenAIModelError, InvalidOpenAIRequestError) as exc:
        return _handle_facade_errors(exc)

    if payload.stream:
        return _stream_responses_payload(result)

    response.headers["X-Brainstorm-Session-Id"] = result.session_id
    return _build_responses_response(result)
