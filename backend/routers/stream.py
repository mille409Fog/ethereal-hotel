"""WebSocket endpoint for the live metrics stream."""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from db import SessionLocal
from services.broadcaster import live_metrics, manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stream"])


@router.websocket("/ws")
async def metrics_stream(websocket: WebSocket) -> None:
    """Subscribe to the shared metrics broadcast.

    The client gets one snapshot immediately so the dashboard renders without
    waiting out a tick. After that it is fed by the single background
    broadcaster — this handler holds the socket open and does no polling of its
    own, which is what keeps N viewers at one query per tick rather than N.
    """
    await manager.connect(websocket)
    try:
        with SessionLocal() as db:
            await websocket.send_json(live_metrics(db))

        while True:
            # Nothing is expected from the client; this parks the handler until
            # the socket closes, which surfaces as WebSocketDisconnect.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:  # noqa: BLE001
        logger.exception("WebSocket stream failed")
        manager.disconnect(websocket)
