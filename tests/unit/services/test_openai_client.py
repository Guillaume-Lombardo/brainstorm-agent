from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, cast

from brainstorm_agent.core.enums import LLMMode, Stage
from brainstorm_agent.core.models import AssistantAnalysis, BrainstormSessionState
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM, build_llm
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from openai import OpenAI


@dataclass
class _FakeMessage:
    content: str


@dataclass
class _FakeChoice:
    message: _FakeMessage


class _FakeCompletion:
    def __init__(self, content: str) -> None:
        self.choices = [_FakeChoice(_FakeMessage(content))]


class _FakeCompletions:
    def __init__(self, content: str) -> None:
        self.content = content

    def create(self, **_: object) -> _FakeCompletion:
        return _FakeCompletion(self.content)


class _FakeChat:
    def __init__(self, content: str) -> None:
        self.completions = _FakeCompletions(content)


class _FakeOpenAIClient:
    def __init__(self, content: str) -> None:
        self.chat = _FakeChat(content)


def test_openai_compatible_llm_parses_json_payload() -> None:
    payload = (
        '{"summary":"ok","assistant_message":"continue","facts":[],"assumptions":[],"decisions":[],'
        '"uncertainties":[],"open_questions":[],"risks":[],"extracted_fields":{"problem_statement":"x"},'
        '"stage_is_clear_enough":true,"transition_decision_reason":"ready"}'
    )
    llm = OpenAICompatibleBrainstormLLM(
        client=cast("OpenAI", _FakeOpenAIClient(payload)),
        settings=Settings(llm_mode=LLMMode.OPENAI, openai_api_key="key"),
        prompt_loader=PromptLoader(base_path=Path(__file__).resolve().parents[3] / "prompts"),
    )

    analysis = llm.analyze(
        stage=Stage.STAGE_1_PROBLEM_FRAMING,
        user_message="problem: x",
        session_state=BrainstormSessionState(session_id="session-1"),
        current_stage_state=None,
    )

    assert isinstance(analysis, AssistantAnalysis)
    assert analysis.stage_is_clear_enough is True


def test_build_llm_returns_openai_adapter_when_configured(mocker) -> None:
    fake_client = _FakeOpenAIClient("{}")
    mocker.patch("brainstorm_agent.services.llm_client.OpenAI", return_value=fake_client)

    llm = build_llm(
        settings=Settings(llm_mode=LLMMode.OPENAI, openai_api_key="key"),
        prompt_loader=PromptLoader(base_path=Path(__file__).resolve().parents[3] / "prompts"),
    )

    assert isinstance(llm, OpenAICompatibleBrainstormLLM)
