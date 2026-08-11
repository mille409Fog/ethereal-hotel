"""FastAPI application for the EtherealHotel real-time dashboard.

Wiring only: build the app, install middleware, mount the routers and run the
shared metrics broadcaster for the lifetime of the process. Endpoints live in
``routers/``, business rules in ``services/``, and the numbers themselves are
**derived from real records** (rooms, guests, bookings) by ``db.metrics``.

The app is built by :func:`create_app` so the same wiring serves both targets:
a long-lived server (``backend/Dockerfile``, ``python main.py``) and the
serverless deployment in ``api/index.py``, which has no process to hold a
socket open in. See "Deployment" in ``README.md``.
"""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from db import init_db
from routers import bookings, health, metrics, reference, stream
from services.broadcaster import manager, run_metrics_broadcaster

config.configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Ensure the schema, seed an empty DB, and run one shared broadcast task.

    That task is the only thing polling the database on a timer, so N connected
    viewers cost the same as one. Code before ``yield`` runs at startup, code
    after it runs at shutdown.
    """
    from db.seed import seed_if_empty  # imported lazily: pulls in Faker

    init_db()
    seed_if_empty()
    broadcaster = asyncio.create_task(
        run_metrics_broadcaster(manager, config.BROADCAST_INTERVAL_SECONDS)
    )
    logger.info("EtherealHotel Dashboard API started (log level %s)", config.LOG_LEVEL)

    yield

    broadcaster.cancel()
    with suppress(asyncio.CancelledError):
        await broadcaster
    logger.info("Shutting down EtherealHotel Dashboard API")


def create_app(*, live_stream: bool = True) -> FastAPI:
    """Build the API.

    ``live_stream`` toggles everything that needs a long-lived process: the
    ``/ws`` endpoint, the background broadcaster that feeds it, and the startup
    seeding that runs alongside them. Serverless deployments pass ``False`` and
    seed at import time instead, because a function invocation has no lifespan
    worth the name — see ``api/index.py``.

    The REST surface is identical either way. Dropping the socket costs the
    dashboard its push updates, not its data.
    """
    app = FastAPI(
        title="EtherealHotel Dashboard API",
        description="Real-time hotel dashboard backend, powered by real records.",
        version=config.API_VERSION,
        lifespan=lifespan if live_stream else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    routers = [
        health.build_router(live_stream=live_stream),
        metrics.router,
        bookings.router,
        reference.router,
    ]
    if live_stream:
        routers.append(stream.router)

    for router in routers:
        app.include_router(router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=config.LOG_LEVEL.lower(),
    )
