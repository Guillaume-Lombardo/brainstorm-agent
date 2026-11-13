"""Real structured research adapter requests in JSON-object compatibility mode."""

import asyncio
import json
from unittest.mock import Mock

import httpx
from openai import AsyncOpenAI

from brainstorm_agent.core.enums import LLMMode, Stage, StructuredOutputMode
from brainstorm_agent.core.models import StageState
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.services.research import execute_research
from brainstorm_agent.services.search import FakeSearchProvider
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.settings import Settings


def test_queries_and_synthesis_use_json_object_with_schema_repair() -> None:
    requests = []
    replies = [
        {"queries": ["framing tools", "framing alternatives", "framing features"]},
        {"products": "invalid schema"},
        {"products": [], "features": [], "assumptions": [], "open_questions": []},
    ]

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "completion",
                "object": "chat.completion",
                "created": 0,
                "model": "test",
                "choices": [
                    {
                        "index": 0,
                        "finish_reason": "stop",
                        "message": {"role": "assistant", "content": json.dumps(replies.pop(0))},
                    },
                ],
            },
        )

    settings = Settings(llm_mode=LLMMode.OPENAI, llm_output_mode=StructuredOutputMode.JSON_OBJECT)
    client = AsyncOpenAI(
        api_key="fixture",  # pragma: allowlist secret
        base_url="http://llm.test/v1",
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )
    service = Mock(spec=SessionService)
    service.settings = settings
    service.prompt_loader = PromptLoader()
    service.llm = OpenAICompatibleBrainstormLLM(
        client=client,
        settings=settings,
        prompt_loader=service.prompt_loader,
    )
    stage = StageState.model_validate({
        "stage": Stage.STAGE_1_PROBLEM_FRAMING,
        "extracted_fields": {"problem_statement": "Teams need reliable project framing"},
    })
    benchmark = asyncio.run(execute_research(service, stage, 1, FakeSearchProvider()))
    assert len(benchmark.queries) == 3
    assert len(benchmark.results) == 2
    assert len(requests) == 3
    for request in requests:
        assert request["response_format"] == {"type": "json_object"}
        assert "tools" not in request
    assert '"minItems": 3' in requests[0]["messages"][1]["content"]
    assert '"key_features"' in requests[1]["messages"][1]["content"]
    assert "Frameboard" in requests[1]["messages"][1]["content"]
    assert "Validation error" in requests[2]["messages"][-1]["content"]
    assert client.is_closed()
