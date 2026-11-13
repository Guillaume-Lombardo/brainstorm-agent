from __future__ import annotations

import pytest

from brainstorm_agent.core.elicitation import filter_defaults, selected_questions
from brainstorm_agent.core.enums import OpenQuestionStatus, Stage
from brainstorm_agent.core.models import AssistantAnalysis, AssumptionItem, OpenQuestionItem, QuestionPriority
from brainstorm_agent.core.validation import validate_stage


@pytest.mark.parametrize("missing", [False, True])
@pytest.mark.parametrize("partial", [False, True])
@pytest.mark.parametrize("blocking", [False, True])
def test_gate_decision_table(missing, partial, blocking):
    fields = {
        "pitch_summary": "A tool to export monthly reports",
        "clear_points": ["Export"],
        "ambiguities": ["Audience"],
        "missing_information": ["Budget"],
    }
    if missing:
        fields["pitch_summary"] = ""
    result = validate_stage(
        stage=Stage.STAGE_0_PITCH,
        extracted_fields=fields,
        partial_fields={"pitch_summary": "Audience unclear"} if partial else {},
        open_questions=[OpenQuestionItem(question="Who?", blocking=blocking)],
    )
    assert result.stage_is_clear_enough == (not missing and not partial and not blocking)
    assert result.coverage["pitch_summary"] == ("missing" if missing else "partial" if partial else "clear")


def test_question_budget_priority_and_closed_questions():
    questions = [OpenQuestionItem(question=str(p), priority=p) for p in reversed(list(QuestionPriority))]
    questions.append(OpenQuestionItem(question="Closed", status=OpenQuestionStatus.RESOLVED))
    selected = selected_questions(questions)
    assert [q.priority for q in selected] == [
        QuestionPriority.SCOPE,
        QuestionPriority.SECURITY,
        QuestionPriority.UX,
    ]
    assert len(questions) == 5


def test_defaults_cannot_fill_critical_fields():
    analysis = AssistantAnalysis(
        stage=Stage.STAGE_2_USER_STORY_MAPPING,
        summary="",
        assistant_message="",
        assumptions=[
            AssumptionItem(statement="No more gaps", default_field="edge_cases", to_confirm=False),
            AssumptionItem(statement="Invent scope", default_field="mvp_scope"),
        ],
    )
    filter_defaults(analysis)
    assert len(analysis.assumptions) == 1
    assert analysis.assumptions[0].to_confirm
    assert analysis.extracted_fields.get("mvp_scope") is None


def test_contradictions_block_even_with_complete_fields():
    result = validate_stage(
        stage=Stage.STAGE_3_EVENT_STORMING,
        extracted_fields={
            "event_storming_relevant": False,
            "not_relevant_reason": "Static documentation only",
        },
        open_questions=[],
        contradictions=["User also described payment events"],
    )
    assert not result.stage_is_clear_enough
    assert "contradictions" in {item.id for item in result.readiness if not item.passed}


@pytest.mark.parametrize(
    ("fields", "partial_name"),
    [
        ({"event_storming_relevant": True, "domain_events": ["An event"]}, "domain_events"),
        (
            {"event_storming_relevant": False, "not_relevant_reason": "Static content only"},
            "not_relevant_reason",
        ),
    ],
)
def test_conditional_required_fields_must_be_clear(fields, partial_name):
    result = validate_stage(
        stage=Stage.STAGE_3_EVENT_STORMING,
        extracted_fields=fields,
        open_questions=[],
        partial_fields={partial_name: "Needs clarification"},
    )
    assert not result.stage_is_clear_enough
    assert result.coverage[partial_name] == "partial"
    assert any(item.id == f"field:{partial_name}" and not item.passed for item in result.readiness)
