"""Domain models for the brainstorming backend."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from brainstorm_agent.core.enums import MessageRole, Modality, OpenQuestionStatus, Stage


def utc_now() -> datetime:
    """Return the current UTC timestamp.

    Returns:
        datetime: Current aware UTC datetime.
    """
    return datetime.now(tz=UTC)


class FactItem(BaseModel):
    """Structured fact captured during a turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    source: str = "user"


class AssumptionItem(BaseModel):
    """Structured assumption captured during a turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    confidence: str = "medium"


class DecisionItem(BaseModel):
    """Structured decision captured during a turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    rationale: str | None = None


class OpenQuestionItem(BaseModel):
    """Structured open question captured during a turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    question: str
    why_it_matters: str | None = None
    blocking: bool = True
    status: OpenQuestionStatus = OpenQuestionStatus.OPEN


class RiskItem(BaseModel):
    """Structured risk captured during a turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    category: str
    description: str
    impact: str
    probability: str
    mitigation: str
    action: str


class ConversationTurn(BaseModel):
    """Conversation message persisted in history."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    role: MessageRole
    content: str
    modality: Modality = Modality.TEXT
    stage: Stage
    created_at: datetime = Field(default_factory=utc_now)


class StepDocument(BaseModel):
    """Rendered Markdown artifact for a stage turn."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    stage: Stage
    version: int
    markdown: str
    summary: str
    facts: list[FactItem] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)


class StageState(BaseModel):
    """Current structured state for one stage."""

    stage: Stage
    summary: str = ""
    assistant_message: str = ""
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    facts: list[FactItem] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    latest_markdown: str = ""
    stage_is_clear_enough: bool = False
    transition_decision_reason: str = ""
    updated_at: datetime = Field(default_factory=utc_now)


class BrainstormSessionState(BaseModel):
    """Persistent structured state for a brainstorming session."""

    session_id: str
    current_stage: Stage = Stage.STAGE_0_PITCH
    stage_states: dict[str, StageState] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class StageValidationResult(BaseModel):
    """Rule-based assessment for stage completeness."""

    stage: Stage
    missing_fields: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    stage_is_clear_enough: bool = False
    transition_decision_reason: str


class AssistantAnalysis(BaseModel):
    """LLM or heuristic analysis for one user turn."""

    summary: str
    assistant_message: str
    facts: list[FactItem] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    extracted_fields: dict[str, Any] = Field(default_factory=dict)
    stage_is_clear_enough: bool = False
    transition_decision_reason: str = ""


class AssistantTurnOutput(BaseModel):
    """Structured assistant payload returned by the API."""

    session_id: str
    current_stage: Stage
    processed_stage: Stage
    stage_clear_enough: bool
    assistant_message: str
    summary: str
    facts: list[FactItem] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    step_markdown: str
    transition_decision_reason: str
    next_stage: Stage | None = None


class SessionOverview(BaseModel):
    """Session snapshot returned by the API."""

    session_id: str
    current_stage: Stage
    created_at: datetime
    updated_at: datetime
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    completed_stages: list[Stage] = Field(default_factory=list)
