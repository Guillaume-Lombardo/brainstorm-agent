"""Optional Redis-backed coordination helpers."""

from __future__ import annotations

from contextlib import AbstractContextManager, contextmanager
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Iterator

    from redis import Redis


class SessionLockManager(Protocol):
    """Protocol for session-scoped locks."""

    def lock(self, session_id: str) -> AbstractContextManager[None]:
        """Acquire a session-scoped lock."""


class NoopSessionLockManager:
    """Fallback no-op lock manager."""

    def __init__(self) -> None:
        """Initialize the no-op lock manager."""
        self._enabled = False

    @contextmanager
    def lock(self, session_id: str) -> Iterator[None]:
        """Yield a no-op lock context.

        Args:
            session_id: Session identifier.

        Yields:
            None: No-op lock guard.
        """
        _ = self._enabled
        del session_id
        yield


class RedisSessionLockManager:
    """Redis-backed lock manager."""

    def __init__(self, redis_client: Redis) -> None:
        """Initialize the Redis lock manager.

        Args:
            redis_client: Redis client used for locking.
        """
        self.redis_client = redis_client

    @contextmanager
    def lock(self, session_id: str) -> Iterator[None]:
        """Acquire and release a Redis session lock.

        Args:
            session_id: Session identifier.

        Yields:
            None: Lock guard while the context is active.
        """
        lock = self.redis_client.lock(f"brainstorm-session:{session_id}", timeout=30)
        lock.acquire(blocking=True)
        try:
            yield
        finally:
            if lock.owned():
                lock.release()
