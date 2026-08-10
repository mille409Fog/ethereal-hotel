"""Booking CRUD endpoints.

Each handler delegates to ``services.bookings`` and translates the domain
errors it raises into status codes via ``_STATUS_BY_ERROR``.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import BookingStatus, get_db
from schemas import BookingCreate, BookingOut, BookingPage
from services import bookings as service
from services.bookings import (
    BookingError,
    BookingNotFound,
    InvalidBookingDates,
    ReferenceNotFound,
)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

_STATUS_BY_ERROR: dict[type[BookingError], int] = {
    InvalidBookingDates: 422,
    ReferenceNotFound: 404,
    BookingNotFound: 404,
}


def _as_http(exc: BookingError) -> HTTPException:
    """Map a domain error to its HTTP equivalent (400 if unclassified)."""
    return HTTPException(_STATUS_BY_ERROR.get(type(exc), 400), str(exc))


@router.get("", response_model=BookingPage)
async def list_bookings(
    limit: int = Query(service.DEFAULT_PAGE_SIZE, ge=1, le=service.MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    status: BookingStatus | None = Query(None, description="Filter by booking status"),
    db: Session = Depends(get_db),
) -> BookingPage:
    """List bookings, newest stay first, with pagination and a status filter."""
    items, total = service.list_bookings(db, limit=limit, offset=offset, status=status)
    return BookingPage(
        items=[BookingOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(
    payload: BookingCreate, db: Session = Depends(get_db)
) -> BookingOut:
    """Create a booking. Immediately affects the derived metrics."""
    try:
        booking = service.create_booking(db, payload)
    except BookingError as exc:
        raise _as_http(exc) from exc
    return BookingOut.model_validate(booking)


@router.delete("/{booking_id}", status_code=204)
async def delete_booking(booking_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a booking. Immediately affects the derived metrics."""
    try:
        service.delete_booking(db, booking_id)
    except BookingError as exc:
        raise _as_http(exc) from exc
