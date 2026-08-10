"""Health check / API discovery endpoint."""

from fastapi import APIRouter

from config import API_VERSION

router = APIRouter(tags=["health"])


@router.get("/")
async def root() -> dict:
    """Health check endpoint, also advertising the API surface."""
    return {
        "status": "online",
        "service": "EtherealHotel Dashboard API",
        "version": API_VERSION,
        "endpoints": {
            "metrics": "/api/metrics",
            "dashboard": "/api/dashboard",
            "bookings": "/api/bookings",
            "websocket": "/ws",
        },
    }
