from unittest.mock import AsyncMock, MagicMock, patch

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.core.enums import LLMMode
from brainstorm_agent.evaluation.actors import EvaluationActors
from brainstorm_agent.evaluation.models import AnswerMode, load_scenarios
from brainstorm_agent.evaluation.runner import default_scenarios, run_scenario
from brainstorm_agent.services.llm_client import FakeBrainstormLLM, OpenAICompatibleBrainstormLLM, build_llm
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.settings import Settings


def test_live_adapter_constructs_without_network():
    llm = build_llm(
        settings=Settings(
            llm_mode=LLMMode.OPENAI,
            openai_base_url="https://example.invalid/v1",
            openai_api_key="fixture",
        ),
        prompt_loader=PromptLoader(),
    )
    assert isinstance(llm, OpenAICompatibleBrainstormLLM)
    run_async(llm.client.close())


def test_judge_failure_does_not_change_target_result():
    scenario = load_scenarios(default_scenarios())[0]
    actors = MagicMock(spec=EvaluationActors)
    actors.judge = AsyncMock(side_effect=ValueError("invalid judge JSON"))
    with patch(
        "brainstorm_agent.evaluation.runner.build_llm",
        return_value=FakeBrainstormLLM(prompt_loader=PromptLoader()),
    ):
        result = run_async(run_scenario(scenario, Settings(llm_mode=LLMMode.FAKE), actors))
    assert result["passed"]
    assert result["completed"]
    assert result["metrics"]["schema_failures"] == 0
    assert result["metrics"]["actor_failures"] == 8
    assert result["observations"][0]["actor_errors"] == {"judge": "ValueError"}


def test_simulator_failure_is_not_target_schema_failure():
    scenario = load_scenarios(default_scenarios())[0]
    scenario.answer_mode = AnswerMode.SIMULATED
    actors = MagicMock(spec=EvaluationActors)
    actors.answer = AsyncMock(side_effect=ValueError("invalid simulator"))
    with patch(
        "brainstorm_agent.evaluation.runner.build_llm",
        return_value=FakeBrainstormLLM(prompt_loader=PromptLoader()),
    ):
        result = run_async(run_scenario(scenario, Settings(llm_mode=LLMMode.FAKE), actors))
    assert not result["passed"]
    assert result["metrics"]["schema_failures"] == 0
    assert result["observations"][0]["target_attempted"] is False
