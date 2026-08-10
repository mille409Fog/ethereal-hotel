"""Test the WebSocket metrics stream.

The ``/ws`` endpoint pushes a metrics snapshot immediately on connect (then
every 2s). We only need the first message to prove the stream works and is
wired to the real, seeded database.
"""

# Keys the frontend's IMetrics relies on from each streamed message.
_EXPECTED_KEYS = {
    "timestamp",
    "occupancy", "guestsInHouse", "revenueToday", "arrivalsToday",
    "departuresToday", "occupiedRooms", "availableRooms",
    "operationalRooms", "totalRooms", "adr", "revpar",
}

# The legacy generic-SaaS fields the dashboard used to render. They are gone
# from the contract; this guards against them creeping back.
_RETIRED_KEYS = {"activeUsers", "revenue", "requests", "uptime"}


def test_websocket_streams_a_metrics_message(client):
    with client.websocket_connect("/ws") as ws:
        message = ws.receive_json()

    assert _EXPECTED_KEYS.issubset(message.keys())
    assert _RETIRED_KEYS.isdisjoint(message.keys())

    # Values are derived from the seeded DB, not RNG.
    assert message["occupiedRooms"] == 2
    assert message["revenueToday"] == 300.0
    assert message["occupancy"] == 66.67
    assert message["adr"] == 150.0
    assert message["revpar"] == 100.0

    # guestsInHouse gets a small bounded "live motion" jitter around the real
    # in-house count (base 4 -> +/- up to 3), so it stays within [1, 7].
    assert 1 <= message["guestsInHouse"] <= 7
