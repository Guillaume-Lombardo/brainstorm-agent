"""Application API contracts; domain validation remains in stage rules."""

from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from brainstorm_agent.core.delivery import DeliverySlice
from brainstorm_agent.core.enums import Stage  # noqa: TC001
from brainstorm_agent.core.models import (  # noqa: TC001
    AssistantTurnOutput,
    PendingHumanReview,
    SessionOverview,
    StageState,
    StepDocument,
)
from brainstorm_agent.core.stage_contracts import BacklogFields  # noqa: TC001


class ReviewAction(StrEnum):
    """Explicit owner review choices."""

    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class SessionPatch(BaseModel):
    """Editable session metadata."""

    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, min_length=1, max_length=200)
    archived: bool | None = None


class CreateSessionInput(BaseModel):
    """Optional creation metadata."""

    title: str = Field(default="Untitled session", min_length=1, max_length=200)


class SessionPage(BaseModel):
    """Stable offset pagination ordered by creation time and id."""

    items: list[SessionOverview]
    total: int
    offset: int
    limit: int


class StagePatch(BaseModel):
    """Replace supplied fields or identified item collections, then validate."""

    model_config = ConfigDict(extra="forbid")
    fields: dict[str, Any] = Field(default_factory=dict)
    items: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


class FieldPatch(BaseModel):
    """A typed JSON value; the selected stage contract validates its type."""

    value: Any


class CommentInput(BaseModel):
    """Section feedback for the next turn."""

    stage: Stage
    section: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10000)


class ReviewInput(BaseModel):
    """Review of the currently pending stage, with an optional note."""

    stage: Stage
    action: ReviewAction
    note: str | None = Field(default=None, max_length=10000)


class DocumentDiff(BaseModel):
    """Unified line diff of two immutable versions of one stage."""

    stage: Stage
    from_version: int
    to_version: int
    diff: str


class ExportedSlice(DeliverySlice):
    """Delivery slice enriched with its computed wave."""

    wave: int


class BacklogExport(BaseModel):
    """Validated backlog, effective dependencies and delivery waves."""

    backlog: BacklogFields
    slices: list[ExportedSlice]
    waves: list[list[str]]


class SliceSpecsExport(BaseModel):
    """Standalone Markdown artifacts keyed by safe slice filename."""

    available: Literal[True] = True
    specs: dict[str, str]


class TurnStarted(BaseModel):
    """First event of an accepted stream."""

    type: Literal["turn.started"] = "turn.started"
    turn_id: str
    stage: Stage


class AnalysisStatus(BaseModel):
    """Analysis progress before conversational deltas."""

    type: Literal["analysis.status"] = "analysis.status"
    status: Literal["running"] = "running"


class MessageDelta(BaseModel):
    """An incremental conversational provider delta."""

    type: Literal["message.delta"] = "message.delta"
    delta: str


class DocumentUpdated(BaseModel):
    """Committed document version."""

    type: Literal["document.updated"] = "document.updated"
    document: StepDocument


class CoverageUpdated(BaseModel):
    """Authoritative persisted stage state, including gate data."""

    type: Literal["coverage.updated"] = "coverage.updated"
    stage: StageState


class StageChanged(BaseModel):
    """Committed stage transition."""

    type: Literal["stage.changed"] = "stage.changed"
    from_stage: Stage
    to_stage: Stage


class ReviewRequired(BaseModel):
    """Transition awaits owner review."""

    type: Literal["review.required"] = "review.required"
    review: PendingHumanReview


class TurnCompleted(BaseModel):
    """Terminal success, emitted only after commit."""

    type: Literal["turn.completed"] = "turn.completed"
    turn_id: str
    output: AssistantTurnOutput


class TurnError(BaseModel):
    """Terminal failure; tentative deltas must be discarded."""

    type: Literal["error"] = "error"
    code: Literal["turn_failed"] = "turn_failed"
    message: str = "The turn failed; retry the request."


TurnEvent = Annotated[
    TurnStarted
    | AnalysisStatus
    | MessageDelta
    | DocumentUpdated
    | CoverageUpdated
    | StageChanged
    | ReviewRequired
    | TurnCompleted
    | TurnError,
    Field(discriminator="type"),
]
