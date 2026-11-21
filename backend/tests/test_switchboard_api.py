"""/switchboard over HTTP: the error contract, the rate limit, and the count.

The rules themselves are in ``test_switchboard.py``. These tests cover only
what the router can get wrong: the status and ``field`` of each refusal, the
per-address limit, and that the count measures the bytes that actually crossed
the wire rather than a re-serialisation of them.
"""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from httpx import Response

from routers.switchboard import CREATE_LIMIT, SlidingWindowLimiter, create_limiter

OFFER = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\n"
ANSWER = "v=0\r\no=- 7071136620437218221 2 IN IP4 127.0.0.1\r\ns=-\r\n"
CANDIDATE = {
    "candidate": "candidate:1 1 udp 2122260223 a1b2.local 54321 typ host",
    "sdpMid": "0",
    "sdpMLineIndex": 0,
    "usernameFragment": "f00d",
}


@pytest.fixture(autouse=True)
def fresh_limiter() -> Iterator[None]:
    """The limiter is process state; no test may inherit another's hits."""
    create_limiter.clear()
    yield
    create_limiter.clear()


def padded(payload: dict[str, Any]) -> bytes:
    """A body larger than its compact form, as a careless client might send.

    If the router counted a re-serialisation instead of the raw bytes, the
    totals below would come out short by exactly the padding.
    """
    return json.dumps(payload, indent=4).encode("utf-8")


def post(
    client: TestClient, url: str, body: bytes = b"", token: str | None = None
) -> Response:
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-Pairing-Token"] = token
    response: Response = client.post(url, content=body, headers=headers)
    return response


def test_the_count_is_the_bytes_that_crossed_the_wire(client: TestClient) -> None:
    sent = 0

    def relayed(request: bytes, response: Response, status: int = 200) -> Any:
        nonlocal sent
        assert response.status_code == status, response.text
        sent += len(request) + len(response.content)
        body = response.json()
        assert body["relayed_bytes"] == sent
        return body

    offer = padded({"offer": OFFER})
    created = relayed(offer, post(client, "/api/switchboard", offer), 201)
    code, offerer = created["code"], created["token"]
    assert created["state"] == "waiting"

    candidate = padded(CANDIDATE)
    relayed(
        candidate,
        post(client, f"/api/switchboard/{code}/candidates", candidate, offerer),
    )

    # Lowercase is the same code: the router normalises before it asks.
    joined = relayed(b"", post(client, f"/api/switchboard/{code.lower()}/join"))
    answerer = joined["token"]
    assert joined["offer"] == OFFER

    read = client.get(f"/api/switchboard/{code}", headers={"X-Pairing-Token": answerer})
    assert relayed(b"", read)["events"] == [
        {"kind": "candidate", "candidate": CANDIDATE}
    ]

    answer = padded({"sdp": ANSWER})
    relayed(answer, post(client, f"/api/switchboard/{code}/answer", answer, answerer))

    opened = post(client, f"/api/switchboard/{code}/open", token=offerer)
    assert opened.json() == {"state": "open", "relayed_bytes": sent}

    after = client.get(
        f"/api/switchboard/{code}", headers={"X-Pairing-Token": answerer}
    )
    assert after.status_code == 409
    assert after.json()["detail"]["field"] is None


def test_a_mistyped_code_comes_back_under_the_code_input(client: TestClient) -> None:
    # Well formed, but nobody issued it.
    missing = post(client, "/api/switchboard/ZZZZZ2/join")
    assert missing.status_code == 404
    assert missing.json()["detail"]["field"] == "code"

    # Cannot exist at all: an O, and one character short.
    for typo in ("ABCDO2", "ABCD2"):
        malformed = post(client, f"/api/switchboard/{typo}/join")
        assert malformed.status_code == 422
        detail = malformed.json()["detail"]
        assert detail["field"] == "code"
        assert detail["message"].startswith("A code is 6 characters")

    code = post(client, "/api/switchboard", padded({"offer": OFFER})).json()["code"]
    assert post(client, f"/api/switchboard/{code}/join").status_code == 200
    used = post(client, f"/api/switchboard/{code}/join")
    assert used.status_code == 409
    assert used.json()["detail"]["field"] == "code"


def test_only_a_device_holding_a_token_takes_part(client: TestClient) -> None:
    created = post(client, "/api/switchboard", padded({"offer": OFFER})).json()
    code = created["code"]

    for headers in ({}, {"X-Pairing-Token": "a-guess"}):
        refused = client.get(f"/api/switchboard/{code}", headers=headers)
        assert refused.status_code == 403
        assert refused.json()["detail"] == {
            "message": "This device is not part of that introduction",
            "field": None,
        }

    beyond = client.get(
        f"/api/switchboard/{code}",
        params={"cursor": 5},
        headers={"X-Pairing-Token": created["token"]},
    )
    assert beyond.status_code == 422
    assert beyond.json()["detail"]["field"] == "cursor"


def test_the_relay_carries_only_candidates(client: TestClient) -> None:
    created = post(client, "/api/switchboard", padded({"offer": OFFER})).json()
    smuggled = padded({**CANDIDATE, "note": "hello from the other device"})
    refused = post(
        client,
        f"/api/switchboard/{created['code']}/candidates",
        smuggled,
        created["token"],
    )
    assert refused.status_code == 422


def test_creation_is_rate_limited_per_address(client: TestClient) -> None:
    offer = padded({"offer": OFFER})
    for _ in range(CREATE_LIMIT):
        assert post(client, "/api/switchboard", offer).status_code == 201

    limited = post(client, "/api/switchboard", offer)
    assert limited.status_code == 429
    assert limited.json()["detail"]["field"] is None
    assert 1 <= int(limited.headers["Retry-After"]) <= 60

    elsewhere = client.post(
        "/api/switchboard",
        content=offer,
        headers={"Content-Type": "application/json", "X-Forwarded-For": "203.0.113.7"},
    )
    assert elsewhere.status_code == 201


def test_the_window_slides_rather_than_resetting() -> None:
    limiter = SlidingWindowLimiter(limit=2, window=60)
    assert limiter.wait("a", 0) is None
    assert limiter.wait("a", 30) is None
    assert limiter.wait("a", 45) == 15  # the hit at 0 leaves at 60
    assert limiter.wait("a", 60) is None
    assert limiter.wait("a", 61) == 29  # now the hit at 30 is the oldest
    assert limiter.wait("b", 61) is None
