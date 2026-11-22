from __future__ import annotations

import threading
from typing import TYPE_CHECKING

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError
from redis.exceptions import LockNotOwnedError

from brainstorm_agent.exceptions import LockAcquisitionError
from brainstorm_agent.services.locks import NoopSessionLockManager, RedisSessionLockManager

if TYPE_CHECKING:
    from unittest.mock import Mock

    from pytest_mock import MockerFixture


def test_noop_lock_manager_yields() -> None:
    with NoopSessionLockManager().lock("session-1"):
        assert True


def test_redis_lock_manager_acquires_and_releases(mocker: MockerFixture) -> None:
    fake_lock = mocker.Mock()
    fake_lock.acquire.return_value = True
    fake_lock.owned.return_value = True
    fake_redis = mocker.Mock()
    fake_redis.lock.return_value = fake_lock

    with RedisSessionLockManager(fake_redis).lock("session-2"):
        fake_lock.acquire.assert_called_once_with(blocking=True, blocking_timeout=5.0)

    fake_lock.release.assert_called_once()


def test_redis_lock_manager_raises_when_lock_is_not_acquired(mocker: MockerFixture) -> None:
    fake_lock = mocker.Mock()
    fake_lock.acquire.return_value = False
    fake_redis = mocker.Mock()
    fake_redis.lock.return_value = fake_lock

    with (
        pytest.raises(LockAcquisitionError) as excinfo,
        RedisSessionLockManager(fake_redis).lock("session-3"),
    ):
        pass

    assert excinfo.value.session_id == "session-3"


def _held_lock(mocker: MockerFixture) -> tuple[Mock, Mock]:
    """Fake a Redis client whose lock is acquired and owned.

    Args:
        mocker (MockerFixture): Mock factory.

    Returns:
        tuple[Mock, Mock]: Redis client and lock mocks.
    """
    held = mocker.Mock()
    held.acquire.return_value = True
    held.owned.return_value = True
    client = mocker.Mock()
    client.lock.return_value = held
    return client, held


def test_redis_lock_lease_stays_short_when_turns_may_be_long(mocker: MockerFixture) -> None:
    # A killed process cannot release its lock: only a short lease frees the session.
    client, _ = _held_lock(mocker)

    with RedisSessionLockManager(client, timeout_seconds=1800).lock("session-4"):
        pass

    assert client.lock.call_args.kwargs == {"timeout": 30.0, "thread_local": False}


def test_redis_lock_is_renewed_while_held_and_not_after(mocker: MockerFixture) -> None:
    client, held = _held_lock(mocker)
    renewed = threading.Event()

    def renew() -> bool:
        if held.reacquire.call_count == 1:
            # A transient Redis failure must not end the renewal.
            raise RedisConnectionError
        if held.reacquire.call_count == 3:
            renewed.set()
        return True

    held.reacquire.side_effect = renew
    manager = RedisSessionLockManager(client, timeout_seconds=1800, lease_seconds=0.03)

    with manager.lock("session-5"):
        assert renewed.wait(5)

    held.release.assert_called_once()
    assert not [item for item in threading.enumerate() if item.name.startswith("session-lock")]


@pytest.mark.parametrize("cause", ["deadline", "lost"])
def test_redis_lock_renewal_stops(mocker: MockerFixture, cause: str) -> None:
    client, held = _held_lock(mocker)
    if cause == "lost":
        held.reacquire.side_effect = LockNotOwnedError("lost")
    manager = RedisSessionLockManager(
        client,
        timeout_seconds=0.06 if cause == "deadline" else 1800,
        lease_seconds=0.03,
    )

    with manager.lock("session-6"):
        renewal = next(item for item in threading.enumerate() if item.name == "session-lock-session-6")
        renewal.join(5)
        assert not renewal.is_alive()
