"""OpenAI-compatible facade for the brainstorming backend."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from brainstorm_agent.exceptions import (
    MISSING_USER_MESSAGE_ERROR,
    InvalidOpenAIRequestError,
    UnsupportedOpenAIModelError,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from brainstorm_agent.core.models import AssistantTurnOutput


def _approximate_token_count(content: str) -> int:
    """Return a coarse token approximation for OpenAI-compatible usage fields.

    Args:
        content: Text content to estimate.

    Returns:
        int: Approximate token count.
    """
    return max(1, len(content.split())) if content.strip() else 0


@dataclass
class OpenAIChatFacadeResult:
    """Result of an OpenAI-compatible chat completion call."""

    session_id: str
    public_model_name: str
    content: str
    output: AssistantTurnOutput
    prompt_tokens: int
    completion_tokens: int


class SessionOverviewLike(Protocol):
    """Protocol for the subset of session overview data used by the facade."""

    session_id: str


class SessionServiceLike(Protocol):
    """Protocol for the subset of session service behavior used by the facade."""

    def create_session(self) -> SessionOverviewLike:
        """Create a new brainstorming session."""

    def process_user_message(self, *, session_id: str, content: str) -> AssistantTurnOutput:
        """Process one user message for a session."""


class OpenAIChatFacade:
    """Translate OpenAI-style requests into brainstorming session calls."""

    def __init__(self, *, session_service: SessionServiceLike, public_model_name: str) -> None:
        """Initialize the OpenAI facade service.

        Args:
            session_service: Session application service.
            public_model_name: Public model alias exposed by `/v1/models`.
        """
        self.session_service = session_service
        self.public_model_name = public_model_name

    def list_models(self) -> tuple[str, ...]:
        """Return the list of exposed OpenAI-compatible models.

        Returns:
            tuple[str, ...]: Exposed model aliases.
        """
        return (self.public_model_name,)

    def process_chat_completion(
        self,
        *,
        model: str,
        messages: Sequence[tuple[str, str]],
        metadata: dict[str, object],
    ) -> OpenAIChatFacadeResult:
        """Process an OpenAI-compatible chat completion request.

        Args:
            model: Requested public model alias.
            messages: Flattened `(role, content)` message pairs.
            metadata: Request metadata payload.

        Returns:
            OpenAIChatFacadeResult: Facade result with assistant output and session metadata.

        Raises:
            UnsupportedOpenAIModelError: If the requested public model alias is unknown.
        """
        if model != self.public_model_name:
            raise UnsupportedOpenAIModelError(
                requested_model=model,
                available_model=self.public_model_name,
            )
        user_message = self._latest_user_message(messages)
        session_id = self._resolve_session_id(metadata)
        output = self.session_service.process_user_message(
            session_id=session_id,
            content=user_message,
        )
        content = self._render_content(output)
        return OpenAIChatFacadeResult(
            session_id=session_id,
            public_model_name=self.public_model_name,
            content=content,
            output=output,
            prompt_tokens=_approximate_token_count(user_message),
            completion_tokens=_approximate_token_count(content),
        )

    def _resolve_session_id(self, metadata: dict[str, object]) -> str:
        """Resolve the target session id from request metadata.

        Args:
            metadata: Request metadata payload.

        Returns:
            str: Existing or newly created session id.
        """
        session_id = metadata.get("session_id")
        if isinstance(session_id, str) and session_id.strip():
            return session_id.strip()
        return self.session_service.create_session().session_id

    @staticmethod
    def _latest_user_message(messages: Sequence[tuple[str, str]]) -> str:
        """Extract the latest user message from an OpenAI-style message list.

        Args:
            messages: Flattened `(role, content)` pairs.

        Returns:
            str: Latest user message content.

        Raises:
            InvalidOpenAIRequestError: Raised when the request has no user message with text content.
        """
        for role, content in reversed(messages):
            if role == "user" and content.strip():
                return content.strip()
        raise InvalidOpenAIRequestError(message=MISSING_USER_MESSAGE_ERROR)

    @staticmethod
    def _render_content(output: AssistantTurnOutput) -> str:
        """Render assistant output into an OpenAI-compatible assistant message body.

        Args:
            output: Structured assistant turn output.

        Returns:
            str: Assistant content returned by the OpenAI-compatible facade.
        """
        return f"{output.assistant_message.strip()}\n\n{output.step_markdown.strip()}".strip()
