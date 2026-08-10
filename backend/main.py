"""FastAPI application for the EtherealHotel real-time dashboard.

Wiring only: build the app, install middleware, mount the routers and run the
shared metrics broadcaster for the lifetime of the process. Endpoints live in
``routers/``, business rules in ``services/``, and the numbers themselves are
**derived from real records** (rooms, guests, bookings) by ``db.metrics``.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
from db import init_db
from routers import bookings, health, metrics, stream
from services.broadcaster import manager, run_metrics_broadcaster

config.configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    try:
        await broadcaster
    except asyncio.CancelledError:
        pass
    logger.info("Shutting down EtherealHotel Dashboard API")


app = FastAPI(
    title="EtherealHotel Dashboard API",
    description="Real-time hotel dashboard backend, powered by real records.",
    version=config.API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for _router in (health.router, metrics.router, bookings.router, stream.router):
    app.include_router(_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=config.LOG_LEVEL.lower(),
    )
