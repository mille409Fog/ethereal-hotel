"""Read-only reference data: the rooms and guests a booking can point at.

Deliberately not a CRUD resource. The booking form needs to offer real choices
instead of asking a visitor to guess primary keys, and that is the whole
requirement — so there is no create/update/delete here, and no pagination,
because the seeded hotel is sixty rooms rather than sixty thousand. An endpoint
nobody calls is a surface that still has to be tested, documented and kept
correct, so these two return everything and stop.

Both orderings are total. ``list_bookings`` explains why that matters for
paging; here it matters for the select elements the frontend builds, which
would otherwise reshuffle between reads for no reason a user could see.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from db import Guest, Room


def list_rooms(db: Session) -> list[Room]:
    """Every room, ordered by room number."""
    return list(db.scalars(select(Room).order_by(Room.number, Room.id)))


def list_guests(db: Session) -> list[Guest]:
    """Every guest, ordered by name."""
    return list(
        db.scalars(select(Guest).order_by(Guest.last_name, Guest.first_name, Guest.id))
    )
