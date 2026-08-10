"""Prove the metrics stream costs O(1) database queries per tick.

The point of the shared broadcaster is that ten viewers on the live demo are not
ten identical queries every two seconds. These tests count the SQL actually
issued against the engine, so they fail if a per-client poll ever creeps back in.
"""

import asyncio
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from typing import Any, cast

from fastapi import WebSocket
from sqlalchemy import event
from sqlalchemy.orm import Session

from db import engine
from services.broadcaster import ConnectionManager, broadcast_tick


class FakeSocket:
    """A stand-in for a WebSocket that records what it was sent."""

    def __init__(self) -> None:
        self.received: list[Mapping[str, Any]] = []

    async def accept(self) -> None:
        pass

    async def send_json(self, message: Mapping[str, Any]) -> None:
        self.received.append(message)


class FailingSocket(FakeSocket):
    async def send_json(self, message: Mapping[str, Any]) -> None:
        raise ConnectionResetError("client vanished mid-send")


@contextmanager
def count_queries() -> Iterator[dict[str, int]]:
    """Count SQL statements executed on the shared engine inside the block."""
    counter = {"n": 0}

    def _on_execute(
        conn: Any,
        cursor: Any,
        statement: Any,
        parameters: Any,
        context: Any,
        executemany: Any,
    ) -> None:
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


def _manager_with(*sockets: FakeSocket) -> ConnectionManager:
    clients = ConnectionManager()
    for socket in sockets:
        # FakeSocket implements only the two methods the manager uses. The cast
        # states that intent to the type checker rather than widening
        # ConnectionManager's own signature to accommodate a test double.
        asyncio.run(clients.connect(cast(WebSocket, socket)))
    return clients


def test_query_count_per_tick_is_independent_of_client_count(
    db_session: Session,
) -> None:
    """One client and five clients must cost exactly the same number of queries."""
    one = _manager_with(FakeSocket())
    with count_queries() as single:
        assert asyncio.run(broadcast_tick(one)) is True

    many_sockets = [FakeSocket() for _ in range(5)]
    many = _manager_with(*many_sockets)
    with count_queries() as five:
        assert asyncio.run(broadcast_tick(many)) is True

    assert five["n"] == single["n"], (
        f"5 clients issued {five['n']} queries vs {single['n']} for 1 — "
        "the broadcast is polling per client again"
    )
    # ...and every one of them still got the snapshot.
    assert all(len(socket.received) == 1 for socket in many_sockets)


def test_all_clients_receive_the_same_snapshot(db_session: Session) -> None:
    sockets = [FakeSocket() for _ in range(3)]
    clients = _manager_with(*sockets)

    asyncio.run(broadcast_tick(clients))

    payloads = [socket.received[0] for socket in sockets]
    # A single computation fanned out, so the timestamps are identical — not
    # three independent reads that merely happen to agree.
    assert all(payload == payloads[0] for payload in payloads)
    assert payloads[0]["occupiedRooms"] == 2
    assert payloads[0]["revenueToday"] == 300.0


def test_idle_tick_does_not_touch_the_database(db_session: Session) -> None:
    """With nobody connected the broadcaster must issue no queries at all."""
    clients = ConnectionManager()

    with count_queries() as counter:
        assert asyncio.run(broadcast_tick(clients)) is False

    assert counter["n"] == 0


def test_a_failing_client_is_dropped_without_stopping_the_fan_out(
    db_session: Session,
) -> None:
    healthy_before, healthy_after = FakeSocket(), FakeSocket()
    clients = _manager_with(healthy_before, FailingSocket(), healthy_after)

    asyncio.run(broadcast_tick(clients))

    assert len(healthy_before.received) == 1
    assert len(healthy_after.received) == 1
    assert clients.connection_count == 2  # the broken one was pruned
