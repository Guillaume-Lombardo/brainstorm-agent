"""Configurable search adapters. Only administrator-configured endpoints are contacted."""

import json
from enum import StrEnum
from typing import TYPE_CHECKING, Protocol

import httpx
from pydantic import ValidationError

from brainstorm_agent.core.research import SearchResult

if TYPE_CHECKING:
    from brainstorm_agent.settings import Settings


MAX_RESPONSE_BYTES = 1_000_000


class SearchProviderName(StrEnum):
    """Configured search implementation."""

    NONE = "none"
    SEARXNG = "searxng"
    TAVILY = "tavily"
    BRAVE = "brave"
    LITELLM = "litellm"
    FAKE = "fake"

    @classmethod
    def from_string(cls, value: str) -> SearchProviderName:
        """Convert configuration text.

        Args:
            value (str): Provider name.

        Returns:
            SearchProviderName: Validated enum.
        """
        return cls(value.strip().lower())


class SearchError(Exception):
    """Sanitized provider failure; credentials and response bodies are never exposed."""


class SearchProvider(Protocol):
    """Port returning normalized search evidence."""

    async def search(self, query: str) -> list[SearchResult]:
        """Search snippets.

        Args:
            query (str): Model-generated query.

        Returns:
            list[SearchResult]: Normalized evidence.
        """
        ...


class FakeSearchProvider:
    """Deterministic fixture provider, restricted to fake LLM mode."""

    @staticmethod
    async def search(query: str) -> list[SearchResult]:
        """Return fixture evidence.

        Args:
            query (str): Ignored fixture query.

        Returns:
            list[SearchResult]: Two predictable products.
        """
        del query
        return [
            SearchResult(title=name, url=f"https://example.com/{slug}", snippet=snippet, provider="fake")
            for name, slug, snippet in [
                ("Frameboard", "frameboard", "Shared framing boards and prioritized story maps."),
                ("Storyframe", "storyframe", "Collaborative story maps and Markdown exports."),
            ]
        ]


class HttpSearchProvider:
    """HTTP adapters with bounded response size, duration and no redirects."""

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        """Configure a transport.

        Args:
            settings (Settings): Validated search configuration.
            transport (httpx.AsyncBaseTransport | None): Optional mock transport.
        """
        self.settings = settings
        self.transport = transport

    async def search(self, query: str) -> list[SearchResult]:
        """Execute a bounded provider request and normalize its response.

        Args:
            query (str): Search terms.

        Returns:
            list[SearchResult]: At most five snippets.

        Raises:
            SearchError: Network, HTTP or contract failure.
        """
        settings = self.settings
        provider = settings.search_provider
        method, headers, params, body = "GET", {}, {}, None
        match provider:
            case SearchProviderName.SEARXNG:
                url = settings.searxng_base_url.rstrip("/") + "/search"
                params = {"q": query, "format": "json"}
            case SearchProviderName.TAVILY:
                url, method = settings.tavily_search_url, "POST"
                headers = {"Authorization": f"Bearer {settings.tavily_api_key}"}
                body = {"query": query, "max_results": 5}
            case SearchProviderName.BRAVE:
                url = settings.brave_search_url
                headers = {"X-Subscription-Token": settings.brave_api_key or ""}
                params = {"q": query, "count": "5"}
            case SearchProviderName.LITELLM:
                url, method = settings.litellm_search_url, "POST"
                headers = {"Authorization": f"Bearer {settings.litellm_search_api_key}"}
                body = {"query": query, "max_results": 5, "search_tool_name": settings.search_tool_name}
            case _:
                raise SearchError("Search is disabled.")  # noqa: TRY003 - Sanitized actionable application error
        try:
            async with (
                httpx.AsyncClient(
                    transport=self.transport,
                    timeout=settings.search_timeout_seconds,
                    follow_redirects=False,
                ) as client,
                client.stream(method, url, params=params, json=body, headers=headers) as response,
            ):
                response.raise_for_status()
                content = bytearray()
                async for chunk in response.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_RESPONSE_BYTES:
                        raise SearchError("Search response exceeded the size limit.")  # noqa: TRY003 - Sanitized actionable application error

            payload = json.loads(content)
            rows = payload["web"]["results"] if provider is SearchProviderName.BRAVE else payload["results"]
            return [
                SearchResult(
                    title=item["title"][:500],
                    url=item["url"],
                    snippet=(
                        item.get("content", "")
                        if provider in {SearchProviderName.SEARXNG, SearchProviderName.TAVILY}
                        else item.get(
                            "description" if provider is SearchProviderName.BRAVE else "snippet",
                            "",
                        )
                    )[:4000],
                    provider=provider.value,
                )
                for item in rows[:5]
            ]
        except (httpx.HTTPError, ValueError, KeyError, TypeError, ValidationError) as exc:
            raise SearchError("Search provider failed; verify its configuration or retry.") from exc  # noqa: TRY003 - Sanitized actionable application error


def build_search_provider(
    settings: Settings,
    transport: httpx.AsyncBaseTransport | None = None,
) -> SearchProvider:
    """Select the configured port implementation.

    Args:
        settings (Settings): Validated configuration.
        transport (httpx.AsyncBaseTransport | None): Optional test transport.

    Returns:
        SearchProvider: Configured adapter.

    Raises:
        SearchError: Search is disabled.
    """
    if settings.search_provider is SearchProviderName.NONE:
        raise SearchError("Search is disabled.")  # noqa: TRY003 - Sanitized actionable application error
    if settings.search_provider is SearchProviderName.FAKE:
        return FakeSearchProvider()
    return HttpSearchProvider(settings, transport)
