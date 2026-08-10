"""
FastAPI Backend for EtherealHotel Real-Time Dashboard

Serves WebSocket and REST endpoints for live hotel metrics. All dashboard
values are **derived from real records** (rooms, guests, bookings) in the
database — no RNG. Simulated "live motion" only jitters the in-house guest
count around the real value so the stream feels alive.
"""

import asyncio
import os
import random
from contextlib import asynccontextmanager
from datetime import date

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import Booking, BookingStatus, Guest, Room, SessionLocal, get_db, init_db
from db.metrics import compute_dashboard, compute_metrics


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class Metrics(BaseModel):
    """Point-in-time hotel metrics, derived from the database."""

    timestamp: str
    occupancy: float
    guestsInHouse: int
    revenueToday: float
    arrivalsToday: int
    departuresToday: int
    occupiedRooms: int
    availableRooms: int
    operationalRooms: int
    totalRooms: int
    adr: float
    revpar: float


class HistoricalData(BaseModel):
    timestamp: str
    value: float


class DashboardData(BaseModel):
    metrics: Metrics
    historicalGuests: list[HistoricalData]
    historicalRevenue: list[HistoricalData]


class BookingCreate(BaseModel):
    guest_id: int
    room_id: int
    check_in: date
    check_out: date
    adults: int = 1
    children: int = 0
    nightly_rate: float | None = None  # defaults to the room's base rate
    status: BookingStatus = BookingStatus.RESERVED


class BookingOut(BaseModel):
    id: int
    guest_id: int
    room_id: int
    check_in: date
    check_out: date
    adults: int
    children: int
    nightly_rate: float
    status: BookingStatus


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown handler.

    On startup: ensure the schema exists and seed once if the DB is empty.
    On shutdown: log a clean exit. Code before ``yield`` runs at startup,
    code after it runs at shutdown.
    """
    init_db()
    with SessionLocal() as db:
        if db.query(Room).count() == 0:
            print("Empty database detected — seeding sample data...")
            from db.seed import seed

            seed(reset=False)
    print("EtherealHotel Dashboard API started")
    print("WebSocket server ready at ws://localhost:8000/ws")
    print("REST API ready at http://localhost:8000")

    yield

    print("Shutting down EtherealHotel Dashboard API")


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="EtherealHotel Dashboard API",
    description="Real-time hotel dashboard backend, powered by real records.",
    version="2.0.0",
    lifespan=lifespan,
)

# Allowed CORS origins come from the ALLOWED_ORIGINS env var (comma-separated).
# Falls back to the local dev servers when the var is unset so local dev "just
# works". Set ALLOWED_ORIGINS in production, e.g.:
#   ALLOWED_ORIGINS=https://ethereal-hotel-pink.vercel.app
_DEFAULT_ORIGINS = (
    "http://localhost:4200,"  # Angular dev server
    "http://localhost:5173,"  # Vite alternative
    "http://127.0.0.1:4200,"
    "http://127.0.0.1:5173"
)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        # Iterate over a snapshot so a failed send that prunes the connection
        # can't mutate the list mid-iteration.
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:  # noqa: BLE001
                print(f"Error sending to client: {e}")
                self.disconnect(connection)


manager = ConnectionManager()


def _live_metrics(db: Session) -> dict:
    """Real metrics with a touch of live motion on the in-house guest count.

    The jitter is bounded and applied only to ``guestsInHouse`` — the one
    number that genuinely drifts through the day as guests come and go. Every
    other value (occupancy, ADR, RevPAR, room counts) stays exactly as recorded,
    so a booking created via the API moves them and nothing else does.
    """
    metrics = compute_metrics(db)
    base = metrics["guestsInHouse"]
    if base > 0:
        jitter = random.randint(-min(3, base), 3)
        metrics["guestsInHouse"] = max(0, base + jitter)
    return metrics


# ---------------------------------------------------------------------------
# REST endpoints
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "online",
        "service": "EtherealHotel Dashboard API",
        "version": "2.0.0",
        "endpoints": {
            "metrics": "/api/metrics",
            "dashboard": "/api/dashboard",
            "bookings": "/api/bookings",
            "websocket": "/ws",
        },
    }


@app.get("/api/metrics", response_model=Metrics)
async def get_metrics(db: Session = Depends(get_db)):
    """Current metrics snapshot, computed from the database."""
    return compute_metrics(db)


@app.get("/api/dashboard", response_model=DashboardData)
async def get_dashboard(db: Session = Depends(get_db)):
    """Complete dashboard data (metrics + historical series), from the database."""
    return compute_dashboard(db)


@app.post("/api/bookings", response_model=BookingOut, status_code=201)
async def create_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    """Create a booking. Immediately affects the derived metrics."""
    if payload.check_out <= payload.check_in:
        raise HTTPException(422, "check_out must be after check_in")
    if not db.get(Guest, payload.guest_id):
        raise HTTPException(404, f"Guest {payload.guest_id} not found")
    room = db.get(Room, payload.room_id)
    if not room:
        raise HTTPException(404, f"Room {payload.room_id} not found")

    booking = Booking(
        guest_id=payload.guest_id,
        room_id=payload.room_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        adults=payload.adults,
        children=payload.children,
        nightly_rate=payload.nightly_rate
        if payload.nightly_rate is not None
        else room.base_rate,
        status=payload.status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@app.delete("/api/bookings/{booking_id}", status_code=204)
async def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    """Delete a booking. Immediately affects the derived metrics."""
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(404, f"Booking {booking_id} not found")
    db.delete(booking)
    db.commit()
    return None


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Streams live metrics every 2 seconds, re-reading the DB each tick."""
    await manager.connect(websocket)
    try:
        while True:
            with SessionLocal() as db:
                metrics = _live_metrics(db)
            await websocket.send_json(metrics)
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:  # noqa: BLE001
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
