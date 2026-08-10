"""Derive dashboard metrics from real hotel records.

Every value returned here comes from querying ``Room``/``Guest``/``Booking``
rows — there is no RNG. Adding or removing a booking changes these numbers.
"""

from datetime import date, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from .models import Booking, BookingStatus, Room, RoomStatus


def _spanning_today(on_day: date):
    """Filter for non-cancelled bookings that occupy a room on ``on_day``."""
    return and_(
        Booking.status != BookingStatus.CANCELLED,
        Booking.check_in <= on_day,
        Booking.check_out > on_day,
    )


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def compute_metrics(db: Session, on_day: date | None = None) -> dict:
    """Compute the point-in-time dashboard metrics for ``on_day`` (default today).

    Every field is a hotel-domain quantity a hotelier would recognise:
    occupancy, ADR, RevPAR, arrivals/departures and room counts.
    """
    on_day = on_day or date.today()

    total_rooms = db.scalar(select(func.count()).select_from(Room)) or 0
    operational_rooms = (
        db.scalar(
            select(func.count()).select_from(Room).where(
                Room.status == RoomStatus.OPERATIONAL
            )
        )
        or 0
    )

    spanning = _spanning_today(on_day)

    occupied_rooms = (
        db.scalar(
            select(func.count(func.distinct(Booking.room_id))).where(spanning)
        )
        or 0
    )
    guests_in_house = (
        db.scalar(
            select(func.coalesce(func.sum(Booking.adults + Booking.children), 0)).where(
                spanning
            )
        )
        or 0
    )
    revenue_today = (
        db.scalar(
            select(func.coalesce(func.sum(Booking.nightly_rate), 0.0)).where(spanning)
        )
        or 0.0
    )
    arrivals_today = (
        db.scalar(
            select(func.count()).select_from(Booking).where(
                and_(
                    Booking.check_in == on_day,
                    Booking.status != BookingStatus.CANCELLED,
                )
            )
        )
        or 0
    )
    departures_today = (
        db.scalar(
            select(func.count()).select_from(Booking).where(
                and_(
                    Booking.check_out == on_day,
                    Booking.status != BookingStatus.CANCELLED,
                )
            )
        )
        or 0
    )

    # Occupancy is measured against sellable (operational) rooms — rooms out of
    # service are excluded from the denominator, as the industry defines it.
    occupancy_pct = (occupied_rooms / operational_rooms * 100) if operational_rooms else 0.0
    available_rooms = max(operational_rooms - occupied_rooms, 0)
    adr = (revenue_today / occupied_rooms) if occupied_rooms else 0.0
    revpar = (revenue_today / operational_rooms) if operational_rooms else 0.0

    return {
        "timestamp": _now_iso(),
        "occupancy": _round(occupancy_pct),
        "guestsInHouse": int(guests_in_house),
        "revenueToday": _round(revenue_today),
        "arrivalsToday": int(arrivals_today),
        "departuresToday": int(departures_today),
        "occupiedRooms": int(occupied_rooms),
        "availableRooms": int(available_rooms),
        "operationalRooms": int(operational_rooms),
        "totalRooms": int(total_rooms),
        "adr": _round(adr),
        "revpar": _round(revpar),
    }


def _daily_series(db: Session, days: int, value: str) -> list[dict]:
    """Build a ``{timestamp, value}`` series over the last ``days`` days.

    ``value`` is either ``"guests"`` (guests in house that day) or
    ``"revenue"`` (room revenue recognised that day).
    """
    today = date.today()
    series: list[dict] = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        spanning = _spanning_today(day)
        if value == "revenue":
            point = (
                db.scalar(
                    select(func.coalesce(func.sum(Booking.nightly_rate), 0.0)).where(
                        spanning
                    )
                )
                or 0.0
            )
        else:  # guests
            point = (
                db.scalar(
                    select(
                        func.coalesce(func.sum(Booking.adults + Booking.children), 0)
                    ).where(spanning)
                )
                or 0
            )
        series.append({"timestamp": day.isoformat(), "value": _round(point)})
    return series


def compute_dashboard(db: Session, history_days: int = 20) -> dict:
    """Compute the full dashboard payload: metrics + derived historical series."""
    return {
        "metrics": compute_metrics(db),
        "historicalGuests": _daily_series(db, history_days, "guests"),
        "historicalRevenue": _daily_series(db, history_days, "revenue"),
    }


def _now_iso() -> str:
    from datetime import datetime

    return datetime.now().isoformat()
