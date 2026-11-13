from __future__ import annotations

import pytest
from sqlalchemy import String

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    FactItem,
    OpenQuestionItem,
    StageState,
)
from brainstorm_agent.core.stage_contracts import BacklogFields, BacklogItem, ProblemFields
from brainstorm_agent.graph.nodes import apply_stage_rules, decide_transition, merge_analysis
from brainstorm_agent.persistence.models import OpenQuestionRecord


def test_patch_preserves_fields_ids_and_resolves_questions():
    previous = StageState(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        extracted_fields=ProblemFields(problem_statement="Slow discovery"),
        facts=[FactItem(id="fact-1", statement="Confirmed")],
        open_questions=[OpenQuestionItem(id="question-1", question="Who?")],
    )
    patch = AssistantAnalysis(
        stage=previous.stage,
        summary="More detail",
        assistant_message="Continue",
        extracted_fields=ProblemFields(users_actors=["Teams"]),
        facts=[FactItem(id="fact-2", statement="New fact")],
        resolved_question_ids=["question-1"],
    )
    result = merge_analysis(previous=previous, patch=patch)
    assert result.extracted_fields.get("problem_statement") == "Slow discovery"
    assert result.extracted_fields.get("users_actors") == ["Teams"]
    assert [item.id for item in result.facts] == ["fact-1", "fact-2"]
    assert result.open_questions == []


def test_identified_backlog_patch_preserves_empty_lists_and_retracts_by_id():
    previous = StageState(
        stage=Stage.STAGE_6_BACKLOG_SYNTHESIS,
        extracted_fields=BacklogFields(
            mvp_user_stories=[
                BacklogItem(id="story-1", statement="Original"),
                BacklogItem(id="story-2", statement="Remove"),
            ],
        ),
    )
    patch = AssistantAnalysis(
        stage=previous.stage,
        summary="Update",
        assistant_message="Continue",
        extracted_fields=BacklogFields(mvp_user_stories=[]),
    )
    assert (
        len(merge_analysis(previous=previous, patch=patch).extracted_fields.model_dump()["mvp_user_stories"])
        == 2
    )
    patch = AssistantAnalysis(
        stage=previous.stage,
        summary="Update",
        assistant_message="Continue",
        extracted_fields=BacklogFields(mvp_user_stories=[BacklogItem(id="story-1", statement="Revised")]),
        resolved_item_ids=["story-2"],
    )
    result = merge_analysis(previous=previous, patch=patch).extracted_fields.model_dump()["mvp_user_stories"]
    assert [item["id"] for item in result] == ["story-1"]
    assert result[0]["statement"] == "Revised"


def test_gate_questions_fit_the_persisted_open_question_id():
    analysis = AssistantAnalysis(stage=Stage.STAGE_1_PROBLEM_FRAMING, summary="", assistant_message="")
    result = apply_stage_rules({
        "session_id": "s",
        "current_stage": Stage.STAGE_1_PROBLEM_FRAMING.value,
        "user_message": "",
        "session_state": {},
        "analysis": analysis.model_dump(mode="json"),
    })
    gate_ids = [item.id for item in AssistantAnalysis.model_validate(result["analysis"]).open_questions]
    id_type = OpenQuestionRecord.__table__.c.id.type
    assert isinstance(id_type, String)
    max_length = id_type.length
    assert max_length is not None
    assert gate_ids
    assert all(item.startswith("gate:") and len(item) <= max_length for item in gate_ids)
    assert len(set(gate_ids)) == len(gate_ids)


def test_clarified_uncertainty_disappears_from_current_state():
    previous = StageState(stage=Stage.STAGE_1_PROBLEM_FRAMING, uncertainties=["Target users are unknown"])
    patch = AssistantAnalysis(
        stage=previous.stage,
        summary="Users clarified",
        assistant_message="Continue",
        uncertainties=[],
    )
    assert merge_analysis(previous=previous, patch=patch).uncertainties == []


@pytest.mark.parametrize("stage", Stage.ordered())
@pytest.mark.parametrize("ready", [False, True])
def test_transition_table_respects_order_and_terminal_stage(stage, ready):
    analysis = AssistantAnalysis(stage=stage, summary="", assistant_message="", stage_is_clear_enough=ready)
    result = decide_transition({
        "session_id": "s",
        "current_stage": stage.value,
        "user_message": "",
        "session_state": {},
        "analysis": analysis.model_dump(mode="json"),
        "markdown": "",
        "validation": {"coverage": {}, "readiness": []},
    })["assistant_output"]
    result = AssistantTurnOutput.model_validate(result)
    assert result.next_stage == (stage.next_stage() if ready else None)
    assert result.current_stage == ((stage.next_stage() or stage) if ready else stage)
