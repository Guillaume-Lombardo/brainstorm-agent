"""HTTP request and response schemas."""

from __future__ import annotations

from pydantic import BaseModel

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
