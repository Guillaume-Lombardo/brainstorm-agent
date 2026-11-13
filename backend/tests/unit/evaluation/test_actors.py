import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.evaluation.actors import EvaluationActors
from brainstorm_agent.evaluation.models import load_scenarios
from brainstorm_agent.evaluation.runner import default_scenarios


def test_simulator_has_no_oracle_and_judge_rubric():
    complete = AsyncMock(
        return_value=SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=5, completion_tokens=2),
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content="I export monthly reports"),
                ),
            ],
        ),
    )
    client = MagicMock()
    client.chat.completions.create = complete
    actors = EvaluationActors(client, "reference")
    scenario = load_scenarios(default_scenarios())[0]
    assert run_async(actors.answer(scenario, "Who uses it?")) == "I export monthly reports"
    payload = json.loads(complete.call_args.kwargs["messages"][1]["content"])
    assert set(payload) == {"persona", "hidden_facts", "question"}
    complete.return_value.choices[0].message.content = json.dumps(
        {"specificity": 3, "traceability": 2, "no_invented_facts": 4, "rationale": "Supported"},
    )
    assert run_async(actors.judge(["Monthly reports"], "Document")).traceability == 2
    assert actors.prompt_tokens == 10
