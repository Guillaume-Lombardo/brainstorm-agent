"""HTTP request and response schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from brainstorm_agent.core.enums import Modality, Stage
from brainstorm_agent.core.models import (
    AssumptionItem,
    ConversationTurn,
    DecisionItem,
    FactItem,
    OpenQuestionItem,
    RiskItem,
    SessionOverview,
    StepDocument,
)


class CreateSessionResponse(BaseModel):
    """Response for session creation."""

    session_id: str
    current_stage: Stage
    message: str


class PostMessageRequest(BaseModel):
    """Request payload for a user message."""

    content: str
    modality: Modality = Modality.TEXT


class PostMessageResponse(BaseModel):
    """Response payload for one processed turn."""

    session_id: str
    current_stage: Stage
    processed_stage: Stage
    stage_clear_enough: bool
    assistant_message: str
    summary: str
    facts: list[FactItem]
    assumptions: list[AssumptionItem]
    decisions: list[DecisionItem]
    uncertainties: list[str]
    open_questions: list[OpenQuestionItem]
    risks: list[RiskItem]
    step_markdown: str
    transition_decision_reason: str
    next_stage: Stage | None


class SessionResponse(SessionOverview):
    """Detailed session response."""


class ConversationHistoryResponse(BaseModel):
    """Conversation history response."""

    items: list[ConversationTurn]


class DocumentsResponse(BaseModel):
    """Versioned documents response."""

    items: list[StepDocument]


class OpenAIContentPart(BaseModel):
    """Text content part for OpenAI-compatible chat messages."""

    type: str
    text: str | None = None


class OpenAIChatMessage(BaseModel):
    """OpenAI-compatible chat message."""

    role: Literal["system", "developer", "user", "assistant", "tool"]
    content: str | list[OpenAIContentPart] | None

    def as_text(self) -> str:
        """Return the message content as plain text.

        Returns:
            str: Flattened text content.
        """
        if self.content is None:
            return ""
        if isinstance(self.content, str):
            return self.content
        return "\n".join(
            part.text.strip()
            for part in self.content
            if part.type == "text" and part.text and part.text.strip()
        )


class OpenAIChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""

    model: str
    messages: list[OpenAIChatMessage]
    stream: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)
    user: str | None = None


class OpenAIModelCard(BaseModel):
    """OpenAI-compatible model card."""

    id: str
    object: str = "model"
    created: int
    owned_by: str = "brainstorm-agent"


class OpenAIModelsResponse(BaseModel):
    """OpenAI-compatible models listing."""

    object: str = "list"
    data: list[OpenAIModelCard]


class OpenAIUsage(BaseModel):
    """Approximate token usage payload."""

    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class OpenAICompletionMessage(BaseModel):
    """Assistant message in OpenAI-compatible completion responses."""

    role: Literal["assistant"] = "assistant"
    content: str


class OpenAICompletionChoice(BaseModel):
    """Choice payload for OpenAI-compatible chat completions."""

    index: int = 0
    finish_reason: str = "stop"
    message: OpenAICompletionMessage


class OpenAIBrainstormPayload(BaseModel):
    """Additional state payload returned by the brainstorming facade."""

    session_id: str
    current_stage: Stage
    processed_stage: Stage
    next_stage: Stage | None
    stage_clear_enough: bool
    summary: str
    open_questions: list[OpenQuestionItem]
    transition_decision_reason: str


class OpenAIChatCompletionResponse(BaseModel):
    """OpenAI-compatible chat completion response."""

    id: str = Field(default_factory=lambda: f"chatcmpl-{uuid4()}")
    object: str = "chat.completion"
    created: int = Field(default_factory=lambda: int(datetime.now(tz=UTC).timestamp()))
    model: str
    choices: list[OpenAICompletionChoice]
    usage: OpenAIUsage
    brainstorm: OpenAIBrainstormPayload
