"""Tests for the REST endpoints, driven off the seeded fixture database.

The expected numbers are derived from the dataset in ``conftest._seed_fixture``.
"""

from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db import Booking, BookingStatus


def test_root_health(client: TestClient) -> None:
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "online"
    assert body["service"] == "EtherealHotel Dashboard API"
    assert body["liveStream"] is True
    # The health check advertises the API surface.
    assert set(body["endpoints"]) == {
        "metrics",
        "dashboard",
        "bookings",
        "rooms",
        "guests",
        "websocket",
    }


def test_health_is_also_served_under_api(client: TestClient) -> None:
    """The Vercel deployment cannot use ``/`` — the Angular app owns it there.

    Both mounts have to stay reachable: the container deployment probes ``/``
    and the hosted demo probes ``/api/health``, and a change that moved the
    handler instead of adding to it would break exactly one of them.
    """
    assert client.get("/api/health").json() == client.get("/").json()


def test_serverless_app_hides_the_stream_it_cannot_serve() -> None:
    """A function deployment must not advertise a socket it has no process for.

    This is the contract ``api/index.py`` depends on, and the frontend reads the
    same absence from its own config. If ``create_app`` ever started mounting
    ``/ws`` unconditionally, the hosted demo would retry a connection forever.
    """
    from main import create_app

    # Kept as a local rather than reached through `TestClient.app`, which is
    # typed as the bare ASGI callable and so has no `.routes` to inspect.
    serverless_app = create_app(live_stream=False)
    serverless = TestClient(serverless_app)

    body = serverless.get("/api/health").json()
    assert body["liveStream"] is False
    assert "websocket" not in body["endpoints"]
    assert not any(
        getattr(route, "path", None) == "/ws" for route in serverless_app.routes
    )


def test_metrics_are_derived_from_the_database(client: TestClient) -> None:
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


def test_dashboard_shape_and_series(client: TestClient) -> None:
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


def test_create_booking_changes_metrics(
    client: TestClient, db_session: Session
) -> None:
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


def test_create_booking_rejects_bad_dates(
    client: TestClient, db_session: Session
) -> None:
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

    # Attributed to the input that was wrong, not just described. This is the
    # contract the booking form's field-level errors are built on: without the
    # `field`, a client can only render the message as a detached banner.
    detail = resp.json()["detail"]
    assert detail["field"] == "check_out"
    assert "check_out must be after check_in" in detail["message"]


def test_create_booking_unknown_guest_or_room(
    client: TestClient, db_session: Session
) -> None:
    _, room_id = _ids_for_free_room(db_session)
    today = date.today()
    base = {
        "check_in": today.isoformat(),
        "check_out": (today + timedelta(days=1)).isoformat(),
    }

    resp = client.post(
        "/api/bookings", json={**base, "guest_id": 9999, "room_id": room_id}
    )
    assert resp.status_code == 404
    # One rule, two inputs — so the attribution has to be per-instance rather
    # than a class attribute, and this is the test that says so.
    assert resp.json()["detail"]["field"] == "guest_id"

    resp = client.post(
        "/api/bookings",
        json={**base, "guest_id": _any_guest_id(db_session), "room_id": 9999},
    )
    assert resp.status_code == 404
    assert resp.json()["detail"]["field"] == "room_id"


def test_delete_missing_booking_has_no_field_to_blame(client: TestClient) -> None:
    """A path-parameter failure is not attributable to a form control.

    Asserted because the tempting shortcut — defaulting ``field`` to something
    non-null so clients never have to check — would have the frontend highlight
    an unrelated input on an error that has nothing to do with it.
    """
    detail = client.delete("/api/bookings/999999").json()["detail"]
    assert detail["field"] is None
    assert "999999" in detail["message"]


def test_delete_booking_changes_metrics(
    client: TestClient, db_session: Session
) -> None:
    before = client.get("/api/metrics").json()

    # Delete the in-house stay for room 101 (3 guests).
    booking = (
        db_session.query(Booking)
        .filter(
            Booking.status == BookingStatus.CHECKED_IN,
            Booking.adults == 2,
            Booking.children == 1,
        )
        .one()
    )
    resp = client.delete(f"/api/bookings/{booking.id}")
    assert resp.status_code == 204

    after = client.get("/api/metrics").json()
    assert after["guestsInHouse"] == before["guestsInHouse"] - 3
    assert after["occupiedRooms"] == before["occupiedRooms"] - 1


def test_delete_missing_booking_404(client: TestClient) -> None:
    resp = client.delete("/api/bookings/999999")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/bookings — pagination and filtering
# ---------------------------------------------------------------------------
def test_list_bookings_returns_every_seeded_booking(client: TestClient) -> None:
    resp = client.get("/api/bookings")
    assert resp.status_code == 200
    page = resp.json()

    # The fixture seeds four bookings (A, B, C in-house/departing, D cancelled).
    assert page["total"] == 4
    assert len(page["items"]) == 4
    assert page["offset"] == 0

    booking = page["items"][0]
    assert set(booking) == {
        "id",
        "guest_id",
        "room_id",
        "check_in",
        "check_out",
        "adults",
        "children",
        "nightly_rate",
        "status",
    }

    # Ordered newest stay first, so paging is stable.
    check_ins = [item["check_in"] for item in page["items"]]
    assert check_ins == sorted(check_ins, reverse=True)


def test_list_bookings_paginates(client: TestClient) -> None:
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


def test_list_bookings_filters_by_status(client: TestClient) -> None:
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


def test_list_bookings_rejects_out_of_range_paging(client: TestClient) -> None:
    assert client.get("/api/bookings?limit=0").status_code == 422
    assert client.get("/api/bookings?limit=9999").status_code == 422
    assert client.get("/api/bookings?offset=-1").status_code == 422
    assert client.get("/api/bookings?status=not_a_status").status_code == 422


def test_created_booking_appears_in_the_listing(
    client: TestClient, db_session: Session
) -> None:
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
# GET /api/rooms, GET /api/guests — the reference data the booking form offers
# ---------------------------------------------------------------------------
def test_list_rooms_returns_every_room_in_number_order(client: TestClient) -> None:
    resp = client.get("/api/rooms")
    assert resp.status_code == 200
    rooms = resp.json()

    # All four, including the one out for maintenance: the form shows it and
    # marks it unsellable rather than hiding inventory the hotel owns.
    assert [room["number"] for room in rooms] == ["101", "102", "103", "201"]
    assert [room["status"] for room in rooms] == [
        "operational",
        "operational",
        "operational",
        "maintenance",
    ]

    assert set(rooms[0]) == {
        "id",
        "number",
        "room_type",
        "floor",
        "capacity",
        "base_rate",
        "status",
    }
    assert rooms[2]["base_rate"] == 300.0
    assert rooms[2]["room_type"] == "deluxe"


def test_list_guests_returns_names_and_nothing_contactable(client: TestClient) -> None:
    resp = client.get("/api/guests")
    assert resp.status_code == 200
    guests = resp.json()

    # Ordered by surname: Lovelace before Turing.
    assert [guest["full_name"] for guest in guests] == ["Ada Lovelace", "Alan Turing"]

    # This list is served unauthenticated to anyone who opens the demo, so the
    # assertion that matters is about what is *absent*. Adding a field to
    # `GuestOut` for convenience should fail here first.
    assert set(guests[0]) == {"id", "full_name"}


def test_reference_ids_are_bookable(client: TestClient) -> None:
    """The two lists and the create endpoint agree about what an id is.

    The point of the reference endpoints is that a client can go straight from
    them to a booking. If ids were ever renumbered or exposed as something
    other than the foreign key, every value would still look plausible and the
    form would 404 on every submit.
    """
    room = next(
        room for room in client.get("/api/rooms").json() if room["number"] == "103"
    )
    guest = client.get("/api/guests").json()[0]
    today = date.today()

    resp = client.post(
        "/api/bookings",
        json={
            "guest_id": guest["id"],
            "room_id": room["id"],
            "check_in": today.isoformat(),
            "check_out": (today + timedelta(days=1)).isoformat(),
        },
    )
    assert resp.status_code == 201
    assert resp.json()["nightly_rate"] == room["base_rate"]


# ---------------------------------------------------------------------------
# Small helpers to resolve fixture ids without hardcoding autoincrement values.
# ---------------------------------------------------------------------------
def _ids_for_free_room(db_session: Session) -> tuple[int, int]:
    """Return (guest_id, room_id) for an operational room with no live stay."""
    from db import Guest, Room

    room = db_session.query(Room).filter(Room.number == "103").one()
    guest = db_session.query(Guest).first()
    assert guest is not None
    return guest.id, room.id


def _any_guest_id(db_session: Session) -> int:
    from db import Guest

    guest = db_session.query(Guest).first()
    assert guest is not None
    return guest.id
