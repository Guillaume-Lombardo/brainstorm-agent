from __future__ import annotations

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import AssistantAnalysis, BrainstormSessionState, OpenQuestionItem
from brainstorm_agent.services.llm_client import FakeBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader


def test_fake_llm_asks_for_missing_required_fields() -> None:
    llm = FakeBrainstormLLM(
        prompt_loader=PromptLoader(),
    )

    analysis = run_async(
        llm.analyze(
            stage=Stage.STAGE_1_PROBLEM_FRAMING,
            user_message="problem: Lead qualification is too slow.",
            session_state=BrainstormSessionState(session_id="session-1"),
            current_stage_state=None,
        ),
    )

    assert analysis.stage_is_clear_enough is False
    fields = {item.field for item in analysis.open_questions}
    assert {"users_actors", "constraints"} <= fields
    assert not any("Please clarify" in item.question for item in analysis.open_questions)
    assert all(item.recommended_option in item.options for item in analysis.open_questions)


def test_fake_llm_asks_missing_fields_in_the_user_language() -> None:
    llm = FakeBrainstormLLM(prompt_loader=PromptLoader())
    analysis = run_async(
        llm.analyze(
            stage=Stage.STAGE_1_PROBLEM_FRAMING,
            user_message="problem: La qualification des prospects est trop lente pour nos équipes.",
            session_state=BrainstormSessionState(session_id="session-1"),
            current_stage_state=None,
        ),
    )
    users = next(item for item in analysis.open_questions if item.field == "users_actors")
    assert users.question.startswith("Qui ")


def test_fake_reply_lists_selected_questions_as_markdown() -> None:
    analysis = AssistantAnalysis(
        stage=Stage.STAGE_0_PITCH,
        summary="",
        assistant_message="Encore quelques points.",
        open_questions=[
            OpenQuestionItem(
                question="Pour qui ?",
                options=["Familles", "Écoles"],
                recommended_option="Familles",
            ),
        ],
    )
    reply = run_async(
        FakeBrainstormLLM.reply(
            stage=Stage.STAGE_0_PITCH,
            analysis=analysis,
            user_message="Je veux un outil.",
        ),
    )
    assert reply == "Encore quelques points.\n\n- **Pour qui ?** Familles *(recommandé)* / Écoles"
