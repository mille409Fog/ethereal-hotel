"""ORM models for the hotel domain (Room, Guest, Booking) and /switchboard's Pairing."""

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class RoomType(enum.StrEnum):
    STANDARD = "standard"
    DELUXE = "deluxe"
    SUITE = "suite"
    PENTHOUSE = "penthouse"


class RoomStatus(enum.StrEnum):
    """Physical availability of a room, independent of bookings.

    ``OPERATIONAL`` rooms are sellable; ``MAINTENANCE`` rooms are temporarily
    out of service. This drives the "availability" metric.
    """

    OPERATIONAL = "operational"
    MAINTENANCE = "maintenance"


class BookingStatus(enum.StrEnum):
    RESERVED = "reserved"
    CHECKED_IN = "checked_in"
    CHECKED_OUT = "checked_out"
    CANCELLED = "cancelled"


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    room_type: Mapped[RoomType] = mapped_column(Enum(RoomType), nullable=False)
    floor: Mapped[int] = mapped_column(Integer, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    base_rate: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[RoomStatus] = mapped_column(
        Enum(RoomStatus), nullable=False, default=RoomStatus.OPERATIONAL
    )

    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="room", cascade="all, delete-orphan"
    )


class Guest(Base):
    __tablename__ = "guests"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="guest", cascade="all, delete-orphan"
    )

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    guest_id: Mapped[int] = mapped_column(
        ForeignKey("guests.id", ondelete="CASCADE"), index=True
    )
    room_id: Mapped[int] = mapped_column(
        ForeignKey("rooms.id", ondelete="CASCADE"), index=True
    )
    check_in: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[BookingStatus] = mapped_column(
        Enum(BookingStatus), nullable=False, default=BookingStatus.RESERVED, index=True
    )
    adults: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    children: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Nightly rate locked in at booking time (may differ from room.base_rate).
    nightly_rate: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    guest: Mapped["Guest"] = relationship(back_populates="bookings")
    room: Mapped["Room"] = relationship(back_populates="bookings")

    @property
    def nights(self) -> int:
        return max((self.check_out - self.check_in).days, 0)

    @property
    def total_guests(self) -> int:
        return self.adults + self.children


class Pairing(Base):
    """One introduction between two of a visitor's devices, for about two minutes.

    Not part of the hotel: it belongs to ``/switchboard`` (SWITCHBOARD.md), and
    ``services/switchboard.py`` owns every rule about it — expiry, single use,
    the cursor, and what ``relayed_bytes`` counts. The SDP and candidates carry
    IP addresses, which makes this the only personal data the site stores, so
    rows are deleted rather than archived.

    ``code`` is the primary key because it is only unique while a row lives:
    once a row is deleted its code may be issued again.
    """

    __tablename__ = "pairings"

    code: Mapped[str] = mapped_column(String(6), primary_key=True)
    offerer_token: Mapped[str] = mapped_column(String(64), nullable=False)
    answerer_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    offer: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Both sides' trickled ICE candidates, in arrival order, each tagged with
    # its side. One list rather than two, so the cursor is one integer.
    candidates: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    relayed_bytes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
