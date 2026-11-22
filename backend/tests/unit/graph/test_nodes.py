from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator  # noqa: TC003

import pytest
from pytest_mock import MockerFixture  # noqa: TC002
from sqlalchemy import String

from brainstorm_agent.core.elicitation import selected_questions
from brainstorm_agent.core.enums import Language, Stage
from brainstorm_agent.core.gate_questions import PROPOSAL_QUESTION, PROPOSED_REASON
from brainstorm_agent.core.models import (
    AssistantAnalysis,
    AssistantTurnOutput,
    AssumptionItem,
    BrainstormSessionState,
    DecisionItem,
    FactItem,
    OpenQuestionItem,
    PartialField,
    StageState,
)
from brainstorm_agent.core.stage_contracts import (
    BacklogFields,
    BacklogItem,
    ProblemFields,
)
from brainstorm_agent.graph.nodes import (
    apply_stage_rules,
    decide_transition,
    make_extract_node,
    make_render_node,
    merge_analysis,
)
from brainstorm_agent.persistence.models import OpenQuestionRecord
from brainstorm_agent.services.llm_client import FakeBrainstormLLM, OpenAICompatibleBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader


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


PROPOSED = PROPOSED_REASON[Language.FR]
TODAY = "Nous voulons réduire le temps de qualification des prospects."


def _extract(
    patch: AssistantAnalysis,
    *,
    previous: StageState | None = None,
    user_text: str = "",
    opening: bool = False,
) -> AssistantAnalysis:
    """Run the extract node on a scripted provider answer.

    Args:
        patch (AssistantAnalysis): Provider answer.
        previous (StageState | None): Accumulated state of the stage.
        user_text (str): What the user typed.
        opening (bool): Whether the assistant opens the stage.

    Returns:
        AssistantAnalysis: Merged analysis.
    """
    llm = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
        scripted_responses=[patch],
    )
    session = BrainstormSessionState(
        session_id="s",
        current_stage=patch.stage,
        stage_states={previous.stage.value: previous} if previous else {},
        transcript=[{"role": "user", "content": TODAY}],
    )

    async def run() -> dict[str, object]:
        return await make_extract_node(llm)({
            "session_id": "s",
            "session_state": session.model_dump(mode="json"),
            "current_stage": patch.stage.value,
            "user_message": user_text or "opening instructions",
            "user_text": user_text,
            "opening": opening,
        })

    return AssistantAnalysis.model_validate(asyncio.run(run())["analysis"])


def test_opening_keeps_only_proposals_to_confirm():
    analysis = _extract(
        AssistantAnalysis(
            stage=Stage.STAGE_1_PROBLEM_FRAMING,
            summary="",
            assistant_message="",
            extracted_fields=ProblemFields(problem_statement="Slow", users_actors=["Sales"]),
            facts=[FactItem(statement="Invented fact")],
            decisions=[DecisionItem(statement="Invented decision")],
            assumptions=[AssumptionItem(statement="Sales qualify alone")],
            confirmed_fields=["problem_statement"],
        ),
        opening=True,
    )
    assert analysis.facts == []
    assert analysis.decisions == []
    assert analysis.confirmed_fields == []
    assert [item.to_confirm for item in analysis.assumptions] == [True]
    assert {item.field: item.reason for item in analysis.partial_fields} == {
        "problem_statement": PROPOSED,
        "users_actors": PROPOSED,
    }


def _proposed_state(**fields: object) -> StageState:
    return StageState(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        extracted_fields=ProblemFields.model_validate(fields),
        partial_fields=dict.fromkeys(fields, PROPOSED),
    )


def _user_patch(**values: object) -> AssistantAnalysis:
    return AssistantAnalysis.model_validate(
        {"stage": Stage.STAGE_1_PROBLEM_FRAMING, "summary": "", "assistant_message": ""} | values,
    )


@pytest.mark.parametrize(
    ("patch", "user_text", "remaining"),
    [
        # The user talks about something else and the model repeats a value.
        (
            {"extracted_fields": ProblemFields(problem_statement="Slow")},
            "Encore une idée",
            {"problem_statement", "users_actors"},
        ),
        # The user corrects one value.
        (
            {"extracted_fields": ProblemFields(problem_statement="Costly")},
            "C'est surtout cher",
            {"users_actors"},
        ),
        # The user confirms one value in their own words.
        ({"confirmed_fields": ["users_actors"]}, "Oui pour les utilisateurs", {"problem_statement"}),
        # A repeated server reason never outlives the confirmation.
        (
            {
                "confirmed_fields": ["users_actors", "problem_statement"],
                "partial_fields": [PartialField(field="users_actors", reason=PROPOSED)],
            },
            "Oui à tout",
            set(),
        ),
        # The user picks the confirming answer: no provider judgement is needed.
        ({}, PROPOSAL_QUESTION.options[Language.FR][0], set()),
    ],
)
def test_proposals_wait_for_the_user(patch: dict[str, object], user_text: str, remaining: set[str]):
    analysis = _extract(
        _user_patch(**patch),
        previous=_proposed_state(problem_statement="Slow", users_actors=["Sales"]),
        user_text=user_text,
    )
    assert {item.field for item in analysis.partial_fields} == remaining


def test_adding_an_item_does_not_confirm_a_proposed_collection():
    items = [BacklogItem(id=f"R{n}", statement=f"Risk {n}") for n in (1, 2)]
    previous = StageState(
        stage=Stage.STAGE_6_BACKLOG_SYNTHESIS,
        extracted_fields=BacklogFields(risk_spikes=items[:1]),
        partial_fields={"risk_spikes": PROPOSED},
    )
    merged = merge_analysis(
        previous=previous,
        patch=AssistantAnalysis(
            stage=previous.stage,
            summary="",
            assistant_message="",
            extracted_fields=BacklogFields(risk_spikes=items[1:]),
        ),
    )
    assert [item.field for item in merged.partial_fields] == ["risk_spikes"]


def test_proposals_are_confirmed_with_one_question():
    state = _proposed_state(problem_statement="Slow", users_actors=["Sales"])
    result = apply_stage_rules({
        "session_id": "s",
        "current_stage": state.stage.value,
        "user_message": TODAY,
        "session_state": {},
        "analysis": _user_patch(
            extracted_fields=state.extracted_fields,
            partial_fields=[
                PartialField(field=key, reason=reason) for key, reason in state.partial_fields.items()
            ],
        ).model_dump(mode="json"),
    })
    gate = [
        q
        for q in AssistantAnalysis.model_validate(result["analysis"]).open_questions
        if q.id.startswith("gate:")
    ]
    assert gate[0].question == PROPOSAL_QUESTION.question[Language.FR]
    assert gate[0].options == list(PROPOSAL_QUESTION.options[Language.FR])
    assert not {"problem_statement", "users_actors"} & {q.field for q in gate}
