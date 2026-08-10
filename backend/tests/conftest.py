"""Shared pytest fixtures for the backend suite.

Every test runs against an **isolated, throwaway SQLite database** seeded with a
small, deterministic dataset so the derived metrics are exact and predictable —
no dependency on the developer's real ``ethereal_hotel.db`` and no RNG.
"""

import os
import sys
import tempfile
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# Make the backend package root importable (``import db``, ``import main``) and
# point the app at a disposable database *before* anything imports the db layer,
# since the engine is created at import time from DATABASE_URL.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

_TEST_DB_PATH = Path(tempfile.gettempdir()) / "ethereal_hotel_test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"

from db import (  # noqa: E402  (import after DATABASE_URL is set)
    Base,
    Booking,
    BookingStatus,
    Guest,
    Room,
    RoomStatus,
    RoomType,
    SessionLocal,
    engine,
)

# ---------------------------------------------------------------------------
# Deterministic fixture dataset
# ---------------------------------------------------------------------------
# Relative to *today* so the "today" metrics (occupancy, arrivals, revenue) are
# non-trivial. Chosen so the expected numbers are easy to reason about:
#
#   Rooms:        3 operational + 1 maintenance  -> total=4, operational=3
#   In house now: booking A (room 101, 3 guests) + booking B (room 102, 1 guest)
#   Arrivals:     booking B checks in today
#   Departures:   booking C checks out today (no longer in house)
#   Cancelled:    booking D is ignored everywhere
#
# Derived "today" metrics that fall out of this:
#   occupiedRooms=2, guestsInHouse=4, revenueToday=300, arrivalsToday=1,
#   departuresToday=1, operationalRooms=3, totalRooms=4, availableRooms=1,
#   occupancy=66.67, adr=150.0, revpar=100.0


def _seed_fixture(db: Session) -> None:
    today = date.today()

    rooms = [
        Room(
            number="101",
            room_type=RoomType.STANDARD,
            floor=1,
            capacity=3,
            base_rate=100.0,
            status=RoomStatus.OPERATIONAL,
        ),
        Room(
            number="102",
            room_type=RoomType.STANDARD,
            floor=1,
            capacity=3,
            base_rate=200.0,
            status=RoomStatus.OPERATIONAL,
        ),
        Room(
            number="103",
            room_type=RoomType.DELUXE,
            floor=1,
            capacity=4,
            base_rate=300.0,
            status=RoomStatus.OPERATIONAL,
        ),
        Room(
            number="201",
            room_type=RoomType.SUITE,
            floor=2,
            capacity=4,
            base_rate=400.0,
            status=RoomStatus.MAINTENANCE,
        ),
    ]
    db.add_all(rooms)

    guests = [
        Guest(first_name="Ada", last_name="Lovelace", email="ada@example.com"),
        Guest(first_name="Alan", last_name="Turing", email="alan@example.com"),
    ]
    db.add_all(guests)
    db.commit()

    room_a, room_b, room_c, _room_maint = rooms
    ada, alan = guests

    db.add_all(
        [
            # A: in house now (spans today), no arrival/departure today.
            Booking(
                guest_id=ada.id,
                room_id=room_a.id,
                check_in=today - timedelta(days=2),
                check_out=today + timedelta(days=2),
                status=BookingStatus.CHECKED_IN,
                adults=2,
                children=1,
                nightly_rate=100.0,
            ),
            # B: arrives today and is in house.
            Booking(
                guest_id=alan.id,
                room_id=room_b.id,
                check_in=today,
                check_out=today + timedelta(days=3),
                status=BookingStatus.CHECKED_IN,
                adults=1,
                children=0,
                nightly_rate=200.0,
            ),
            # C: departs today -> counted as a departure, not in house.
            Booking(
                guest_id=ada.id,
                room_id=room_c.id,
                check_in=today - timedelta(days=3),
                check_out=today,
                status=BookingStatus.CHECKED_OUT,
                adults=2,
                children=0,
                nightly_rate=300.0,
            ),
            # D: cancelled future booking -> ignored in every metric.
            Booking(
                guest_id=alan.id,
                room_id=room_a.id,
                check_in=today + timedelta(days=5),
                check_out=today + timedelta(days=7),
                status=BookingStatus.CANCELLED,
                adults=1,
                children=0,
                nightly_rate=100.0,
            ),
        ]
    )
    db.commit()


@pytest.fixture()
def db_session() -> Iterator[Session]:
    """A fresh, seeded database session for one test.

    The schema is dropped and recreated per test so state never leaks between
    tests and the seeded metrics stay exact.
    """
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        _seed_fixture(session)
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    """A FastAPI TestClient backed by the seeded database.

    Constructed without the ``with`` context manager on purpose: that keeps the
    app's startup event (which would auto-seed the DB) from firing, so the
    deterministic fixture data is what the endpoints see.
    """
    # Imported lazily: importing main builds the engine, which must happen
    # after DATABASE_URL is repointed at the throwaway database above.
    from main import app

    return TestClient(app)
