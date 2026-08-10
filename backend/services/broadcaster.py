"""The single source of streamed metrics.

One background task computes a snapshot per tick and fans it out to every
connected socket, so a hundred viewers cost the same one query per tick as a
single viewer does. Clients trigger exactly one query of their own — the
snapshot they receive on connect — and are fed by the broadcaster after that.

Ticks with no listeners skip the database entirely, so an idle server is silent.
"""

import asyncio
import logging
import random
from collections.abc import Mapping
from typing import Any

from fastapi import WebSocket
from sqlalchemy.orm import Session, sessionmaker

from db import SessionLocal
from db.metrics import MetricsPayload, compute_metrics

logger = logging.getLogger(__name__)

# Bound on the "live motion" applied to the in-house guest count, in guests.
_MAX_GUEST_JITTER = 3


class ConnectionManager:
    """Tracks live WebSocket connections and fans a payload out to all of them."""

    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.append(websocket)
        logger.info("Client connected (%d active)", self.connection_count)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self._connections:
            self._connections.remove(websocket)
            logger.info("Client disconnected (%d active)", self.connection_count)

    async def broadcast(self, message: Mapping[str, Any]) -> None:
        """Send ``message`` to every client, dropping any that fail."""
        # Iterate over a snapshot so a failed send that prunes the connection
        # can't mutate the list mid-iteration.
        for connection in list(self._connections):
            try:
                await connection.send_json(message)
            except Exception:
                logger.warning("Dropping client after a failed send", exc_info=True)
                self.disconnect(connection)


# Process-wide singleton: the WebSocket router registers clients on it and the
# broadcast task started in the app lifespan feeds them.
manager = ConnectionManager()


def live_metrics(db: Session) -> MetricsPayload:
    """Real metrics with a touch of live motion on the in-house guest count.

    The jitter is bounded and applied only to ``guestsInHouse`` — the one number
    that genuinely drifts through the day as guests come and go. Every other
    value (occupancy, ADR, RevPAR, room counts) stays exactly as recorded, so a
    booking created via the API moves them and nothing else does.
    """
    metrics = compute_metrics(db)
    base = metrics["guestsInHouse"]
    if base > 0:
        jitter = random.randint(-min(_MAX_GUEST_JITTER, base), _MAX_GUEST_JITTER)
        metrics["guestsInHouse"] = max(0, base + jitter)
    return metrics


async def broadcast_tick(
    clients: ConnectionManager, session_factory: sessionmaker[Session] = SessionLocal
) -> bool:
    """Compute one snapshot and push it to every client.

    Returns ``False`` without querying when nobody is listening. This is the
    function that makes N clients cost O(1) queries: it runs once per tick, not
    once per client.
    """
    if clients.connection_count == 0:
        return False

    with session_factory() as db:
        payload = live_metrics(db)
    await clients.broadcast(payload)
    return True


async def run_metrics_broadcaster(
    clients: ConnectionManager,
    interval_seconds: float,
    session_factory: sessionmaker[Session] = SessionLocal,
) -> None:
    """Broadcast a snapshot every ``interval_seconds`` until cancelled."""
    logger.info("Metrics broadcaster started (every %.1fs)", interval_seconds)
    try:
        while True:
            await asyncio.sleep(interval_seconds)
            try:
                await broadcast_tick(clients, session_factory)
            except Exception:
                # A transient DB error must not kill the stream for everyone;
                # log it and try again on the next tick.
                logger.exception("Metrics broadcast tick failed, continuing")
    except asyncio.CancelledError:
        logger.info("Metrics broadcaster stopped")
        raise
