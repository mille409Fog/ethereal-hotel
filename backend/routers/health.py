"""Health check / API discovery endpoint."""

from fastapi import APIRouter

from config import API_VERSION


def build_router(*, live_stream: bool) -> APIRouter:
    """Build the health router for a deployment that may or may not stream.

    Mounted at **two** paths because the two deployments disagree about who owns
    ``/``. The standalone server is alone on its origin, so ``/`` is the natural
    health check. On Vercel the Angular app owns ``/`` and the API is only
    reachable beneath ``/api``, so the same handler answers at ``/api/health``
    too. One handler, two mounts, rather than a second endpoint that could drift.

    ``live_stream`` decides whether the advertised surface includes ``/ws``.
    A serverless deployment cannot hold a socket open, and advertising one it
    does not serve is exactly how a client ends up retrying a connection that
    will never succeed.
    """
    router = APIRouter(tags=["health"])

    @router.get("/")
    @router.get("/api/health")
    async def root() -> dict[str, object]:
        """Health check endpoint, also advertising the API surface."""
        endpoints: dict[str, str] = {
            "metrics": "/api/metrics",
            "dashboard": "/api/dashboard",
            "bookings": "/api/bookings",
            "rooms": "/api/rooms",
            "guests": "/api/guests",
        }
        if live_stream:
            endpoints["websocket"] = "/ws"

        return {
            "status": "online",
            "service": "EtherealHotel Dashboard API",
            "version": API_VERSION,
            # The frontend picks its transport off this flag rather than
            # discovering the absence of a socket by failing to open one.
            "liveStream": live_stream,
            "endpoints": endpoints,
        }

    return router
