"""Pydantic request/response models — the wire contract of the API.

Field names are camelCase on the metrics payloads because the Angular frontend
consumes them directly as its ``IMetrics`` interface; the booking models use
snake_case to match the ORM columns they mirror.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict

from db import BookingStatus, RoomStatus, RoomType


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


class BookingErrorDetail(BaseModel):
    """The ``detail`` a rejected booking carries.

    An object rather than the bare string FastAPI defaults to, because a client
    that only receives prose has to parse it to know *which input* was wrong —
    and a form that cannot answer that renders the failure as a detached banner
    instead of next to the field. ``field`` is the request field name, or null
    when the violation is about the booking as a whole.
    """

    message: str
    field: str | None = None


class RoomOut(BaseModel):
    """A room, as the booking form offers it."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str
    room_type: RoomType
    floor: int
    capacity: int
    base_rate: float
    status: RoomStatus


class GuestOut(BaseModel):
    """A guest, reduced to what a booking form needs to name one.

    Email, phone, country and creation date are all on the ORM model and none
    of them are here: this list is served unauthenticated to anyone who opens
    the demo, and a directory of contactable people is not what a "pick a
    guest" dropdown needs to be.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
