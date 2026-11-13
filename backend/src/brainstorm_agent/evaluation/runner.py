"""Offline and opt-in live evaluation against the production turn graph."""

from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from openai import AsyncOpenAI
from pydantic import ValidationError

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import AssistantAnalysis, BrainstormSessionState, StageState
from brainstorm_agent.evaluation.actors import EvaluationActors
from brainstorm_agent.evaluation.metrics import calculate_metrics
from brainstorm_agent.evaluation.models import AnswerMode, Observation, Scenario, load_scenarios
from brainstorm_agent.exceptions import LLMResponseError
from brainstorm_agent.graph.builder import build_turn_graph
from brainstorm_agent.services.llm_client import FakeBrainstormLLM, OpenAICompatibleBrainstormLLM, build_llm
from brainstorm_agent.services.markdown import MarkdownRenderer
from brainstorm_agent.services.prompt_loader import PromptLoader

if TYPE_CHECKING:
    from brainstorm_agent.settings import Settings


def default_scenarios() -> Path:
    """Return the packaged golden corpus directory.

    Returns:
        Path: Installed resource directory.
    """
    return Path(__file__).parents[1] / "resources" / "evaluation"


async def run_scenario(  # noqa: C901, PLR0912, PLR0915 - bounded sequential conversation trace
    scenario: Scenario,
    settings: Settings,
    actors: EvaluationActors | None,
) -> dict[str, Any]:
    """Execute oracle checkpoints without resetting a divergent workflow.

    Args:
        scenario (Scenario): Golden inputs and expected decisions.
        settings (Settings): Target adapter configuration; fake is strictly offline.
        actors (EvaluationActors | None): Live simulator/judge, absent for replay.

    Returns:
        dict[str, Any]: Trace, expectation failures, and measured metrics.
    """
    loader = PromptLoader.from_settings(settings)
    llm = (
        FakeBrainstormLLM(prompt_loader=loader)
        if actors is None
        else build_llm(settings=settings, prompt_loader=loader)
    )
    graph = build_turn_graph(llm=llm, renderer=MarkdownRenderer(loader))
    state = BrainstormSessionState(session_id=str(uuid4()))
    observations: list[Observation] = []
    failures: list[str] = []
    question = "Please share your initial project pitch."
    completed = False
    try:
        for index, turn in enumerate(scenario.turns):
            observation = Observation(stage=turn.stage, expected=turn.should_advance)
            observations.append(observation)
            if completed or state.current_stage != turn.stage:
                observation.error = "Workflow diverged from oracle checkpoint."
                failures.append(f"turn {index + 1}: {observation.error}")
                continue
            start = perf_counter()
            try:
                answer = turn.answer
                if actors and scenario.answer_mode is AnswerMode.SIMULATED:
                    try:
                        answer = await actors.answer(scenario, question)
                    except Exception as exc:
                        observation.actor_errors["simulator"] = type(exc).__name__
                        observation.target_attempted = False
                        failures.append(f"turn {index + 1}: simulator failed; target not evaluated")
                        continue
                if isinstance(llm, FakeBrainstormLLM):
                    llm.scripted_responses.append(AssistantAnalysis.model_validate(turn.recorded_analysis))
                result = await graph.ainvoke({
                    "session_id": state.session_id,
                    "session_state": state.model_dump(mode="json"),
                    "current_stage": state.current_stage.value,
                    "user_message": answer,
                })
                analysis = AssistantAnalysis.model_validate(result["analysis"])
                output = result["assistant_output"]
                observation.actual = output["stage_clear_enough"]
                observation.prompt_tokens = output["prompt_tokens"]
                observation.completion_tokens = output["completion_tokens"]
                observation.markdown = output["step_markdown"]
                if turn.contradiction:
                    observation.contradiction_found = any(
                        turn.contradiction.casefold() in item.casefold() for item in analysis.contradictions
                    )
                state.stage_states[turn.stage.value] = StageState.model_validate({
                    **analysis.model_dump(mode="json"),
                    "partial_fields": {item.field: item.reason for item in analysis.partial_fields},
                    "latest_markdown": observation.markdown,
                })
                state.current_stage = Stage(output["current_stage"])
                state.transcript.extend([
                    {"role": "user", "content": answer},
                    {"role": "assistant", "content": output["assistant_message"]},
                ])
                question = (
                    output["assistant_message"]
                    + "\n"
                    + "\n".join(item["question"] for item in output["open_questions"])
                )
                completed = turn.stage is Stage.STAGE_7_DELIVERY_SLICING and observation.actual
                if actors:
                    try:
                        observation.quality = await actors.judge(
                            [
                                *scenario.hidden_facts,
                                *(item["content"] for item in state.transcript if item["role"] == "user"),
                            ],
                            observation.markdown,
                        )
                    except Exception as exc:
                        observation.actor_errors["judge"] = type(exc).__name__
            except (ValidationError, LLMResponseError) as exc:
                observation.schema_failure = True
                observation.error = type(exc).__name__
            except Exception as exc:
                observation.error = type(exc).__name__
            finally:
                observation.latency_seconds = perf_counter() - start
            if (
                observation.error
                or observation.actual != observation.expected
                or observation.contradiction_found is False
            ):
                failures.append(
                    f"turn {index + 1}: expectation failed ({observation.error or 'gate/contradiction'})",
                )
    finally:
        if isinstance(llm, OpenAICompatibleBrainstormLLM):
            await llm.client.close()
    if scenario.must_complete and not completed:
        failures.append("Workflow did not complete stage 7.")
    return {
        "scenario": scenario.id,
        "passed": not failures,
        "failures": failures,
        "completed": completed,
        "metrics": calculate_metrics(observations),
        "observations": [item.model_dump(mode="json") for item in observations],
    }


async def evaluate(
    *,
    settings: Settings,
    models: list[str],
    scenarios_dir: Path,
    output_dir: Path,
    judge_model: str,
) -> bool:
    """Write JSON and Markdown reports, returning whether expectations passed.

    Args:
        settings (Settings): Connection settings; fake mode prohibits network use.
        models (list[str]): Target LiteLLM aliases.
        scenarios_dir (Path): Golden corpus directory.
        output_dir (Path): User-selected artifact directory.
        judge_model (str): Strong reference alias for privileged actors.

    Returns:
        bool: All scenarios passed for every target.
    """
    scenarios = load_scenarios(scenarios_dir)
    reports = []
    for model in models:
        target = settings.model_copy(update={"model_name": model})
        client = None
        actors = None
        if target.llm_mode is not LLMMode.FAKE:
            target.validate_provider_configuration()
            client = AsyncOpenAI(
                base_url=target.openai_base_url,
                api_key=target.openai_api_key,
                timeout=target.openai_timeout_seconds,
                max_retries=0,
            )
            actors = EvaluationActors(client, judge_model)
        try:
            results = [await run_scenario(scenario, target, actors) for scenario in scenarios]
        finally:
            if client:
                await client.close()
        observations = [
            Observation.model_validate(item) for result in results for item in result["observations"]
        ]
        reports.append({
            "model": model if actors else "recorded-fixtures",
            "requested_model": model,
            "mode": target.llm_mode.value,
            "metrics": calculate_metrics(observations),
            "actor_usage": {
                "prompt_tokens": actors.prompt_tokens if actors else 0,
                "completion_tokens": actors.completion_tokens if actors else 0,
            },
            "scenarios": results,
        })
    write_reports(output_dir, reports)
    return all(result["passed"] for report in reports for result in report["scenarios"])


def write_reports(output_dir: Path, reports: list[dict[str, Any]]) -> None:
    """Write reviewable machine and human reports.

    Args:
        output_dir (Path): Artifact destination.
        reports (list[dict[str, Any]]): Per-model results.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "report.json").write_text(json.dumps({"version": 1, "models": reports}, indent=2) + "\n")
    lines = [
        "# Evaluation report",
        "",
        "Token cost is reported in tokens, not currency. Replay does not measure live model quality.",
        "",
    ]
    for report in reports:
        lines.extend([
            f"## {report['model']}",
            "",
            "```json",
            json.dumps(report["metrics"], indent=2),
            "```",
            "",
        ])
        for result in report["scenarios"]:
            lines.append(
                f"- {result['scenario']}: {'PASS' if result['passed'] else 'FAIL'} {result['failures']}",
            )
            for index, item in enumerate(result["observations"], 1):
                if item["actor_errors"]:
                    lines.append(f"  - Turn {index} actor errors: {item['actor_errors']}")
                if item["quality"]:
                    lines.append(f"  - Document {index} rubric: {json.dumps(item['quality'])}")
    (output_dir / "report.md").write_text("\n".join(lines) + "\n")
