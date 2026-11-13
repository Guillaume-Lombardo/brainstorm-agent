"""Bridge synchronous persistence/locking off the HTTP event loop."""

from __future__ import annotations

import asyncio
from concurrent.futures import Future, ThreadPoolExecutor
from contextlib import aclosing
from typing import TYPE_CHECKING, cast

from anyio import CancelScope

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

    from brainstorm_agent.core.application import TurnEvent
    from brainstorm_agent.services.session_service import SessionService

# Longest silence on a turn stream before a keepalive goes out. It stays well under
# the idle timeouts of the frontend proxy and the reverse proxies, so a long provider
# call (retries included) never looks dead.
TURN_KEEPALIVE_SECONDS = 15.0


class Keepalive:
    """Transport marker: the turn is still running but has nothing new to say."""


async def stream_in_worker(
    service: SessionService,
    session_id: str,
    content: str,
    keepalive_seconds: float | None = None,
) -> AsyncGenerator[TurnEvent | Keepalive]:
    """Run a session turn on one dedicated worker, relaying events and cancellation.

    All synchronous SQL and Redis lock operations stay on that worker, while its
    own event loop drives the async provider. The request never uses its service
    concurrently with the worker. While the worker stays silent, a ``Keepalive``
    marker is yielded every ``keepalive_seconds`` until the turn ends.

    Args:
        service (SessionService): Authorized request-scoped service.
        session_id (str): Owned session id.
        content (str): User input.
        keepalive_seconds (float | None): Silence before each keepalive; defaults
            to ``TURN_KEEPALIVE_SECONDS``.

    Yields:
        TurnEvent | Keepalive: Incremental worker events, or a keepalive marker.
    """
    interval = TURN_KEEPALIVE_SECONDS if keepalive_seconds is None else keepalive_seconds
    main_loop = asyncio.get_running_loop()
    queue: asyncio.Queue[TurnEvent | None] = asyncio.Queue()
    ready: Future[tuple[asyncio.AbstractEventLoop, asyncio.Task[None]]] = Future()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="session-turn")

    async def forward() -> None:
        task = cast("asyncio.Task[None]", asyncio.current_task())
        ready.set_result((asyncio.get_running_loop(), task))
        async with aclosing(service.stream_turn(session_id, content)) as events:
            async for event in events:
                main_loop.call_soon_threadsafe(queue.put_nowait, event)

    def run() -> None:
        try:
            asyncio.run(forward())
        except asyncio.CancelledError:
            pass
        finally:
            main_loop.call_soon_threadsafe(queue.put_nowait, None)

    worker = executor.submit(run)
    try:
        while True:
            try:
                async with asyncio.timeout(interval):
                    event = await queue.get()
            except TimeoutError:
                yield Keepalive()
                continue
            if event is None:
                break
            yield event
        await asyncio.wrap_future(worker)
    finally:
        with CancelScope(shield=True):
            try:
                worker_loop, worker_task = await asyncio.shield(asyncio.wrap_future(ready))
                if not worker_task.done():
                    worker_loop.call_soon_threadsafe(worker_task.cancel)
                await asyncio.shield(asyncio.wrap_future(worker))
            finally:
                executor.shutdown(wait=False)
