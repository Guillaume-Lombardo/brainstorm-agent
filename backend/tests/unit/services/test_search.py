"""Provider selection, request contracts and sanitized failures."""

import asyncio
import json

import httpx
import pytest

from brainstorm_agent.services.search import (
    FakeSearchProvider,
    SearchError,
    SearchProviderName,
    build_search_provider,
)
from brainstorm_agent.settings import Settings


def config(provider: str) -> Settings:
    return Settings(
        llm_mode="fake",
        search_provider=provider,
        searxng_base_url="http://search.test",
        tavily_api_key="fixture",
        brave_api_key="fixture",
        litellm_search_api_key="fixture",
        litellm_search_url="http://search.test/v1/search",
        search_tool_name="benchmark",
    )


@pytest.mark.parametrize("provider", ["searxng", "tavily", "brave", "litellm"])
def test_adapters(provider: str) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if provider == "searxng":
            assert request.url.params["format"] == "json"
            assert request.url.path == "/search"
        if provider == "litellm":
            assert json.loads(request.content)["search_tool_name"] == "benchmark"
            assert request.headers["authorization"] == "Bearer fixture"
        if provider == "brave":
            assert request.headers["x-subscription-token"] == "fixture"
        if provider == "tavily":
            assert request.method == "POST"
        rows = [
            {
                "title": "Product",
                "url": "https://example.com/product",
                "content": "Observed feature",
                "snippet": "Observed feature",
                "description": "Observed feature",
            },
        ]
        return httpx.Response(
            200,
            json={"web": {"results": rows}} if provider == "brave" else {"results": rows},
        )

    results = asyncio.run(
        build_search_provider(config(provider), httpx.MockTransport(respond)).search("framing"),
    )
    assert results[0].snippet == "Observed feature"
    assert results[0].provider == provider


@pytest.mark.parametrize("provider", ["searxng", "tavily", "brave", "litellm"])
@pytest.mark.parametrize("failure", ["timeout", "400", "500", "json"])
def test_provider_failures(provider: str, failure: str) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if failure == "timeout":
            raise httpx.ReadTimeout(  # noqa: TRY003 - Test failure
                "fixture private body", request=request
            )
        return httpx.Response(200 if failure == "json" else int(failure), content=b"invalid private body")

    with pytest.raises(SearchError, match="Search provider failed"):
        asyncio.run(build_search_provider(config(provider), httpx.MockTransport(respond)).search("framing"))


def test_fake_and_disabled() -> None:
    assert SearchProviderName.from_string(" FAKE ") is SearchProviderName.FAKE
    assert isinstance(build_search_provider(config("fake")), FakeSearchProvider)
    assert asyncio.run(build_search_provider(config("fake")).search("a")) == asyncio.run(
        build_search_provider(config("fake")).search("b"),
    )
    with pytest.raises(SearchError):
        build_search_provider(Settings(llm_mode="fake"))


@pytest.mark.parametrize("provider", ["searxng", "tavily", "brave", "litellm"])
def test_missing_settings(provider: str) -> None:
    with pytest.raises(ValueError, match="requires"):
        Settings(llm_mode="fake", search_provider=provider)


def test_fake_requires_fake_llm() -> None:
    with pytest.raises(ValueError, match="requires LLM_MODE=fake"):
        Settings(search_provider="fake")
