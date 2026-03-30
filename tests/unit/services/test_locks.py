from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from brainstorm_agent.exceptions import LockAcquisitionError
from brainstorm_agent.services.locks import NoopSessionLockManager, RedisSessionLockManager

if TYPE_CHECKING:
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
