from __future__ import annotations

import pytest

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.quality_rules import STAGE_RULES, reference_catalog

S = Stage
PREVIOUS = {
    S.STAGE_1_PROBLEM_FRAMING.value: {"users_actors": ["Admin"], "measurable_objectives": ["20 users"]},
    S.STAGE_2_USER_STORY_MAPPING.value: {"mvp_scope": ["Export"]},
    S.STAGE_5_RISK_STORMING.value: {"risks_by_category": [{"id": "r1", "description": "Loss"}]},
}
ITEM = {
    "objective": "Reduce delay",
    "definition_of_done": "Timing verified",
    "link": "r1",
    "capability": "Export",
    "ears_criteria": ["WHEN export starts THE SYSTEM SHALL write a file"],
}
RISKS = [
    {"category": c, "description": "Loss", "mitigation": "Backup", "action": "Restore drill"}
    for c in ["technical", "business", "technical"]
]
CASES = [
    (
        S.STAGE_0_PITCH,
        "specific_pitch",
        {"pitch_summary": "A tool to export monthly reports"},
        {"pitch_summary": "app"},
    ),
    (
        S.STAGE_1_PROBLEM_FRAMING,
        "measurable_objectives",
        {"measurable_objectives": ["20 users"]},
        {"measurable_objectives": ["More users"]},
    ),
    (
        S.STAGE_2_USER_STORY_MAPPING,
        "mvp_capabilities",
        {"capabilities": ["Export"], "mvp_scope": ["Export"]},
        {"capabilities": ["Export"], "mvp_scope": ["Login"]},
    ),
    (
        S.STAGE_3_EVENT_STORMING,
        "irrelevance_justified",
        {"event_storming_relevant": False, "not_relevant_reason": "Static content only"},
        {"event_storming_relevant": False, "not_relevant_reason": "TBD"},
    ),
    (
        S.STAGE_3_EVENT_STORMING,
        "relevant_events",
        {"event_storming_relevant": True, "domain_events": ["Exported"]},
        {"event_storming_relevant": True},
    ),
    (
        S.STAGE_4_IMPACT_MAPPING,
        "consistent_actors",
        {"influential_actors": ["Admin"]},
        {"influential_actors": ["Visitor"]},
    ),
    (
        S.STAGE_5_RISK_STORMING,
        "concrete_risks",
        {"risks_by_category": RISKS},
        {"risks_by_category": RISKS[:2]},
    ),
    (
        S.STAGE_6_BACKLOG_SYNTHESIS,
        "backlog_traceability",
        {"mvp_user_stories": [ITEM]},
        {"mvp_user_stories": [{**ITEM, "link": "absent"}]},
    ),
    (
        S.STAGE_6_BACKLOG_SYNTHESIS,
        "backlog_scope",
        {"mvp_user_stories": [ITEM]},
        {"mvp_user_stories": [{**ITEM, "capability": "Login"}]},
    ),
]


@pytest.mark.parametrize(("stage", "rule_id", "valid", "invalid"), CASES)
def test_each_rule_accepts_and_rejects(stage, rule_id, valid, invalid):
    rule = next(r for r in STAGE_RULES[stage] if r.id == rule_id)
    assert rule.condition(valid, PREVIOUS)
    assert not rule.condition(invalid, PREVIOUS)
    assert rule.message


def test_all_registered_rules_are_tested():
    assert {(stage, rule.id) for stage, rules in STAGE_RULES.items() for rule in rules} == {
        (stage, name) for stage, name, _, _ in CASES
    }


@pytest.mark.parametrize("key", ["objective", "definition_of_done", "link"])
def test_backlog_requires_every_attribute(key):
    rule = STAGE_RULES[S.STAGE_6_BACKLOG_SYNTHESIS][0]
    assert not rule.condition({"risk_spikes": [{**ITEM, key: ""}]}, PREVIOUS)


def test_ears_is_optional_but_must_match_when_present():
    rule = STAGE_RULES[S.STAGE_6_BACKLOG_SYNTHESIS][0]
    assert rule.condition({"cross_cutting_work": [{**ITEM, "ears_criteria": []}]}, PREVIOUS)
    assert not rule.condition({"cross_cutting_work": [{**ITEM, "ears_criteria": ["nice to have"]}]}, PREVIOUS)


@pytest.mark.parametrize(
    "risks",
    [
        [{**r, "category": "technical"} for r in RISKS],
        [{**r, "mitigation": "TBD"} for r in RISKS],
        [{**r, "mitigation": ""} for r in RISKS],
    ],
)
def test_risk_categories_and_generic_mitigation_rejected(risks):
    assert not STAGE_RULES[S.STAGE_5_RISK_STORMING][0].condition({"risks_by_category": risks}, {})


def test_reference_ids_are_exposed():
    catalog = reference_catalog(PREVIOUS)
    assert catalog["r1"] == "Loss"
    assert catalog[f"{S.STAGE_1_PROBLEM_FRAMING.value}:measurable_objectives:0"] == "20 users"
