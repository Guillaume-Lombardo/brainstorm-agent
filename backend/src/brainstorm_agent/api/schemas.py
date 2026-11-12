"""HTTP request and response schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from brainstorm_agent.core.enums import HumanReviewDecision, Modality, Stage
from brainstorm_agent.core.models import (
    AssumptionItem,
    ConversationTurn,
    DecisionItem,
    FactItem,
    HumanReviewRecord,
    OpenQuestionItem,
    PendingHumanReview,
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
    requires_human_review: bool = False
    pending_review: PendingHumanReview | None = None


class SessionResponse(SessionOverview):
    """Detailed session response."""


class ConversationHistoryResponse(BaseModel):
    """Conversation history response."""

    items: list[ConversationTurn]


class DocumentsResponse(BaseModel):
    """Versioned documents response."""

    items: list[StepDocument]


class HumanReviewRequest(BaseModel):
    """Request payload for approving or rejecting a pending transition."""

    decision: HumanReviewDecision
    note: str | None = None


class HumanReviewsResponse(BaseModel):
    """List of human review decisions for a session."""

    items: list[HumanReviewRecord]


class ExportMarkdownResponse(BaseModel):
    """Markdown export payload."""

    session_id: str
    markdown: str


class ExportJsonResponse(BaseModel):
    """Structured JSON export payload."""

    session_id: str
    payload: dict[str, Any]


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


class OpenAIResponsesInputMessage(BaseModel):
    """OpenAI-compatible item for the `/v1/responses` input list."""

    role: Literal["system", "developer", "user", "assistant", "tool"]
    content: str | list[OpenAIContentPart] | None

    def as_text(self) -> str:
        """Return the input item content as plain text.

        Returns:
            str: Flattened text content.
        """
        return OpenAIChatMessage(role=self.role, content=self.content).as_text()


class OpenAIResponsesRequest(BaseModel):
    """OpenAI-compatible request payload for `/v1/responses`."""

    model: str
    input: str | list[OpenAIResponsesInputMessage]
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


class OpenAIResponseOutputText(BaseModel):
    """Text content item in OpenAI-compatible response output."""

    type: Literal["output_text"] = "output_text"
    text: str


class OpenAIResponseOutputMessage(BaseModel):
    """Output message in `/v1/responses` responses."""

    id: str = Field(default_factory=lambda: f"msg-{uuid4()}")
    type: Literal["message"] = "message"
    role: Literal["assistant"] = "assistant"
    content: list[OpenAIResponseOutputText]


class OpenAIResponsesResponse(BaseModel):
    """OpenAI-compatible `/v1/responses` payload."""

    id: str = Field(default_factory=lambda: f"resp-{uuid4()}")
    object: Literal["response"] = "response"
    created_at: int = Field(default_factory=lambda: int(datetime.now(tz=UTC).timestamp()))
    model: str
    output: list[OpenAIResponseOutputMessage]
    usage: OpenAIUsage
    brainstorm: OpenAIBrainstormPayload
