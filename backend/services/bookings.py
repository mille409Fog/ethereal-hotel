"""Booking rules, lifted out of the route handlers.

These functions raise :class:`BookingError` subclasses for domain failures. The
router owns the mapping from those to HTTP status codes, so this module stays
free of framework imports and can be exercised with a bare session.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db import Booking, BookingStatus, Guest, Room
from schemas import BookingCreate

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


class BookingError(Exception):
    """Base class for booking rule violations.

    ``field`` names the request field the violation belongs to, or is None when
    the failure is about the booking as a whole. It is part of the domain model
    rather than something the router infers from the message, because inferring
    it would mean matching on prose — and prose is the one part of an error a
    person is free to reword.

    What it buys: a client can put the message beside the input that caused it.
    See ``BookingErrorDetail`` in ``schemas`` for how it reaches the wire.
    """

    field: str | None = None


class InvalidBookingDates(BookingError):
    """The requested stay does not describe at least one night."""

    field = "check_out"


class ReferenceNotFound(BookingError):
    """The booking refers to a guest or room that does not exist."""

    def __init__(self, message: str, *, field: str) -> None:
        super().__init__(message)
        # Per-instance: the same rule fails on two different inputs.
        self.field = field


class BookingNotFound(BookingError):
    """No booking exists with the requested id.

    No ``field``: the id came from the path, not from a form the caller is
    holding open, so there is nothing to attribute it to.
    """


def list_bookings(
    db: Session,
    *,
    limit: int = DEFAULT_PAGE_SIZE,
    offset: int = 0,
    status: BookingStatus | None = None,
) -> tuple[list[Booking], int]:
    """Return one page of bookings and the total matching the filter.

    Ordered newest stay first and tie-broken on id so paging is stable: without
    a total ordering, rows can repeat or vanish across pages.
    """
    filters = [Booking.status == status] if status is not None else []

    total = db.scalar(select(func.count()).select_from(Booking).where(*filters)) or 0
    rows = db.scalars(
        select(Booking)
        .where(*filters)
        .order_by(Booking.check_in.desc(), Booking.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(rows), int(total)


def create_booking(db: Session, payload: BookingCreate) -> Booking:
    """Create a booking. Immediately affects the derived metrics."""
    if payload.check_out <= payload.check_in:
        raise InvalidBookingDates("check_out must be after check_in")
    if not db.get(Guest, payload.guest_id):
        raise ReferenceNotFound(f"Guest {payload.guest_id} not found", field="guest_id")

    room = db.get(Room, payload.room_id)
    if not room:
        raise ReferenceNotFound(f"Room {payload.room_id} not found", field="room_id")

    booking = Booking(
        guest_id=payload.guest_id,
        room_id=payload.room_id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        adults=payload.adults,
        children=payload.children,
        # The rate is locked in at booking time; default it to the room's list
        # price when the caller doesn't name one.
        nightly_rate=(
            payload.nightly_rate if payload.nightly_rate is not None else room.base_rate
        ),
        status=payload.status,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def delete_booking(db: Session, booking_id: int) -> None:
    """Delete a booking. Immediately affects the derived metrics."""
    booking = db.get(Booking, booking_id)
    if not booking:
        raise BookingNotFound(f"Booking {booking_id} not found")
    db.delete(booking)
    db.commit()
