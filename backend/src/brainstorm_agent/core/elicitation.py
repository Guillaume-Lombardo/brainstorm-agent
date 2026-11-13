"""Bounded questions and safe default assumptions."""

from __future__ import annotations

from brainstorm_agent.core.enums import OpenQuestionStatus, Stage
from brainstorm_agent.core.models import AssistantAnalysis, OpenQuestionItem, QuestionPriority

QUESTION_BUDGET = 3
# Only optional analytical gaps may be defaults; business-critical fields never default.
DEFAULTABLE_FIELDS = {
    Stage.STAGE_2_USER_STORY_MAPPING: frozenset({"functional_gaps", "edge_cases"}),
    Stage.STAGE_3_EVENT_STORMING: frozenset({"complexity_hotspots"}),
}


def selected_questions(questions: list[OpenQuestionItem]) -> list[OpenQuestionItem]:
    """Select up to three active questions in domain priority order.

    Args:
        questions (list[OpenQuestionItem]): Full retained question collection.

    Returns:
        list[OpenQuestionItem]: Stable, prioritized selection.
    """
    priorities = list(QuestionPriority)
    return sorted(
        (q for q in questions if q.status is OpenQuestionStatus.OPEN),
        key=lambda q: priorities.index(q.priority),
    )[:QUESTION_BUDGET]


def filter_defaults(analysis: AssistantAnalysis) -> None:
    """Discard unsafe default proposals and flag allowed ones for confirmation.

    Defaults remain assumptions; they never populate required business fields.

    Args:
        analysis (AssistantAnalysis): Mutable accumulated analysis.
    """
    fields = analysis.extracted_fields.model_dump(exclude_none=True)
    for assumption in analysis.assumptions:
        if assumption.default_field:
            fields.pop(assumption.default_field, None)
    analysis.extracted_fields = type(analysis.extracted_fields).model_validate(fields)
    analysis.assumptions = [
        a
        for a in analysis.assumptions
        if a.default_field is None or a.default_field in DEFAULTABLE_FIELDS.get(analysis.stage, ())
    ]
    for assumption in analysis.assumptions:
        if assumption.default_field:
            assumption.to_confirm = True
