"""OpenAI-compatible API facade routes."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse

from brainstorm_agent.api.dependencies import get_app_settings, get_session_service
from brainstorm_agent.api.schemas import (
    OpenAIBrainstormPayload,
    OpenAIChatCompletionRequest,
    OpenAIChatCompletionResponse,
    OpenAICompletionChoice,
    OpenAICompletionMessage,
    OpenAIModelCard,
    OpenAIModelsResponse,
    OpenAIUsage,
)
from brainstorm_agent.exceptions import InvalidOpenAIRequestError, NotFoundError, UnsupportedOpenAIModelError
from brainstorm_agent.services.openai_facade import OpenAIChatFacade
from brainstorm_agent.services.session_service import SessionService  # noqa: TC001
from brainstorm_agent.settings import Settings  # noqa: TC001

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
) -> OpenAIChatCompletionResponse | JSONResponse:
    """Process an OpenAI-compatible chat completion request.

    Args:
        payload: OpenAI-compatible request payload.
        response: FastAPI response object used for response headers.
        settings: Application settings.
        session_service: Session application service.

    Returns:
        OpenAIChatCompletionResponse | JSONResponse: Completion payload or OpenAI-shaped error.
    """
    if payload.stream:
        return _openai_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Streaming is not supported on the OpenAI-compatible facade yet.",
            code="stream_unsupported",
        )

    facade = OpenAIChatFacade(
        session_service=session_service,
        public_model_name=settings.openai_facade_model_name,
    )
    flattened_messages = [(message.role, message.as_text()) for message in payload.messages]

    try:
        result = facade.process_chat_completion(
            model=payload.model,
            messages=flattened_messages,
            metadata=payload.metadata,
        )
    except NotFoundError as exc:
        return _openai_error(
            status_code=status.HTTP_404_NOT_FOUND,
            message=str(exc),
            code="session_not_found",
        )
    except UnsupportedOpenAIModelError as exc:
        return _openai_error(
            status_code=status.HTTP_404_NOT_FOUND,
            message=str(exc),
            code="model_not_found",
        )
    except InvalidOpenAIRequestError as exc:
        return _openai_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message=str(exc),
            code="invalid_messages",
        )

    response.headers["X-Brainstorm-Session-Id"] = result.session_id
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
