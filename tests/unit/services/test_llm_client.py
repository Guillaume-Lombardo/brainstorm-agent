from __future__ import annotations

from brainstorm_agent.core.enums import Stage
from brainstorm_agent.core.models import BrainstormSessionState
from brainstorm_agent.services.llm_client import HeuristicBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader


def test_heuristic_llm_asks_for_missing_required_fields() -> None:
    llm = HeuristicBrainstormLLM(
        prompt_loader=PromptLoader(),
    )

    analysis = llm.analyze(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        user_message="problem: Lead qualification is too slow.",
        session_state=BrainstormSessionState(session_id="session-1"),
        current_stage_state=None,
    )

    assert analysis.stage_is_clear_enough is False
    assert any("users_actors" in item.question for item in analysis.open_questions)
    assert any("constraints" in item.question for item in analysis.open_questions)
