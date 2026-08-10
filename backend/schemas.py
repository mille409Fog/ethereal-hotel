"""Pydantic request/response models — the wire contract of the API.

Field names are camelCase on the metrics payloads because the Angular frontend
consumes them directly as its ``IMetrics`` interface; the booking models use
snake_case to match the ORM columns they mirror.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict

from db import BookingStatus


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
    model_config = ConfigDict(from_attributes=True)

    id: int
    guest_id: int
    room_id: int
    check_in: date
    check_out: date
    adults: int
    children: int
    nightly_rate: float
    status: BookingStatus


class BookingPage(BaseModel):
    """One page of bookings plus the total matching the filter.

    ``total`` is the count *before* limit/offset, so a client can render page
    counts without walking the whole collection.
    """

    items: list[BookingOut]
    total: int
    limit: int
    offset: int
