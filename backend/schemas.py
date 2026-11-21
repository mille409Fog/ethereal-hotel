"""Pydantic request/response models — the wire contract of the API.

Field names are camelCase on the metrics payloads because the Angular frontend
consumes them directly as its ``IMetrics`` interface; the booking models use
snake_case to match the ORM columns they mirror. ``IceCandidate`` is camelCase
because its keys are the browser's ``RTCIceCandidateInit``.
"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

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


# ---------------------------------------------------------------------------
# /switchboard — request bodies only. Responses are the exact bytes
# ``services.switchboard`` wrote, because their length is part of the count, so
# no response model may re-serialise them.
# ---------------------------------------------------------------------------

# A data-channel-only SDP is well under 1 KB; this leaves room for a browser's
# extra attributes and refuses anything that is not a session description.
MAX_SDP_LENGTH = 8192


class SwitchboardErrorDetail(BookingErrorDetail):
    """The same ``{ message, field }`` shape, named for the route it serves."""


class PairingOffer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offer: str = Field(min_length=1, max_length=MAX_SDP_LENGTH)


class PairingAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sdp: str = Field(min_length=1, max_length=MAX_SDP_LENGTH)


class IceCandidate(BaseModel):
    """What ``RTCIceCandidate.toJSON()`` produces, and nothing more.

    The keys are the browser's, because the other device hands this object
    straight to ``addIceCandidate``. ``extra="forbid"`` keeps the relay from
    carrying anything that is not a candidate. An empty ``candidate`` is the
    browser's end-of-candidates marker, so it is allowed.
    """

    model_config = ConfigDict(extra="forbid")

    candidate: str = Field(max_length=1024)
    sdpMid: str | None = Field(default=None, max_length=64)
    sdpMLineIndex: int | None = Field(default=None, ge=0, le=64)
    usernameFragment: str | None = Field(default=None, max_length=256)
