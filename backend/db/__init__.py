"""Database layer for the EtherealHotel backend.

Exposes the SQLAlchemy engine/session, ORM models, and the metric
functions that derive dashboard values from real rows.
"""

from .database import Base, SessionLocal, engine, get_db, init_db
from .models import Booking, BookingStatus, Guest, Room, RoomStatus, RoomType

__all__ = [
    "Base",
    "SessionLocal",
    "engine",
    "get_db",
    "init_db",
    "Booking",
    "BookingStatus",
    "Guest",
    "Room",
    "RoomStatus",
    "RoomType",
]
