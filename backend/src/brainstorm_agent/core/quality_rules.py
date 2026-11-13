"""Declarative business predicates independent of transport and providers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from brainstorm_agent.core.enums import Stage

if TYPE_CHECKING:
    from collections.abc import Callable

MINIMUM_RISKS = 3
MINIMUM_CATEGORIES = 2
MINIMUM_PITCH_WORDS = 5


PLACEHOLDERS = frozenset({"tbd", "todo", "unknown", "n/a", "?", "something", "à définir", "to confirm"})


def concrete(value: object) -> bool:
    """Recognize material values rather than empty values or explicit placeholders.

    Args:
        value (object): Candidate field value.

    Returns:
        bool: Whether the value contains usable information.
    """
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip()) and value.strip().casefold() not in PLACEHOLDERS
    if isinstance(value, (list, tuple)):
        return bool(value) and all(concrete(item) for item in value)
    return True


@dataclass(frozen=True)
class Rule:
    """Identified condition and rejection message."""

    id: str
    condition: Callable[[dict[str, Any], dict[str, Any]], bool]
    message: str


def _risks(fields: dict[str, Any], _: dict[str, Any]) -> bool:
    risks = fields.get("risks_by_category") or []
    return (
        len(risks) >= MINIMUM_RISKS
        and len({r["category"].strip().casefold() for r in risks}) >= MINIMUM_CATEGORIES
        and all(
            concrete(r.get(key)) for r in risks for key in ("category", "description", "mitigation", "action")
        )
    )


def reference_catalog(previous: dict[str, Any]) -> dict[str, str]:
    """Expose deterministic goal/hypothesis ids and stable risk ids.

    Args:
        previous (dict[str, Any]): Stage-keyed serialized fields.

    Returns:
        dict[str, str]: Reference id to human-readable content.
    """
    catalog = {}
    for stage, fields in previous.items():
        for name in ("measurable_objectives", "hypotheses", "value_hypotheses"):
            for index, text in enumerate(fields.get(name) or []):
                catalog[f"{stage}:{name}:{index}"] = text
        for risk in fields.get("risks_by_category") or []:
            catalog[risk["id"]] = risk["description"]
    return catalog


def _backlog(fields: dict[str, Any], previous: dict[str, Any]) -> bool:
    catalog = reference_catalog(previous)
    return all(
        concrete(item.get("objective"))
        and concrete(item.get("definition_of_done"))
        and item.get("link") in catalog
        and all(re.fullmatch(r"WHEN .+ THE SYSTEM SHALL .+", c) for c in item.get("ears_criteria", []))
        for name in ("mvp_user_stories", "risk_spikes", "cross_cutting_work")
        for item in fields.get(name) or []
    )


def _backlog_scope(fields: dict[str, Any], previous: dict[str, Any]) -> bool:
    scope = previous.get(Stage.STAGE_2_USER_STORY_MAPPING.value, {}).get("mvp_scope") or []
    return all(item.get("capability") in scope for item in fields.get("mvp_user_stories") or [])


def _actors(fields: dict[str, Any], previous: dict[str, Any]) -> bool:
    actors = previous.get(Stage.STAGE_1_PROBLEM_FRAMING.value, {}).get("users_actors") or []
    return all(actor in actors for actor in fields.get("influential_actors") or [])


STAGE_RULES: dict[Stage, tuple[Rule, ...]] = {
    Stage.STAGE_0_PITCH: (
        Rule(
            "specific_pitch",
            lambda f, _: len((f.get("pitch_summary") or "").split()) >= MINIMUM_PITCH_WORDS,
            "Pitch must describe the idea in at least five words.",
        ),
    ),
    Stage.STAGE_1_PROBLEM_FRAMING: (
        Rule(
            "measurable_objectives",
            lambda f, _: all(re.search(r"\d", x) for x in f.get("measurable_objectives") or []),
            "Every objective needs an explicit numeric target or metric value.",
        ),
    ),
    Stage.STAGE_2_USER_STORY_MAPPING: (
        Rule(
            "mvp_capabilities",
            lambda f, _: all(x in (f.get("capabilities") or []) for x in f.get("mvp_scope") or []),
            "MVP scope items must exist in capabilities.",
        ),
    ),
    Stage.STAGE_3_EVENT_STORMING: (
        Rule(
            "irrelevance_justified",
            lambda f, _: (
                f.get("event_storming_relevant") is not False or concrete(f.get("not_relevant_reason"))
            ),
            "Event storming irrelevance must be justified explicitly.",
        ),
        Rule(
            "relevant_events",
            lambda f, _: f.get("event_storming_relevant") is not True or concrete(f.get("domain_events")),
            "Relevant event storming requires domain events.",
        ),
    ),
    Stage.STAGE_4_IMPACT_MAPPING: (
        Rule("consistent_actors", _actors, "Impact actors must exist in stage 1 users/actors."),
    ),
    Stage.STAGE_5_RISK_STORMING: (
        Rule(
            "concrete_risks",
            _risks,
            "Risk storming needs at least three concrete risk items across two categories with concrete mitigations and actions.",
        ),
    ),
    Stage.STAGE_6_BACKLOG_SYNTHESIS: (
        Rule(
            "backlog_traceability",
            _backlog,
            "Every backlog item needs objective, definition of done, an existing goal/risk/hypothesis link and valid optional EARS criteria.",
        ),
        Rule(
            "backlog_scope",
            _backlog_scope,
            "Every MVP backlog capability must exist in stage 2 MVP scope.",
        ),
    ),
}
