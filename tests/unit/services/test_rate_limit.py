from __future__ import annotations

from typing import TYPE_CHECKING, cast
from unittest.mock import patch

from brainstorm_agent.core.enums import AuthMode
from brainstorm_agent.core.models import AuthenticatedPrincipal
from brainstorm_agent.services.rate_limit import (
    InMemoryRateLimiter,
    RedisRateLimiter,
    build_rate_limit_identifier,
)

if TYPE_CHECKING:
    from redis import Redis


class RedisStub:
    """Minimal Redis stub for rate-limit tests."""

    def __init__(self) -> None:
        """Initialize the stub storage."""
        self.expirations: list[tuple[str, int]] = []
        self.current = 2

    def incr(self, _key: str) -> int:
        """Return a fixed count above the configured limit."""
        return self.current

    def expire(self, key: str, seconds: int) -> None:
        """Record the expiration applied to the current bucket."""
        self.expirations.append((key, seconds))


def test_in_memory_rate_limiter_blocks_after_limit() -> None:
    limiter = InMemoryRateLimiter()

    with patch("brainstorm_agent.services.rate_limit.time", return_value=119.2):
        first_allowed, first_retry = limiter.check(identifier="client-1", limit=1, window_seconds=60)
        second_allowed, second_retry = limiter.check(identifier="client-1", limit=1, window_seconds=60)

    assert first_allowed is True
    assert first_retry == 0
    assert second_allowed is False
    assert second_retry == 1


def test_redis_rate_limiter_aligns_retry_after_to_bucket_end() -> None:
    redis_client = RedisStub()
    limiter = RedisRateLimiter(
        redis_client=cast("Redis", redis_client),
        namespace="brainstorm-agent",
    )

    with patch("brainstorm_agent.services.rate_limit.time", return_value=119.2):
        allowed, retry_after = limiter.check(identifier="client-1", limit=1, window_seconds=60)

    assert allowed is False
    assert retry_after == 1


def test_rate_limit_identifier_prefers_principal_subject() -> None:
    principal = AuthenticatedPrincipal(subject="user-1", auth_mode=AuthMode.JWT)

    identifier = build_rate_limit_identifier(principal=principal, client_host="127.0.0.1")

    assert identifier == "user-1"
