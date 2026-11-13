from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator  # noqa: TC003

import pytest
from pytest_mock import MockerFixture  # noqa: TC002
from sqlalchemy import String

from brainstorm_agent.core.elicitation import selected_questions
from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    FactItem,
    OpenQuestionItem,
    StageState,
)
from brainstorm_agent.core.stage_contracts import BacklogFields, BacklogItem, ProblemFields
from brainstorm_agent.graph.nodes import (
    apply_stage_rules,
    decide_transition,
    make_render_node,
    merge_analysis,
)
from brainstorm_agent.persistence.models import OpenQuestionRecord
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM


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


def _gate_run(user_message: str, questions: list[OpenQuestionItem] | None = None) -> AssistantAnalysis:
    analysis = AssistantAnalysis(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        summary="",
        assistant_message="",
        open_questions=questions or [],
    )
    result = apply_stage_rules({
        "session_id": "s",
        "current_stage": Stage.STAGE_1_PROBLEM_FRAMING.value,
        "user_message": user_message,
        "session_state": {},
        "analysis": analysis.model_dump(mode="json"),
    })
    return AssistantAnalysis.model_validate(result["analysis"])


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Nous voulons réduire le temps de qualification des prospects.", "Quel problème"),
        ("We want to cut the time spent qualifying leads.", "What problem"),
    ],
)
def test_failed_gate_asks_readable_questions_in_the_session_language(message: str, expected: str):
    gate = [q for q in _gate_run(message).open_questions if q.id.startswith("gate:")]
    assert gate
    assert any(q.question.startswith(expected) for q in gate)
    assert not any("Please clarify" in q.question or "Required field" in q.question for q in gate)
    assert all(2 <= len(q.options) <= 4 and q.recommended_option in q.options for q in gate)
    assert all(q.why_it_matters and q.field for q in gate)


def test_gate_and_model_questions_share_the_three_question_budget():
    model = [
        OpenQuestionItem(question="Qui utilise le service ?", field="users_actors"),
        OpenQuestionItem(question="Quelles contraintes ?", field="constraints"),
    ]
    analysis = _gate_run("Nous voulons un outil de cadrage pour les équipes.", model)
    shown = selected_questions(analysis.open_questions)
    assert len(shown) == 3
    assert [q.field for q in shown][:2] == ["users_actors", "constraints"]
    fields = [q.field for q in analysis.open_questions]
    assert len(fields) == len(set(fields))


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


def test_render_delivers_provider_deltas_before_return(mocker: MockerFixture) -> None:

    delivered = []
    llm = mocker.Mock(spec=OpenAICompatibleBrainstormLLM)

    async def provider_deltas(**_kwargs: object) -> AsyncIterator[str]:
        await asyncio.sleep(0)
        yield "First "
        assert delivered == ["First "]
        yield "second."

    async def consume(delta: str) -> None:
        await asyncio.sleep(0)
        delivered.append(delta)

    llm.stream_reply = provider_deltas
    renderer = mocker.Mock()
    renderer.render.return_value = "# Document"
    node = make_render_node(renderer, llm)

    async def render() -> dict[str, object]:
        return await node({
            "session_id": "session",
            "current_stage": "stage_0_pitch",
            "session_state": {},
            "user_message": "Hello",
            "on_delta": consume,
            "analysis": {"stage": "stage_0_pitch", "summary": "Summary", "assistant_message": ""},
            "validation": {"stage": "stage_0_pitch", "transition_decision_reason": "Incomplete"},
        })

    result = asyncio.run(render())
    assert delivered == ["First ", "second."]
    assert AssistantAnalysis.model_validate(result["analysis"]).assistant_message == "First second."
    llm.reply.assert_not_called()
