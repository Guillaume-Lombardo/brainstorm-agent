"""Typed accumulated stage fields; null means no update in a patch."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from brainstorm_agent.core.delivery import DeliverySlice  # noqa: TC001 - Pydantic runtime schema
from brainstorm_agent.core.enums import Stage


class StageFields(BaseModel):
    """Common strict contract and mapping view for domain rules."""

    model_config = ConfigDict(extra="forbid", strict=True)

    def get(self, key: str, default: object = None) -> object:
        """Return a field value.

        Args:
            key (str): Field name.
            default (Any): Value for absent fields.

        Returns:
            Any: Field value.
        """
        return getattr(self, key, default)


class BacklogItem(BaseModel):
    """Identified backlog entry updated by id across turns."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(default_factory=lambda: str(uuid4()))
    statement: str
    objective: str = ""
    definition_of_done: str = ""
    link: str = ""
    capability: str | None = None
    ears_criteria: list[str] = Field(default_factory=list)


class RiskField(BaseModel):
    """Typed risk field with stable identity."""

    model_config = ConfigDict(extra="forbid")
    id: str = Field(default_factory=lambda: str(uuid4()))
    category: str
    description: str
    impact: str
    probability: str
    mitigation: str
    action: str


class PitchFields(StageFields):
    """Stage 0 Pitch contract."""

    pitch_summary: str | None = Field(
        default=None,
        description="Pitch summary",
        json_schema_extra={"gate_required": True},
    )
    clear_points: list[str] | None = Field(
        default=None,
        description="Clear points",
        json_schema_extra={"gate_required": True},
    )
    ambiguities: list[str] | None = Field(
        default=None,
        description="Ambiguities",
        json_schema_extra={"gate_required": True},
    )
    missing_information: list[str] | None = Field(
        default=None,
        description="Missing information",
        json_schema_extra={"gate_required": True},
    )


class ProblemFields(StageFields):
    """Stage 1 Problem Framing contract."""

    problem_statement: str | None = Field(
        default=None,
        description="Problem statement",
        json_schema_extra={"gate_required": True},
    )
    users_actors: list[str] | None = Field(
        default=None,
        description="Users actors",
        json_schema_extra={"gate_required": True},
    )
    measurable_objectives: list[str] | None = Field(
        default=None,
        description="Measurable objectives",
        json_schema_extra={"gate_required": True},
    )
    constraints: list[str] | None = Field(
        default=None,
        description="Constraints",
        json_schema_extra={"gate_required": True},
    )
    non_goals: list[str] | None = Field(
        default=None,
        description="Non goals",
        json_schema_extra={"gate_required": True},
    )
    hypotheses: list[str] | None = Field(
        default=None,
        description="Hypotheses",
        json_schema_extra={"gate_required": True},
    )
    initial_risks: list[str] | None = Field(
        default=None,
        description="Initial risks",
        json_schema_extra={"gate_required": True},
    )
    five_w_one_h: str | None = Field(
        default=None,
        description="Five w one h",
        json_schema_extra={"gate_required": True},
    )


class StoryMapFields(StageFields):
    """Stage 2 User Story Mapping contract."""

    actors_personas: list[str] | None = Field(
        default=None,
        description="Actors personas",
        json_schema_extra={"gate_required": True},
    )
    user_journeys: list[str] | None = Field(
        default=None,
        description="User journeys",
        json_schema_extra={"gate_required": True},
    )
    capabilities: list[str] | None = Field(
        default=None,
        description="Capabilities",
        json_schema_extra={"gate_required": True},
    )
    mvp_scope: list[str] | None = Field(
        default=None,
        description="Mvp scope",
        json_schema_extra={"gate_required": True},
    )
    dependencies: list[str] | None = Field(
        default=None,
        description="Dependencies",
        json_schema_extra={"gate_required": True},
    )
    functional_gaps: list[str] | None = Field(
        default=None,
        description="Functional gaps",
        json_schema_extra={"gate_required": True},
    )
    edge_cases: list[str] | None = Field(
        default=None,
        description="Edge cases",
        json_schema_extra={"gate_required": True},
    )


class EventFields(StageFields):
    """Stage 3 Event Storming contract."""

    event_storming_relevant: bool | None = Field(
        default=None,
        description="Event storming relevant",
        json_schema_extra={"gate_required": True},
    )
    domain_events: list[str] | None = Field(
        default=None,
        description="Domain events",
        json_schema_extra={"gate_required": False},
    )
    commands: list[str] | None = Field(
        default=None,
        description="Commands",
        json_schema_extra={"gate_required": False},
    )
    actors: list[str] | None = Field(
        default=None,
        description="Actors",
        json_schema_extra={"gate_required": False},
    )
    business_rules: list[str] | None = Field(
        default=None,
        description="Business rules",
        json_schema_extra={"gate_required": False},
    )
    complexity_hotspots: list[str] | None = Field(
        default=None,
        description="Complexity hotspots",
        json_schema_extra={"gate_required": False},
    )
    aggregates: list[str] | None = Field(
        default=None,
        description="Aggregates",
        json_schema_extra={"gate_required": False},
    )
    not_relevant_reason: str | None = Field(
        default=None,
        description="Not relevant reason",
        json_schema_extra={"gate_required": False},
    )


class ImpactFields(StageFields):
    """Stage 4 Impact Mapping contract."""

    business_goal: str | None = Field(
        default=None,
        description="Business goal",
        json_schema_extra={"gate_required": True},
    )
    influential_actors: list[str] | None = Field(
        default=None,
        description="Influential actors",
        json_schema_extra={"gate_required": True},
    )
    expected_behaviors: list[str] | None = Field(
        default=None,
        description="Expected behaviors",
        json_schema_extra={"gate_required": True},
    )
    deliverables: list[str] | None = Field(
        default=None,
        description="Deliverables",
        json_schema_extra={"gate_required": True},
    )
    value_hypotheses: list[str] | None = Field(
        default=None,
        description="Value hypotheses",
        json_schema_extra={"gate_required": True},
    )


class RiskFields(StageFields):
    """Stage 5 Risk Storming contract."""

    risks_by_category: list[RiskField] | None = Field(
        default=None,
        description="Risks by category",
        json_schema_extra={"gate_required": True},
    )


class BacklogFields(StageFields):
    """Stage 6 Backlog Synthesis contract."""

    mvp_user_stories: list[BacklogItem] | None = Field(
        default=None,
        description="Mvp user stories",
        json_schema_extra={"gate_required": True},
    )
    risk_spikes: list[BacklogItem] | None = Field(
        default=None,
        description="Risk spikes",
        json_schema_extra={"gate_required": True},
    )
    cross_cutting_work: list[BacklogItem] | None = Field(
        default=None,
        description="Cross cutting work",
        json_schema_extra={"gate_required": True},
    )


class DeliveryFields(StageFields):
    """Stage 7 contracts; waves are derived by the domain, never supplied by a model."""

    slices: list[DeliverySlice] | None = Field(
        default=None,
        description="Vertical slices including slice-0 walking skeleton and shared contracts. Replace the complete slice list on update.",
        json_schema_extra={"gate_required": True},
    )


STAGE_MODELS: dict[Stage, type[StageFields]] = {
    Stage.STAGE_0_PITCH: PitchFields,
    Stage.STAGE_1_PROBLEM_FRAMING: ProblemFields,
    Stage.STAGE_2_USER_STORY_MAPPING: StoryMapFields,
    Stage.STAGE_3_EVENT_STORMING: EventFields,
    Stage.STAGE_4_IMPACT_MAPPING: ImpactFields,
    Stage.STAGE_5_RISK_STORMING: RiskFields,
    Stage.STAGE_6_BACKLOG_SYNTHESIS: BacklogFields,
    Stage.STAGE_7_DELIVERY_SLICING: DeliveryFields,
}


@dataclass(frozen=True)
class StageContract:
    """Derived view for deterministic gate validation."""

    required_fields: tuple[str, ...]
    list_fields: tuple[str, ...]


STAGE_CONTRACTS = {
    stage: StageContract(
        required_fields=tuple(
            name
            for name in model.model_fields
            if model.model_json_schema()["properties"][name].get("gate_required")
        ),
        list_fields=tuple(
            name for name, field in model.model_fields.items() if "list[" in str(field.annotation)
        ),
    )
    for stage, model in STAGE_MODELS.items()
}
STAGE_FIELD_ALIASES: dict[Stage, dict[str, tuple[str, ...]]] = {
    Stage.STAGE_7_DELIVERY_SLICING: {"slices": ("slices",)},
    Stage.STAGE_0_PITCH: {
        "pitch_summary": ("pitch", "summary"),
        "clear_points": ("clear", "clear_points"),
        "ambiguities": ("ambiguous", "ambiguities"),
        "missing_information": ("missing", "missing_information"),
    },
    Stage.STAGE_1_PROBLEM_FRAMING: {
        "problem_statement": ("problem", "problem_statement"),
        "users_actors": ("users", "actors", "users_actors"),
        "measurable_objectives": ("objectives", "measurable_objectives"),
        "constraints": ("constraints",),
        "non_goals": ("non_goals", "non-goals", "non goals"),
        "hypotheses": ("hypotheses", "assumptions"),
        "initial_risks": ("initial_risks", "risks"),
        "five_w_one_h": ("5w1h", "five_w_one_h"),
    },
    Stage.STAGE_2_USER_STORY_MAPPING: {
        "actors_personas": ("actors_personas", "personas", "actors"),
        "user_journeys": ("journeys", "user_journeys"),
        "capabilities": ("capabilities", "features"),
        "mvp_scope": ("mvp", "mvp_scope"),
        "dependencies": ("dependencies",),
        "functional_gaps": ("gaps", "functional_gaps"),
        "edge_cases": ("edge_cases", "edges"),
    },
    Stage.STAGE_3_EVENT_STORMING: {
        "event_storming_relevant": ("relevant", "event_storming_relevant"),
        "domain_events": ("events", "domain_events"),
        "commands": ("commands",),
        "actors": ("actors",),
        "business_rules": ("rules", "business_rules"),
        "aggregates": ("aggregates", "subsystems"),
        "complexity_hotspots": ("complexity", "complexity_hotspots"),
        "not_relevant_reason": ("not_relevant_reason", "reason"),
    },
    Stage.STAGE_4_IMPACT_MAPPING: {
        "business_goal": ("goal", "business_goal"),
        "influential_actors": ("actors", "influential_actors"),
        "expected_behaviors": ("behaviors", "expected_behaviors"),
        "deliverables": ("deliverables", "features"),
        "value_hypotheses": ("value_hypotheses", "hypotheses"),
    },
    Stage.STAGE_5_RISK_STORMING: {
        "risks_by_category": ("risks", "risks_by_category"),
    },
    Stage.STAGE_6_BACKLOG_SYNTHESIS: {
        "mvp_user_stories": ("stories", "mvp_user_stories"),
        "risk_spikes": ("spikes", "risk_spikes"),
        "cross_cutting_work": ("cross_cutting", "cross_cutting_work"),
    },
}
