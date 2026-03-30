"""Rate limiting helpers."""

from __future__ import annotations

from collections import defaultdict
from threading import Lock
from time import time
from typing import TYPE_CHECKING, Protocol, cast

if TYPE_CHECKING:
    from redis import Redis

    from brainstorm_agent.core.models import AuthenticatedPrincipal
    from brainstorm_agent.settings import Settings


class RateLimiter(Protocol):
    """Protocol for API rate limiters."""

    def check(
        self,
        *,
        identifier: str,
        limit: int,
        window_seconds: int,
    ) -> tuple[bool, int]:
        """Check whether a request is allowed.

        Returns:
            tuple[bool, int]: `(allowed, retry_after_seconds)`.
        """


class InMemoryRateLimiter:
    """Simple fixed-window rate limiter for test and fallback use."""

    def __init__(self) -> None:
        """Initialize the limiter."""
        self._buckets: defaultdict[str, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
        self._lock = Lock()

    def check(self, *, identifier: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Check whether a request is allowed.

        Returns:
            tuple[bool, int]: `(allowed, retry_after_seconds)`.
        """
        now = time()
        with self._lock:
            count, reset_at = self._buckets[identifier]
            if now >= reset_at:
                count = 0
                reset_at = now + window_seconds
            count += 1
            self._buckets[identifier] = (count, reset_at)
            if count <= limit:
                return True, 0
            return False, max(1, int(reset_at - now))


class RedisRateLimiter:
    """Redis-backed fixed-window rate limiter."""

    def __init__(self, redis_client: Redis, namespace: str) -> None:
        """Initialize the limiter.

        Args:
            redis_client: Redis client.
            namespace: Key namespace prefix.
        """
        self.redis_client = redis_client
        self.namespace = namespace

    def check(self, *, identifier: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Check whether a request is allowed.

        Returns:
            tuple[bool, int]: `(allowed, retry_after_seconds)`.
        """
        bucket = int(time() // window_seconds)
        key = f"{self.namespace}:rate-limit:{bucket}:{identifier}"
        current = cast("int", self.redis_client.incr(key))
        if current == 1:
            self.redis_client.expire(key, window_seconds)
        if current <= limit:
            return True, 0
        ttl = cast("int", self.redis_client.ttl(key))
        retry_after = max(1, ttl if isinstance(ttl, int) and ttl > 0 else window_seconds)
        return False, retry_after


def build_rate_limit_identifier(
    *,
    principal: AuthenticatedPrincipal | None,
    client_host: str | None,
) -> str:
    """Build a stable rate-limit identity for the current caller.

    Args:
        principal: Authenticated principal when available.
        client_host: Request client host.

    Returns:
        str: Stable rate-limit identity.
    """
    if principal is not None:
        return principal.subject
    return f"ip:{client_host or 'unknown'}"


def is_rate_limit_enabled(settings: Settings) -> bool:
    """Return whether rate limiting is enabled.

    Args:
        settings: Application settings.

    Returns:
        bool: `True` when rate limiting should run.
    """
    return settings.rate_limit_enabled
