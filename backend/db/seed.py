"""Seed the hotel database with realistic rooms, guests, and bookings.

Run as a module from the ``backend/`` directory:

    python -m db.seed            # seed only if empty
    python -m db.seed --reset    # wipe and reseed

Bookings are distributed around *today* so the derived dashboard metrics
(occupancy, arrivals today, revenue today, guests in house) are non-trivial.
"""

import argparse
import logging
import random
from datetime import date, timedelta

from faker import Faker

from .database import SessionLocal, engine, init_db
from .models import Booking, BookingStatus, Guest, Room, RoomStatus, RoomType

logger = logging.getLogger(__name__)

fake = Faker()

# Rooms per floor and the type/rate profile per floor band.
ROOM_TYPE_BY_FLOOR = {
    # floor: (type, base_rate, capacity)
    1: (RoomType.STANDARD, 149.0, 2),
    2: (RoomType.STANDARD, 159.0, 2),
    3: (RoomType.DELUXE, 229.0, 3),
    4: (RoomType.DELUXE, 249.0, 3),
    5: (RoomType.SUITE, 399.0, 4),
    6: (RoomType.PENTHOUSE, 899.0, 6),
}
ROOMS_PER_FLOOR = 12
PENTHOUSE_ROOMS = 4  # top floor is smaller

SEASONAL_MIN, SEASONAL_MAX = 0.85, 1.35  # nightly-rate multiplier vs base


def _clear(db) -> None:
    db.query(Booking).delete()
    db.query(Guest).delete()
    db.query(Room).delete()
    db.commit()


def _create_rooms(db) -> list[Room]:
    rooms: list[Room] = []
    for floor, (rtype, base_rate, capacity) in ROOM_TYPE_BY_FLOOR.items():
        count = PENTHOUSE_ROOMS if rtype == RoomType.PENTHOUSE else ROOMS_PER_FLOOR
        for n in range(1, count + 1):
            # A small share of rooms are out of service for maintenance.
            status = (
                RoomStatus.MAINTENANCE if random.random() < 0.03 else RoomStatus.OPERATIONAL
            )
            rooms.append(
                Room(
                    number=f"{floor}{n:02d}",
                    room_type=rtype,
                    floor=floor,
                    capacity=capacity,
                    base_rate=base_rate,
                    status=status,
                )
            )
    db.add_all(rooms)
    db.commit()
    return rooms


def _create_guests(db, count: int) -> list[Guest]:
    guests: list[Guest] = []
    seen_emails: set[str] = set()
    while len(guests) < count:
        first, last = fake.first_name(), fake.last_name()
        email = f"{first}.{last}.{random.randint(1, 9999)}@{fake.free_email_domain()}".lower()
        if email in seen_emails:
            continue
        seen_emails.add(email)
        guests.append(
            Guest(
                first_name=first,
                last_name=last,
                email=email,
                phone=fake.phone_number()[:40],
                country=fake.country()[:80],
            )
        )
    db.add_all(guests)
    db.commit()
    return guests


def _status_for(check_in: date, check_out: date, today: date) -> BookingStatus:
    if check_out <= today:
        return BookingStatus.CHECKED_OUT
    if check_in <= today < check_out:
        return BookingStatus.CHECKED_IN
    return BookingStatus.RESERVED


def _create_bookings(db, rooms: list[Room], guests: list[Guest]) -> int:
    today = date.today()
    window_start = today - timedelta(days=40)
    window_end = today + timedelta(days=35)
    created = 0

    for room in rooms:
        if room.status == RoomStatus.MAINTENANCE:
            # Maintenance rooms can still hold historical stays but no live ones.
            pass
        cursor = window_start
        while cursor < window_end:
            # Occasional gap (empty nights) between stays -> realistic occupancy.
            gap = random.choices([0, 1, 2, 4], weights=[55, 25, 12, 8])[0]
            cursor = cursor + timedelta(days=gap)
            if cursor >= window_end:
                break

            nights = random.choices([1, 2, 3, 4, 5, 7], weights=[20, 30, 22, 13, 8, 7])[0]
            check_in = cursor
            check_out = check_in + timedelta(days=nights)
            cursor = check_out

            status = _status_for(check_in, check_out, today)
            # A few reservations get cancelled.
            if status == BookingStatus.RESERVED and random.random() < 0.08:
                status = BookingStatus.CANCELLED

            seasonal = random.uniform(SEASONAL_MIN, SEASONAL_MAX)
            nightly_rate = round(room.base_rate * seasonal, 2)
            adults = random.randint(1, min(2, room.capacity))
            children = random.randint(0, max(0, room.capacity - adults)) if random.random() < 0.3 else 0

            db.add(
                Booking(
                    guest_id=random.choice(guests).id,
                    room_id=room.id,
                    check_in=check_in,
                    check_out=check_out,
                    status=status,
                    adults=adults,
                    children=children,
                    nightly_rate=nightly_rate,
                )
            )
            created += 1

    db.commit()
    return created


def seed_if_empty() -> None:
    """Seed only when there is nothing to show.

    Called on app startup so a fresh clone or a new deploy comes up with a
    populated dashboard instead of zeros; a no-op on every restart after that.
    """
    init_db()
    with SessionLocal() as db:
        if db.query(Room).count():
            return
    logger.info("Empty database detected, seeding sample data")
    seed(reset=False)


def seed(reset: bool = False) -> None:
    init_db()
    db = SessionLocal()
    try:
        existing = db.query(Room).count()
        if existing and not reset:
            logger.info(
                "Database already seeded (%d rooms). Use --reset to reseed.", existing
            )
            return
        if reset:
            logger.info("Clearing existing data")
            _clear(db)

        rooms = _create_rooms(db)
        logger.info("Created %d rooms", len(rooms))

        guests = _create_guests(db, count=140)
        logger.info("Created %d guests", len(guests))

        bookings = _create_bookings(db, rooms, guests)
        logger.info("Created %d bookings", bookings)

        # Quick sanity read so the operator sees live numbers immediately.
        from .metrics import compute_metrics

        m = compute_metrics(db)
        logger.info(
            "Seeded. Today's derived metrics: occupancy %s%%, %s guests in house, "
            "$%s revenue, %s arrivals, %s departures, ADR $%s, RevPAR $%s",
            m["occupancy"],
            m["guestsInHouse"],
            f"{m['revenueToday']:,.2f}",
            m["arrivalsToday"],
            m["departuresToday"],
            m["adr"],
            m["revpar"],
        )
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the EtherealHotel database.")
    parser.add_argument(
        "--reset", action="store_true", help="Wipe existing data before seeding."
    )
    args = parser.parse_args()
    # Run as a CLI: send this module's progress to the console. When `seed()` is
    # called from the app instead, the app's logging config already applies.
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # Seed with a fixed-ish seed for repeatable demos while keeping variety.
    random.seed()
    seed(reset=args.reset)
    engine.dispose()
