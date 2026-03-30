"""Stage field contracts used by validation and prompting."""

from __future__ import annotations

from dataclasses import dataclass

from brainstorm_agent.core.enums import Stage


@dataclass(frozen=True)
class StageContract:
    """Required field contract for a stage."""

    required_fields: tuple[str, ...]
    list_fields: tuple[str, ...] = ()


STAGE_CONTRACTS: dict[Stage, StageContract] = {
    Stage.STAGE_0_PITCH: StageContract(
        required_fields=("pitch_summary", "clear_points", "ambiguities", "missing_information"),
        list_fields=("clear_points", "ambiguities", "missing_information"),
    ),
    Stage.STAGE_1_PROBLEM_FRAMING: StageContract(
        required_fields=(
            "problem_statement",
            "users_actors",
            "measurable_objectives",
            "constraints",
            "non_goals",
            "hypotheses",
            "initial_risks",
            "five_w_one_h",
        ),
        list_fields=(
            "users_actors",
            "measurable_objectives",
            "constraints",
            "non_goals",
            "hypotheses",
            "initial_risks",
        ),
    ),
    Stage.STAGE_2_USER_STORY_MAPPING: StageContract(
        required_fields=(
            "actors_personas",
            "user_journeys",
            "capabilities",
            "mvp_scope",
            "dependencies",
            "functional_gaps",
            "edge_cases",
        ),
        list_fields=(
            "actors_personas",
            "user_journeys",
            "capabilities",
            "mvp_scope",
            "dependencies",
            "functional_gaps",
            "edge_cases",
        ),
    ),
    Stage.STAGE_3_EVENT_STORMING: StageContract(
        required_fields=("event_storming_relevant",),
        list_fields=("domain_events", "commands", "actors", "business_rules", "complexity_hotspots"),
    ),
    Stage.STAGE_4_IMPACT_MAPPING: StageContract(
        required_fields=(
            "business_goal",
            "influential_actors",
            "expected_behaviors",
            "deliverables",
            "value_hypotheses",
        ),
        list_fields=("influential_actors", "expected_behaviors", "deliverables", "value_hypotheses"),
    ),
    Stage.STAGE_5_RISK_STORMING: StageContract(
        required_fields=("risks_by_category",),
    ),
    Stage.STAGE_6_BACKLOG_SYNTHESIS: StageContract(
        required_fields=("mvp_user_stories", "risk_spikes", "cross_cutting_work"),
        list_fields=("mvp_user_stories", "risk_spikes", "cross_cutting_work"),
    ),
}


STAGE_FIELD_ALIASES: dict[Stage, dict[str, tuple[str, ...]]] = {
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
