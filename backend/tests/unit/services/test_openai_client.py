from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast

from openai import pydantic_function_tool

if TYPE_CHECKING:
    from collections.abc import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from openai import AsyncOpenAI

from brainstorm_agent.async_runner import run_async
from brainstorm_agent.core.enums import ChallengePass, LLMMode, Stage, StructuredOutputMode
from brainstorm_agent.core.models import AssistantAnalysis, BrainstormSessionState
from brainstorm_agent.exceptions import LLMResponseError
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM, build_llm
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.settings import Settings


def completion(content: str):
    return SimpleNamespace(
        choices=[
            SimpleNamespace(message=SimpleNamespace(content=content, tool_calls=None), finish_reason="stop"),
        ],
        usage=SimpleNamespace(prompt_tokens=10, completion_tokens=5),
    )


def make_llm(responses, mode=StructuredOutputMode.JSON_SCHEMA):
    client = cast(
        "AsyncOpenAI",
        SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(side_effect=[completion(item) for item in responses]),
                ),
            ),
        ),
    )
    return OpenAICompatibleBrainstormLLM(
        client=client,
        settings=Settings(llm_mode=LLMMode.OPENAI, llm_output_mode=mode),
        prompt_loader=PromptLoader(),
    )


def analyze(llm):
    return run_async(
        llm.analyze(
            stage=Stage.STAGE_1_PROBLEM_FRAMING,
            user_message="Les équipes perdent du temps",
            session_state=BrainstormSessionState(session_id="test"),
            current_stage_state=None,
        ),
    )


def payload():
    return (Path(__file__).parent / "fixtures" / "analysis-valid.json").read_text()


@pytest.mark.parametrize(
    "invalid",
    [
        (Path(__file__).parent / "fixtures" / "analysis-invalid.txt").read_text(),
        (Path(__file__).parent / "fixtures" / "analysis-mismatch.json").read_text(),
        '{"summary":"ok","assistant_message":"ok","extracted_fields":{"unknown":"x"}}',
    ],
)
def test_retry_invalid_json_and_schema(invalid):
    llm = make_llm([invalid, payload()])
    analysis = analyze(llm)
    assert analysis.extracted_fields.get("problem_statement") == "Temps perdu"
    assert analysis.prompt_tokens == 20
    assert cast("AsyncMock", llm.client.chat.completions.create).await_count == 2
    assert (
        "Validation error"
        in cast("AsyncMock", llm.client.chat.completions.create).call_args.kwargs["messages"][-1]["content"]
    )


def test_invalid_twice_is_actionable():
    llm = make_llm(["bad", "bad"])
    with pytest.raises(LLMResponseError, match="LLM_OUTPUT_MODE"):
        analyze(llm)
    assert cast("AsyncMock", llm.client.chat.completions.create).await_count == 2


@pytest.mark.parametrize("mode", [StructuredOutputMode.JSON_SCHEMA, StructuredOutputMode.JSON_OBJECT])
def test_partial_patch_and_output_contract(mode):
    llm = make_llm([payload()], mode)
    analysis = analyze(llm)
    assert analysis.extracted_fields.get("users_actors") is None
    options = cast("AsyncMock", llm.client.chat.completions.create).call_args.kwargs
    assert options["response_format"]["type"] == mode.value
    if mode is StructuredOutputMode.JSON_SCHEMA:
        schema = options["response_format"]["json_schema"]
        assert schema["strict"] is True
        assert schema["schema"]["additionalProperties"] is False


def test_build_llm_returns_async_adapter():
    llm = build_llm(
        settings=Settings(openai_api_key="test", openai_base_url="https://provider.invalid/v1"),
        prompt_loader=PromptLoader(),
    )
    assert isinstance(llm, OpenAICompatibleBrainstormLLM)
    assert isinstance(llm.client, AsyncOpenAI)


def test_tool_fallback_parses_arguments():
    llm = make_llm([], StructuredOutputMode.TOOL)
    result = completion("")
    result.choices[0].message.tool_calls = [SimpleNamespace(function=SimpleNamespace(arguments=payload()))]
    cast("AsyncMock", llm.client.chat.completions.create).side_effect = [result]
    assert analyze(llm).summary == "Les équipes perdent du temps"
    assert (
        cast("AsyncMock", llm.client.chat.completions.create).call_args.kwargs["tool_choice"]["function"][
            "name"
        ]
        == "submit_analysis"
    )


def test_reply_stream_accounts_usage():
    llm = make_llm([payload()])
    analysis = analyze(llm)

    async def chunks() -> AsyncIterator[SimpleNamespace]:  # noqa: RUF029
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Bonjour"))], usage=None)
        yield SimpleNamespace(choices=[], usage=SimpleNamespace(prompt_tokens=20, completion_tokens=3))

    cast("AsyncMock", llm.client.chat.completions.create).side_effect = None
    cast("AsyncMock", llm.client.chat.completions.create).return_value = chunks()
    assert run_async(llm.reply(stage=analysis.stage, analysis=analysis, user_message="Bonjour")) == "Bonjour"
    assert analysis.prompt_tokens == 30
    assert analysis.completion_tokens == 8


def test_reply_keeps_the_analysis_as_internal_context():
    llm = make_llm([payload()])
    analysis = analyze(llm)

    async def chunks() -> AsyncIterator[SimpleNamespace]:  # noqa: RUF029
        yield SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace(content="Bonjour"))], usage=None)

    create = cast("AsyncMock", llm.client.chat.completions.create)
    create.side_effect = None
    create.return_value = chunks()
    run_async(llm.reply(stage=analysis.stage, analysis=analysis, user_message="Mon pitch"))
    system, user = create.call_args.kwargs["messages"]
    # The shared system prompt asks for JSON on structured tasks: the reply must not echo it.
    assert "never output json" in system["content"].lower()
    assert user["content"].startswith("User message:\nMon pitch\n\n")
    assert analysis.model_dump_json() in user["content"].split("Internal analysis", 1)[1]


def test_challenge_only_appends_findings():
    llm = make_llm([payload(), '{"findings":["Contradiction"]}'])
    analysis = analyze(llm)
    llm.settings.llm_challenge_pass = ChallengePass.FINDINGS
    fields = analysis.extracted_fields.model_dump()
    result = run_async(llm.challenge(stage=analysis.stage, analysis=analysis))
    assert result.extracted_fields.model_dump() == fields
    assert result.contradictions == ["Contradiction"]


def test_missing_provider_configuration_fails_before_client_creation(mocker):
    client = mocker.patch("brainstorm_agent.services.llm_client.AsyncOpenAI")
    with pytest.raises(ValueError, match=r"OPENAI_BASE_URL.*OPENAI_API_KEY"):
        build_llm(settings=Settings(openai_api_key=None, openai_base_url=None), prompt_loader=PromptLoader())
    client.assert_not_called()


def test_analysis_provider_schema_has_no_open_objects():

    schema = pydantic_function_tool(AssistantAnalysis)["function"]["parameters"]

    def check(node) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False
            for child in node.values():
                check(child)
        elif isinstance(node, list):
            for child in node:
                check(child)

    check(schema)
