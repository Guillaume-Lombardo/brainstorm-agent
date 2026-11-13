"""Cancellation and HTTP-loop isolation for the streaming worker."""

import asyncio
import threading
from collections.abc import AsyncGenerator  # noqa: TC003
from contextlib import suppress

import anyio
from pytest_mock import MockerFixture  # noqa: TC002

from brainstorm_agent.core.application import TurnEvent, TurnStarted
from brainstorm_agent.core.enums import Stage
from brainstorm_agent.services.session_service import SessionService
from brainstorm_agent.services.streaming import stream_in_worker


def test_worker_cancels_generator_and_keeps_http_loop_responsive(mocker: MockerFixture) -> None:
    service = mocker.Mock(spec=SessionService)
    closed = threading.Event()
    started = threading.Event()
    release = threading.Event()

    def blocking_operation() -> None:
        started.set()
        release.wait(timeout=2)

    async def slow_stream(_session_id: str, _content: str) -> AsyncGenerator[TurnEvent]:
        try:
            blocking_operation()
            yield TurnStarted(turn_id="turn", stage=Stage.STAGE_0_PITCH)
            await asyncio.sleep(3600)
        finally:
            closed.set()

    service.stream_turn = slow_stream

    async def exercise() -> None:
        stream = stream_in_worker(service, "session", "hello")
        first = asyncio.create_task(anext(stream))
        await asyncio.to_thread(started.wait)
        # A synchronous worker operation must not prevent this HTTP-loop tick.
        await asyncio.sleep(0)
        assert not first.done()
        release.set()
        assert (await first).type == "turn.started"
        pending = asyncio.create_task(anext(stream))
        await asyncio.sleep(0.01)
        pending.cancel()
        with suppress(asyncio.CancelledError):
            await pending
        await stream.aclose()
        assert closed.is_set()

    async def run() -> None:
        await asyncio.wait_for(exercise(), timeout=2)

    asyncio.run(run())


def test_anyio_cancellation_waits_for_worker_before_dependency_teardown(mocker: MockerFixture) -> None:
    service = mocker.Mock(spec=SessionService)
    started = threading.Event()
    release = threading.Event()
    closed = threading.Event()
    finished = threading.Event()

    def blocking_operation() -> None:
        started.set()
        release.wait(timeout=2)

    async def slow_stream(_session_id: str, _content: str) -> AsyncGenerator[TurnEvent]:
        try:
            blocking_operation()
            yield TurnStarted(turn_id="turn", stage=Stage.STAGE_0_PITCH)
            await asyncio.sleep(3600)
        finally:
            closed.set()

    service.stream_turn = slow_stream

    async def consume() -> None:
        try:
            async for _ in stream_in_worker(service, "session", "hello"):
                pass
        finally:
            finished.set()

    async def exercise() -> None:
        async with anyio.create_task_group() as group:
            group.start_soon(consume)
            await asyncio.to_thread(started.wait)
            group.cancel_scope.cancel()
            with anyio.CancelScope(shield=True):
                await asyncio.sleep(0.01)
                assert not finished.is_set()
                release.set()
        assert closed.is_set()
        assert finished.is_set()

    asyncio.run(exercise())
