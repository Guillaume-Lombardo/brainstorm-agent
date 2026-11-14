from __future__ import annotations

from types import SimpleNamespace
from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, Mock

from brainstorm_agent.api.dependencies import get_session_service
from brainstorm_agent.async_runner import run_async
from brainstorm_agent.services.llm_client import OpenAICompatibleBrainstormLLM
from brainstorm_agent.services.locks import NoopSessionLockManager
from brainstorm_agent.services.prompt_loader import PromptLoader
from brainstorm_agent.settings import Settings

if TYPE_CHECKING:
    from openai import AsyncOpenAI


def test_api_session_service_closes_owned_provider(mocker):
    settings = Settings()
    client = cast("AsyncOpenAI", SimpleNamespace(close=AsyncMock(), is_closed=Mock(return_value=False)))
    adapter = OpenAICompatibleBrainstormLLM(client=client, settings=settings, prompt_loader=PromptLoader())
    mocker.patch("brainstorm_agent.services.session_service.build_llm", return_value=adapter)
    service = get_session_service(
        request=mocker.Mock(state=mocker.Mock(principal=None)),
        db_session=mocker.Mock(),
        settings=settings,
        prompt_loader=PromptLoader(),
        lock_manager=NoopSessionLockManager(),
    )
    mocker.patch.object(service, "_aprocess_user_message", new=AsyncMock(return_value=None))
    run_async(service.aprocess_user_message(session_id="session", content="message"))
    cast("AsyncMock", client.close).assert_awaited_once()
