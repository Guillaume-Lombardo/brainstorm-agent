"""Optional Redis-backed coordination helpers."""

from __future__ import annotations

from contextlib import AbstractContextManager, contextmanager
from typing import TYPE_CHECKING, Protocol

from brainstorm_agent.exceptions import LockAcquisitionError

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

    def __init__(
        self,
        redis_client: Redis,
        *,
        timeout_seconds: float = 30.0,
        blocking_timeout_seconds: float = 5.0,
    ) -> None:
        """Initialize the Redis lock manager.

        Args:
            redis_client: Redis client used for locking.
            timeout_seconds: Maximum lease duration for the lock.
            blocking_timeout_seconds: Maximum wait time to acquire the lock.
        """
        self.redis_client = redis_client
        self.timeout_seconds = timeout_seconds
        self.blocking_timeout_seconds = blocking_timeout_seconds

    @contextmanager
    def lock(self, session_id: str) -> Iterator[None]:
        """Acquire and release a Redis session lock.

        Args:
            session_id: Session identifier.

        Yields:
            None: Lock guard while the context is active.

        Raises:
            LockAcquisitionError: If the lock cannot be acquired within the configured timeout.
        """
        lock = self.redis_client.lock(
            f"brainstorm-session:{session_id}",
            timeout=self.timeout_seconds,
        )
        acquired = lock.acquire(
            blocking=True,
            blocking_timeout=self.blocking_timeout_seconds,
        )
        if not acquired:
            raise LockAcquisitionError(session_id=session_id)
        try:
            yield
        finally:
            if lock.owned():
                lock.release()
