"""The rules of /switchboard's introduction, against a bare session.

Expiry, single use and the cursor are what keep the server's part short; the
count is the route's thesis, so it is checked to the byte rather than roughly.
Every call names its own clock, so no test sleeps.
"""

import json
from datetime import datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from db import Pairing
from services import switchboard
from services.switchboard import (
    CODE_ALPHABET,
    CodeAlreadyUsed,
    CodeExpired,
    InvalidCursor,
    NotAParty,
    OutOfTurn,
    PairingClosed,
    PairingNotFound,
    Relayed,
)

T0 = datetime(2026, 11, 20, 12, 0, 0)
OFFER = "v=0\r\no=- 4611731400430051336 2 IN IP4 127.0.0.1\r\ns=-\r\n"
ANSWER = "v=0\r\no=- 7071136620437218221 2 IN IP4 127.0.0.1\r\ns=-\r\n"


def at(seconds: float) -> datetime:
    return T0 + timedelta(seconds=seconds)


def wire(payload: dict[str, Any]) -> int:
    """The size of a request body as a browser's fetch would send it."""
    return len(json.dumps(payload).encode("utf-8"))


def parsed(relayed: Relayed) -> dict[str, Any]:
    result: dict[str, Any] = json.loads(relayed.body)
    return result


def candidate(n: int) -> dict[str, str | int | None]:
    return {
        "candidate": f"candidate:{n} 1 udp 2122260223 {n}.local 5{n:04d} typ host",
        "sdpMid": "0",
        "sdpMLineIndex": 0,
    }


def open_introduction(db: Session, *, now: float = 0) -> tuple[str, str]:
    created = parsed(
        switchboard.create(db, OFFER, request_bytes=wire({"offer": OFFER}), now=at(now))
    )
    return created["code"], created["token"]


def joined_introduction(db: Session) -> tuple[str, str, str]:
    code, offerer = open_introduction(db)
    answerer = parsed(switchboard.join(db, code, request_bytes=0, now=at(1)))["token"]
    switchboard.answer(
        db, code, answerer, ANSWER, request_bytes=wire({"sdp": ANSWER}), now=at(2)
    )
    return code, offerer, answerer


def test_a_code_is_six_characters_from_the_alphabet_without_lookalikes(
    db_session: Session,
) -> None:
    assert len(CODE_ALPHABET) == 30
    assert not set(CODE_ALPHABET) & set("01ILOU")

    for _ in range(20):
        code, _token = open_introduction(db_session)
        assert len(code) == 6
        assert set(code) <= set(CODE_ALPHABET)


def test_a_code_can_be_joined_only_before_it_expires(db_session: Session) -> None:
    early, _ = open_introduction(db_session)
    switchboard.join(db_session, early, request_bytes=0, now=at(119.9))

    late, offerer = open_introduction(db_session)
    with pytest.raises(CodeExpired) as refused:
        switchboard.join(db_session, late, request_bytes=0, now=at(120))
    assert refused.value.field == "code"

    # The laptop polling an unjoined code learns why, not merely that it is gone.
    with pytest.raises(CodeExpired):
        switchboard.read(db_session, late, offerer, 0, now=at(120))


def test_rows_go_a_minute_after_the_code_expires_or_the_channel_opens(
    db_session: Session,
) -> None:
    waiting, _ = open_introduction(db_session)
    stalled, _, _ = joined_introduction(db_session)  # ICE never succeeds
    opened, offerer, _ = joined_introduction(db_session)
    switchboard.record_open(db_session, opened, offerer, now=at(10))

    def alive() -> set[str]:
        return {p.code for p in db_session.query(Pairing).all()}

    assert switchboard.expire(db_session, now=at(69.9)) == 0
    assert alive() == {waiting, stalled, opened}

    assert switchboard.expire(db_session, now=at(70)) == 1
    assert alive() == {waiting, stalled}

    assert switchboard.expire(db_session, now=at(179.9)) == 0
    assert switchboard.expire(db_session, now=at(180)) == 2
    assert alive() == set()

    # Past its deadline, a row is gone for every caller, swept or not.
    late, late_offerer = open_introduction(db_session, now=200)
    with pytest.raises(PairingNotFound):
        switchboard.read(db_session, late, late_offerer, 0, now=at(380))


def test_a_code_is_consumed_by_the_first_join(db_session: Session) -> None:
    code, offerer = open_introduction(db_session)
    first = parsed(switchboard.join(db_session, code, request_bytes=0, now=at(1)))
    assert first["offer"] == OFFER

    with pytest.raises(CodeAlreadyUsed) as refused:
        switchboard.join(db_session, code, request_bytes=0, now=at(2))
    assert refused.value.field == "code"

    # The second device got no token, and the first one's still works.
    switchboard.answer(
        db_session, code, first["token"], ANSWER, request_bytes=0, now=at(3)
    )
    assert parsed(switchboard.read(db_session, code, offerer, 0, now=at(4)))[
        "events"
    ] == [{"kind": "answer", "sdp": ANSWER}]


def test_a_read_returns_only_what_the_caller_has_not_seen(db_session: Session) -> None:
    code, offerer = open_introduction(db_session)
    for n in (1, 2):
        switchboard.append_candidate(
            db_session, code, offerer, candidate(n), request_bytes=0, now=at(n)
        )
    answerer = parsed(switchboard.join(db_session, code, request_bytes=0, now=at(3)))[
        "token"
    ]

    first = parsed(switchboard.read(db_session, code, answerer, 0, now=at(4)))
    assert [e["candidate"] for e in first["events"]] == [candidate(1), candidate(2)]
    assert first["cursor"] == 2
    assert (
        parsed(switchboard.read(db_session, code, answerer, 2, now=at(5)))["events"]
        == []
    )

    switchboard.append_candidate(
        db_session, code, offerer, candidate(3), request_bytes=0, now=at(6)
    )
    later = parsed(switchboard.read(db_session, code, answerer, 2, now=at(7)))
    assert later["events"] == [{"kind": "candidate", "candidate": candidate(3)}]
    assert later["cursor"] == 3

    # The offerer's stream is the answer, then the answerer's candidates, and
    # never its own.
    switchboard.answer(db_session, code, answerer, ANSWER, request_bytes=0, now=at(8))
    switchboard.append_candidate(
        db_session, code, answerer, candidate(9), request_bytes=0, now=at(9)
    )
    back = parsed(switchboard.read(db_session, code, offerer, 0, now=at(10)))
    assert back["events"] == [
        {"kind": "answer", "sdp": ANSWER},
        {"kind": "candidate", "candidate": candidate(9)},
    ]
    assert back["cursor"] == 2

    with pytest.raises(InvalidCursor) as refused:
        switchboard.read(db_session, code, offerer, 3, now=at(11))
    assert refused.value.field == "cursor"


def test_relayed_bytes_counts_every_request_and_response_body(
    db_session: Session,
) -> None:
    """Each response reports a total that includes the request and itself."""
    expected = 0

    def relay(request_bytes: int, call: Relayed) -> dict[str, Any]:
        nonlocal expected
        expected += request_bytes + len(call.body)
        body = parsed(call)
        assert body["relayed_bytes"] == expected
        return body

    offer_bytes = wire({"offer": OFFER})
    created = relay(
        offer_bytes,
        switchboard.create(db_session, OFFER, request_bytes=offer_bytes, now=at(0)),
    )
    code, offerer = created["code"], created["token"]

    one = candidate(1)
    relay(
        wire(one),
        switchboard.append_candidate(
            db_session, code, offerer, one, request_bytes=wire(one), now=at(1)
        ),
    )
    relay(0, switchboard.read(db_session, code, offerer, 0, now=at(2)))
    answerer = relay(0, switchboard.join(db_session, code, request_bytes=0, now=at(3)))[
        "token"
    ]
    relay(0, switchboard.read(db_session, code, answerer, 0, now=at(4)))
    answer_bytes = wire({"sdp": ANSWER})
    relay(
        answer_bytes,
        switchboard.answer(
            db_session, code, answerer, ANSWER, request_bytes=answer_bytes, now=at(5)
        ),
    )
    relay(0, switchboard.read(db_session, code, offerer, 0, now=at(6)))

    assert db_session.get(Pairing, code) is not None
    assert parsed(switchboard.record_open(db_session, code, offerer, now=at(7))) == {
        "state": "open",
        "relayed_bytes": expected,
    }


def test_the_count_holds_its_own_length_across_a_digit_boundary(
    db_session: Session,
) -> None:
    code, offerer = open_introduction(db_session)
    pairing = db_session.get(Pairing, code)
    assert pairing is not None

    for start in range(9_930, 10_000, 3):
        pairing.relayed_bytes = start
        db_session.commit()
        call = switchboard.read(db_session, code, offerer, 0, now=at(1))
        assert parsed(call)["relayed_bytes"] == start + len(call.body)


def test_the_counter_stops_when_the_channel_opens(db_session: Session) -> None:
    code, offerer, answerer = joined_introduction(db_session)
    frozen = parsed(switchboard.record_open(db_session, code, offerer, now=at(5)))

    with pytest.raises(PairingClosed):
        switchboard.read(db_session, code, answerer, 0, now=at(6))
    with pytest.raises(PairingClosed):
        switchboard.append_candidate(
            db_session, code, answerer, candidate(1), request_bytes=99, now=at(6)
        )

    # A refusal relays nothing, so it costs nothing, and the late device is told
    # the same number as the early one.
    later = parsed(switchboard.record_open(db_session, code, answerer, now=at(64)))
    assert later == frozen
    pairing = db_session.get(Pairing, code)
    assert pairing is not None
    assert pairing.relayed_bytes == frozen["relayed_bytes"]
    assert pairing.opened_at == at(5)


def test_only_the_two_devices_can_take_part(db_session: Session) -> None:
    code, offerer = open_introduction(db_session)

    with pytest.raises(NotAParty):
        switchboard.read(db_session, code, "a-guess", 0, now=at(1))
    with pytest.raises(OutOfTurn):
        switchboard.answer(
            db_session, code, offerer, ANSWER, request_bytes=0, now=at(1)
        )
    with pytest.raises(OutOfTurn):
        switchboard.record_open(db_session, code, offerer, now=at(1))

    answerer = parsed(switchboard.join(db_session, code, request_bytes=0, now=at(2)))[
        "token"
    ]
    with pytest.raises(OutOfTurn):
        switchboard.append_candidate(
            db_session, code, answerer, candidate(1), request_bytes=0, now=at(3)
        )
    with pytest.raises(PairingNotFound) as refused:
        switchboard.join(db_session, "ZZZZZ2", request_bytes=0, now=at(3))
    assert refused.value.field == "code"
