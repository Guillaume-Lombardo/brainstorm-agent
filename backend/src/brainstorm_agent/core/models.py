"""Domain models for the brainstorming backend."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, SerializeAsAny, model_validator

from brainstorm_agent.core.enums import (
    AuthMode,
    HumanReviewDecision,
    MessageRole,
    Modality,
    OpenQuestionStatus,
    Stage,
)
from brainstorm_agent.core.stage_contracts import STAGE_MODELS, StageFields


def utc_now() -> datetime:
    """Return the current UTC timestamp.

    Returns:
        datetime: Current aware UTC datetime.
    """
    return datetime.now(tz=UTC)


class CoverageStatus(StrEnum):
    """Field coverage owned by the deterministic validator."""

    CLEAR = "clear"
    PARTIAL = "partial"
    MISSING = "missing"


class QuestionPriority(StrEnum):
    """Ordered elicitation topics."""

    SCOPE = "scope"
    SECURITY = "security/compliance"
    UX = "ux"
    TECHNICAL = "technical"


class Clarification(BaseModel):
    """Explicit answer to an identified question."""

    question_id: str
    question: str
    answer: str
    created_at: datetime = Field(default_factory=utc_now)


class PartialField(BaseModel):
    """Provider proposal with a strict object schema."""

    model_config = ConfigDict(extra="forbid")
    field: str
    reason: str = Field(min_length=1)


class ReadinessItem(BaseModel):
    """One deterministic checklist outcome."""

    id: str
    passed: bool
    message: str


class FactItem(BaseModel):
    """Structured fact captured during a turn."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    source: str = "user"


class AssumptionItem(BaseModel):
    """Structured assumption captured during a turn."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    confidence: str = "medium"
    to_confirm: bool = True
    default_field: str | None = None


class DecisionItem(BaseModel):
    """Structured decision captured during a turn."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    rationale: str | None = None


class OpenQuestionItem(BaseModel):
    """Structured open question captured during a turn."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()))
    question: str
    why_it_matters: str | None = "Required to resolve a stage uncertainty."
    priority: QuestionPriority = QuestionPriority.SCOPE
    options: list[str] = Field(default_factory=list)
    recommended_option: str | None = None
    blocking: bool = True
    status: OpenQuestionStatus = OpenQuestionStatus.OPEN


class RiskItem(BaseModel):
    """Structured risk captured during a turn."""

    model_config = ConfigDict(extra="forbid")

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
    prompt_tokens: int = 0
    completion_tokens: int = 0
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


class PendingHumanReview(BaseModel):
    """Pending transition awaiting explicit human review."""

    from_stage: Stage
    to_stage: Stage | None
    summary: str
    transition_decision_reason: str
    requested_at: datetime = Field(default_factory=utc_now)


class HumanReviewRecord(BaseModel):
    """Persisted human review decision."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    session_id: str
    from_stage: Stage
    proposed_next_stage: Stage | None
    decision: HumanReviewDecision
    note: str | None = None
    created_at: datetime = Field(default_factory=utc_now)


class StageState(BaseModel):
    """Current structured state for one stage."""

    @model_validator(mode="before")
    @classmethod
    def parse_fields(cls, value: object) -> object:
        """Select the field contract from the stage.

        Args:
            value (object): Serialized state or analysis.

        Returns:
            object: State with typed fields.
        """
        if isinstance(value, dict):
            value = dict(value)
            stage = Stage(value.get("stage", cls.model_fields["stage"].default))
            fields = value.get("extracted_fields", {})
            if isinstance(fields, StageFields):
                fields = fields.model_dump(exclude_none=True)
            value["extracted_fields"] = STAGE_MODELS[stage].model_validate(fields)
        return value

    stage: Stage
    contradictions: list[str] = Field(default_factory=list)
    partial_fields: dict[str, str] = Field(default_factory=dict)
    clarifications: list[Clarification] = Field(default_factory=list)
    summary: str = ""
    assistant_message: str = ""
    extracted_fields: SerializeAsAny[StageFields] = Field(default_factory=StageFields)
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
    turn_usage: dict[str, dict[str, int]] = Field(default_factory=dict)
    transcript: list[dict[str, str]] = Field(default_factory=list)
    current_stage: Stage = Stage.STAGE_0_PITCH
    stage_states: dict[str, StageState] = Field(default_factory=dict)
    pending_human_review: PendingHumanReview | None = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class StageValidationResult(BaseModel):
    """Rule-based assessment for stage completeness."""

    stage: Stage
    coverage: dict[str, CoverageStatus] = Field(default_factory=dict)
    readiness: list[ReadinessItem] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    blocking_reasons: list[str] = Field(default_factory=list)
    stage_is_clear_enough: bool = False
    transition_decision_reason: str


class AssistantAnalysis(BaseModel):
    """LLM or heuristic analysis for one user turn."""

    @model_validator(mode="before")
    @classmethod
    def parse_fields(cls, value: object) -> object:
        """Select the field contract from the stage.

        Args:
            value (object): Serialized state or analysis.

        Returns:
            object: State with typed fields.
        """
        if isinstance(value, dict):
            value = dict(value)
            stage = Stage(value.get("stage", cls.model_fields["stage"].default))
            fields = value.get("extracted_fields", {})
            if isinstance(fields, StageFields):
                fields = fields.model_dump(exclude_none=True)
            value["extracted_fields"] = STAGE_MODELS[stage].model_validate(fields)
        return value

    model_config = ConfigDict(extra="forbid")
    stage: Stage = Stage.STAGE_0_PITCH
    resolved_item_ids: list[str] = Field(default_factory=list)
    resolved_question_ids: list[str] = Field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
    contradictions: list[str] = Field(default_factory=list)
    partial_fields: list[PartialField] = Field(default_factory=list)
    clarifications: list[Clarification] = Field(default_factory=list)
    summary: str
    assistant_message: str
    facts: list[FactItem] = Field(default_factory=list)
    assumptions: list[AssumptionItem] = Field(default_factory=list)
    decisions: list[DecisionItem] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    risks: list[RiskItem] = Field(default_factory=list)
    extracted_fields: SerializeAsAny[StageFields] = Field(default_factory=StageFields)
    stage_is_clear_enough: bool = False
    transition_decision_reason: str = ""


class AssistantTurnOutput(BaseModel):
    """Structured assistant payload returned by the API."""

    coverage: dict[str, CoverageStatus] = Field(default_factory=dict)
    readiness: list[ReadinessItem] = Field(default_factory=list)
    prompt_tokens: int = 0
    completion_tokens: int = 0
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
    requires_human_review: bool = False
    pending_review: PendingHumanReview | None = None


class SessionOverview(BaseModel):
    """Session snapshot returned by the API."""

    session_id: str
    current_stage: Stage
    created_at: datetime
    updated_at: datetime
    open_questions: list[OpenQuestionItem] = Field(default_factory=list)
    completed_stages: list[Stage] = Field(default_factory=list)
    pending_human_review: PendingHumanReview | None = None


class AuthenticatedPrincipal(BaseModel):
    """Authenticated API caller principal."""

    subject: str
    auth_mode: AuthMode
    token_id: str | None = None
    scopes: list[str] = Field(default_factory=list)
