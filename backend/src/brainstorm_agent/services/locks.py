"""Optional Redis-backed coordination helpers."""

from __future__ import annotations

import threading
import time
from contextlib import AbstractContextManager, contextmanager
from typing import TYPE_CHECKING, Protocol

from redis.exceptions import LockError, RedisError

from brainstorm_agent.exceptions import LockAcquisitionError

if TYPE_CHECKING:
    from collections.abc import Iterator

    from redis import Redis
    from redis.lock import Lock

# A killed process (a redeployment) never releases its lock: the session stays blocked for at
# most one lease, while a running turn keeps renewing its own.
LOCK_LEASE_SECONDS = 30.0


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
        lease_seconds: float = LOCK_LEASE_SECONDS,
    ) -> None:
        """Initialize the Redis lock manager.

        Args:
            redis_client (Redis): Redis client used for locking.
            timeout_seconds (float): Maximum time one holder may keep renewing the lock.
            blocking_timeout_seconds (float): Maximum wait time to acquire the lock.
            lease_seconds (float): Lifetime of the lock between two renewals.
        """
        self.redis_client = redis_client
        self.timeout_seconds = timeout_seconds
        self.blocking_timeout_seconds = blocking_timeout_seconds
        self.lease_seconds = min(lease_seconds, timeout_seconds)

    @contextmanager
    def lock(self, session_id: str) -> Iterator[None]:
        """Acquire a Redis session lock, renew it while held and release it.

        Args:
            session_id (str): Session identifier.

        Yields:
            None: Lock guard while the context is active.

        Raises:
            LockAcquisitionError: If the lock cannot be acquired within the configured timeout.
        """
        lock = self.redis_client.lock(
            f"brainstorm-session:{session_id}",
            timeout=self.lease_seconds,
            # The renewal thread needs the holder's token.
            thread_local=False,
        )
        acquired = lock.acquire(
            blocking=True,
            blocking_timeout=self.blocking_timeout_seconds,
        )
        if not acquired:
            raise LockAcquisitionError(session_id=session_id)
        released = threading.Event()
        renewal = threading.Thread(
            target=self._renew,
            args=(lock, released),
            name=f"session-lock-{session_id}",
            daemon=True,
        )
        renewal.start()
        try:
            yield
        finally:
            released.set()
            renewal.join()
            if lock.owned():
                lock.release()

    def _renew(self, lock: Lock, released: threading.Event) -> None:
        """Extend the lease until the holder is done, loses the lock or exceeds its time.

        Args:
            lock (Lock): Acquired lock.
            released (threading.Event): Set when the holder is done.
        """
        interval = self.lease_seconds / 3
        # The last renewal keeps the lock for one lease.
        deadline = time.monotonic() + self.timeout_seconds - self.lease_seconds
        while not released.wait(interval) and time.monotonic() < deadline:
            try:
                lock.reacquire()
            except LockError:
                return
            except RedisError:
                continue
