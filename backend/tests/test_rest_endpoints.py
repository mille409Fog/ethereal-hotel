"""Tests for the REST endpoints, driven off the seeded fixture database.

The expected numbers are derived from the dataset in ``conftest._seed_fixture``.
"""

from datetime import date, timedelta

from db import Booking, BookingStatus


def test_root_health(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "online"
    assert body["service"] == "EtherealHotel Dashboard API"
    # The health check advertises the API surface.
    assert set(body["endpoints"]) == {"metrics", "dashboard", "bookings", "websocket"}


def test_metrics_are_derived_from_the_database(client):
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    m = resp.json()

    # Hotel-domain fields (exact, from the seeded rows).
    assert m["totalRooms"] == 4
    assert m["operationalRooms"] == 3
    assert m["occupiedRooms"] == 2
    assert m["availableRooms"] == 1
    assert m["guestsInHouse"] == 4
    assert m["arrivalsToday"] == 1
    assert m["departuresToday"] == 1
    assert m["revenueToday"] == 300.0
    assert m["occupancy"] == 66.67
    assert m["adr"] == 150.0
    assert m["revpar"] == 100.0

    assert isinstance(m["timestamp"], str) and m["timestamp"]

    # The generic-SaaS fields the dashboard used to render are retired. Assert
    # their absence so they cannot quietly return alongside the domain ones.
    assert {"activeUsers", "revenue", "requests", "uptime"}.isdisjoint(m)


def test_dashboard_shape_and_series(client):
    resp = client.get("/api/dashboard")
    assert resp.status_code == 200
    data = resp.json()

    assert data["metrics"]["guestsInHouse"] == 4
    # Default history window is 20 days, ending today.
    assert len(data["historicalGuests"]) == 20
    assert len(data["historicalRevenue"]) == 20

    today_iso = date.today().isoformat()
    last_guests = data["historicalGuests"][-1]
    last_revenue = data["historicalRevenue"][-1]
    assert last_guests["timestamp"] == today_iso
    assert last_guests["value"] == 4  # guests in house today
    assert last_revenue["timestamp"] == today_iso
    assert last_revenue["value"] == 300.0  # room revenue recognised today


def test_create_booking_changes_metrics(client, db_session):
    before = client.get("/api/metrics").json()
    assert before["guestsInHouse"] == 4
    assert before["occupiedRooms"] == 2

    # Room 103 (id resolved via the DB) currently has no live stay; booking it
    # for today should raise occupancy, guests in house, arrivals and revenue.
    guest_id, room_id = _ids_for_free_room(db_session)
    today = date.today()

    resp = client.post(
        "/api/bookings",
        json={
            "guest_id": guest_id,
            "room_id": room_id,
            "check_in": today.isoformat(),
            "check_out": (today + timedelta(days=2)).isoformat(),
            "adults": 2,
            "children": 0,
        },
    )
    assert resp.status_code == 201
    created = resp.json()
    assert created["id"] > 0
    # Rate defaulted to the room's base rate (300.0 for room 103).
    assert created["nightly_rate"] == 300.0

    after = client.get("/api/metrics").json()
    assert after["guestsInHouse"] == before["guestsInHouse"] + 2
    assert after["occupiedRooms"] == before["occupiedRooms"] + 1
    assert after["arrivalsToday"] == before["arrivalsToday"] + 1
    assert after["revenueToday"] == before["revenueToday"] + 300.0


def test_create_booking_rejects_bad_dates(client, db_session):
    guest_id, room_id = _ids_for_free_room(db_session)
    today = date.today()
    resp = client.post(
        "/api/bookings",
        json={
            "guest_id": guest_id,
            "room_id": room_id,
            "check_in": today.isoformat(),
            "check_out": today.isoformat(),  # not after check_in
        },
    )
    assert resp.status_code == 422


def test_create_booking_unknown_guest_or_room(client, db_session):
    _, room_id = _ids_for_free_room(db_session)
    today = date.today()
    base = {
        "check_in": today.isoformat(),
        "check_out": (today + timedelta(days=1)).isoformat(),
    }

    resp = client.post("/api/bookings", json={**base, "guest_id": 9999, "room_id": room_id})
    assert resp.status_code == 404

    resp = client.post("/api/bookings", json={**base, "guest_id": _any_guest_id(db_session), "room_id": 9999})
    assert resp.status_code == 404


def test_delete_booking_changes_metrics(client, db_session):
    before = client.get("/api/metrics").json()

    # Delete the in-house stay for room 101 (3 guests).
    booking = (
        db_session.query(Booking)
        .filter(Booking.status == BookingStatus.CHECKED_IN, Booking.adults == 2, Booking.children == 1)
        .one()
    )
    resp = client.delete(f"/api/bookings/{booking.id}")
    assert resp.status_code == 204

    after = client.get("/api/metrics").json()
    assert after["guestsInHouse"] == before["guestsInHouse"] - 3
    assert after["occupiedRooms"] == before["occupiedRooms"] - 1


def test_delete_missing_booking_404(client):
    resp = client.delete("/api/bookings/999999")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/bookings — pagination and filtering
# ---------------------------------------------------------------------------
def test_list_bookings_returns_every_seeded_booking(client):
    resp = client.get("/api/bookings")
    assert resp.status_code == 200
    page = resp.json()

    # The fixture seeds four bookings (A, B, C in-house/departing, D cancelled).
    assert page["total"] == 4
    assert len(page["items"]) == 4
    assert page["offset"] == 0

    booking = page["items"][0]
    assert set(booking) == {
        "id", "guest_id", "room_id", "check_in", "check_out",
        "adults", "children", "nightly_rate", "status",
    }

    # Ordered newest stay first, so paging is stable.
    check_ins = [item["check_in"] for item in page["items"]]
    assert check_ins == sorted(check_ins, reverse=True)


def test_list_bookings_paginates(client):
    everything = client.get("/api/bookings").json()["items"]

    first = client.get("/api/bookings?limit=2&offset=0").json()
    second = client.get("/api/bookings?limit=2&offset=2").json()

    # total reports the full match count, not the size of the page.
    assert first["total"] == second["total"] == 4
    assert first["limit"] == 2 and second["offset"] == 2
    assert len(first["items"]) == 2
    assert len(second["items"]) == 2

    # The two pages partition the collection: no overlap, nothing missing.
    paged_ids = [item["id"] for item in first["items"] + second["items"]]
    assert paged_ids == [item["id"] for item in everything]
    assert len(set(paged_ids)) == 4


def test_list_bookings_filters_by_status(client):
    resp = client.get("/api/bookings?status=cancelled")
    assert resp.status_code == 200
    page = resp.json()

    # Exactly booking D from the fixture.
    assert page["total"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["status"] == "cancelled"

    checked_in = client.get("/api/bookings?status=checked_in").json()
    assert checked_in["total"] == 2
    assert {item["status"] for item in checked_in["items"]} == {"checked_in"}


def test_list_bookings_rejects_out_of_range_paging(client):
    assert client.get("/api/bookings?limit=0").status_code == 422
    assert client.get("/api/bookings?limit=9999").status_code == 422
    assert client.get("/api/bookings?offset=-1").status_code == 422
    assert client.get("/api/bookings?status=not_a_status").status_code == 422


def test_created_booking_appears_in_the_listing(client, db_session):
    guest_id, room_id = _ids_for_free_room(db_session)
    today = date.today()

    created = client.post(
        "/api/bookings",
        json={
            "guest_id": guest_id,
            "room_id": room_id,
            "check_in": today.isoformat(),
            "check_out": (today + timedelta(days=2)).isoformat(),
        },
    ).json()

    page = client.get("/api/bookings").json()
    assert page["total"] == 5
    assert created["id"] in [item["id"] for item in page["items"]]


# ---------------------------------------------------------------------------
# Small helpers to resolve fixture ids without hardcoding autoincrement values.
# ---------------------------------------------------------------------------
def _ids_for_free_room(db_session):
    """Return (guest_id, room_id) for an operational room with no live stay."""
    from db import Guest, Room

    room = db_session.query(Room).filter(Room.number == "103").one()
    guest = db_session.query(Guest).first()
    return guest.id, room.id


def _any_guest_id(db_session):
    from db import Guest

    return db_session.query(Guest).first().id
