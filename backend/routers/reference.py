"""Reference-data endpoints: the rooms and guests a booking may point at.

These exist so ``POST /api/bookings`` is usable by something other than curl.
``guest_id`` and ``room_id`` are foreign keys, and a form that asks a visitor
to type one is a form that cannot be demonstrated — so the client reads these
two lists and renders real choices.

Read-only by design; see ``services.reference`` for why there is no more here.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import get_db
from schemas import GuestOut, RoomOut
from services import reference as service

router = APIRouter(tags=["reference"])


@router.get("/api/rooms", response_model=list[RoomOut])
async def list_rooms(db: Session = Depends(get_db)) -> list[RoomOut]:
    """Every room, ordered by number."""
    return [RoomOut.model_validate(room) for room in service.list_rooms(db)]


@router.get("/api/guests", response_model=list[GuestOut])
async def list_guests(db: Session = Depends(get_db)) -> list[GuestOut]:
    """Every guest, ordered by name, reduced to id and display name."""
    return [GuestOut.model_validate(guest) for guest in service.list_guests(db)]
