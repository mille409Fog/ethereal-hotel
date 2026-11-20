"""The introduction /switchboard makes, and an exact count of what it relayed.

Two devices exchange an offer, an answer and a few trickled ICE candidates
through this module, then talk directly and the server stops taking part.
SWITCHBOARD.md is the plan; this header holds what was decided while building it.

**The count is exact, so this module writes the response body.** Every
operation returns ``Relayed.body``, the JSON bytes the router must send
unchanged, and adds ``request_bytes`` (the raw body length, measured by the
router) plus ``len(body)`` to ``relayed_bytes``. Re-serialising in the router
would make the number an estimate. The body reports the count, and the count
includes the body, so ``_charge`` iterates to the fixed point. The length only
grows when the number gains a digit, so it settles in two or three passes.

**Only a successful relay is charged.** A refused request carries nothing from
one device to the other, so it adds nothing.

**``record_open`` is the one call that is never charged, and it is what stops
the counter.** Either device reports that its data channel opened. From then on
every other operation raises ``PairingClosed`` without charging, so the number
on both screens stops for good. Both devices get the same frozen number from
``record_open``, whichever reports first. Charging the second report would make
the two screens disagree by one request, and it relays nothing anyway.

**Each side holds a token.** The code is short and shown on screen, so it only
gets you in once: ``join`` consumes it. After that, reads and writes need the
token that ``create`` or ``join`` handed out. Without tokens, anyone who saw the
code could read both devices' IP addresses out of the SDP for two minutes.

**The cursor is one integer per side.** Each side reads an append-only stream
of what the *other* side sent: for the offerer, the answer and then the
answerer's candidates; for the answerer, the offerer's candidates (the offer
itself comes back from ``join``). The answerer may not trickle before it
answers, so that order holds. A read returns ``events[cursor:]`` and the next
cursor. Re-sending what a device already has would add to the count on every
500 ms poll, which is the reason for the cursor.

**Lifetimes.** A code can be joined for ``CODE_LIFETIME`` after it is made. The
row is deleted ``LINGER`` after the channel opens or, if it never opens,
``LINGER`` after the code expires. The extra minute is what lets the laptop see
``CodeExpired`` rather than ``PairingNotFound``. Nothing runs on a timer here
(the Vercel function has no background task), so every operation sweeps first:
a row past its deadline is gone for every caller, whether or not a sweep has
deleted it yet.

Rows are locked ``FOR UPDATE`` before a charge, so two instances polling one row
on a shared Postgres cannot lose an increment. SQLite has no row locks and
serialises writers itself. ``join`` also claims the row with a conditional
``UPDATE``, so single use holds even without the lock.

Times are naive UTC, like every other ``DateTime`` column here. No FastAPI
imports: the router maps the errors below to statuses, and ``field`` tells it
which input to put the message under.
"""

import hmac
import json
import secrets
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.orm import Session

from db import Pairing

# No 0, 1, I, L, O or U, which read as each other or as V: 30 symbols, 30**6 ≈ 7.3e8.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
CODE_LENGTH = 6
CODE_LIFETIME = timedelta(seconds=120)
LINGER = timedelta(seconds=60)

# A collision needs one of a handful of live codes out of 7.3e8, so a loop this
# long failing means the generator is broken, not that the space is full.
_CODE_ATTEMPTS = 8

Side = Literal["offerer", "answerer"]
State = Literal["waiting", "joined", "open"]


class SwitchboardError(Exception):
    """Base class for refused signaling requests.

    ``field`` names the request input the refusal belongs to, or is None when it
    is about the pairing as a whole. Same contract as ``BookingError``.
    """

    field: str | None = None


class PairingNotFound(SwitchboardError):
    """No live pairing has this code: mistyped, or already deleted."""

    field = "code"


class CodeExpired(SwitchboardError):
    """Nobody joined within ``CODE_LIFETIME``."""

    field = "code"


class CodeAlreadyUsed(SwitchboardError):
    """Another device joined first."""

    field = "code"


class NotAParty(SwitchboardError):
    """The token belongs to neither device in this pairing."""


class OutOfTurn(SwitchboardError):
    """A valid party sent something the introduction is not ready for."""


class PairingClosed(SwitchboardError):
    """The channel is open and the server is no longer on the line."""


class InvalidCursor(SwitchboardError):
    """The cursor points past what this side could have seen."""

    field = "cursor"


@dataclass(frozen=True)
class Relayed:
    """The exact response body. Send it unchanged: its length is in the count."""

    body: bytes


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _encode(payload: Mapping[str, Any]) -> bytes:
    # The same settings as Starlette's JSONResponse, though the router sends
    # these bytes as they are and nothing depends on that match.
    return json.dumps(
        payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")


def _charge(
    pairing: Pairing, payload: Mapping[str, Any], request_bytes: int
) -> Relayed:
    """Add the request and this response to the count, which the response reports."""
    if request_bytes < 0:
        raise ValueError(f"request_bytes cannot be negative: {request_bytes}")
    base = pairing.relayed_bytes + request_bytes
    total = base
    while True:
        body = _encode({**payload, "relayed_bytes": total})
        if base + len(body) == total:
            pairing.relayed_bytes = total
            return Relayed(body)
        total = base + len(body)


def _state(pairing: Pairing) -> State:
    if pairing.opened_at is not None:
        return "open"
    return "waiting" if pairing.joined_at is None else "joined"


def _expires_in(pairing: Pairing, now: datetime) -> int:
    remaining = pairing.created_at + CODE_LIFETIME - now
    return max(int(remaining.total_seconds()), 0)


def _code_has_expired(pairing: Pairing, now: datetime) -> bool:
    return now >= pairing.created_at + CODE_LIFETIME


def expire(db: Session, *, now: datetime | None = None) -> int:
    """Delete every pairing past its deadline. Returns how many went."""
    now = now or _now()
    result = db.execute(
        delete(Pairing).where(
            or_(
                and_(
                    Pairing.opened_at.is_(None),
                    Pairing.created_at <= now - (CODE_LIFETIME + LINGER),
                ),
                Pairing.opened_at <= now - LINGER,
            )
        )
    )
    db.commit()
    return result.rowcount


def _load(db: Session, code: str, now: datetime) -> Pairing:
    expire(db, now=now)
    pairing = db.scalars(
        select(Pairing).where(Pairing.code == code.strip().upper()).with_for_update()
    ).first()
    if pairing is None:
        raise PairingNotFound(f"No introduction is waiting under {code!r}")
    return pairing


def _side(pairing: Pairing, token: str) -> Side:
    given = token.encode("utf-8")
    if hmac.compare_digest(given, pairing.offerer_token.encode("utf-8")):
        return "offerer"
    if pairing.answerer_token is not None and hmac.compare_digest(
        given, pairing.answerer_token.encode("utf-8")
    ):
        return "answerer"
    raise NotAParty("This device is not part of that introduction")


def _refuse_if_open(pairing: Pairing) -> None:
    if pairing.opened_at is not None:
        raise PairingClosed(
            "The devices are talking directly; the server has stopped relaying"
        )


def _stream(pairing: Pairing, side: Side) -> list[dict[str, Any]]:
    """Everything the other side has sent this side, in order."""
    events: list[dict[str, Any]] = []
    if side == "offerer" and pairing.answer is not None:
        events.append({"kind": "answer", "sdp": pairing.answer})
    other: Side = "answerer" if side == "offerer" else "offerer"
    events.extend(
        {"kind": "candidate", "candidate": entry["candidate"]}
        for entry in pairing.candidates
        if entry["side"] == other
    )
    return events


def _free_code(db: Session) -> str:
    for _ in range(_CODE_ATTEMPTS):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if db.get(Pairing, code) is None:
            return code
    raise RuntimeError(f"No free pairing code in {_CODE_ATTEMPTS} attempts")


def create(
    db: Session, offer: str, *, request_bytes: int, now: datetime | None = None
) -> Relayed:
    """Open an introduction with the offerer's SDP and issue its code."""
    now = now or _now()
    expire(db, now=now)
    code = _free_code(db)
    token = secrets.token_urlsafe(32)
    pairing = Pairing(
        code=code,
        offerer_token=token,
        offer=offer,
        candidates=[],
        relayed_bytes=0,
        created_at=now,
    )
    db.add(pairing)
    relayed = _charge(
        pairing,
        {
            "code": code,
            "token": token,
            "state": "waiting",
            "expires_in": _expires_in(pairing, now),
        },
        request_bytes,
    )
    db.commit()
    return relayed


def join(
    db: Session, code: str, *, request_bytes: int, now: datetime | None = None
) -> Relayed:
    """Consume the code, issue the answerer's token, and hand over the offer."""
    now = now or _now()
    pairing = _load(db, code, now)
    if pairing.joined_at is not None:
        raise CodeAlreadyUsed("Another device has already used this code")
    if _code_has_expired(pairing, now):
        raise CodeExpired("This code has expired")

    token = secrets.token_urlsafe(32)
    claimed = db.execute(
        update(Pairing)
        .where(Pairing.code == pairing.code, Pairing.joined_at.is_(None))
        .values(joined_at=now, answerer_token=token)
    )
    if claimed.rowcount != 1:
        db.rollback()
        raise CodeAlreadyUsed("Another device has already used this code")
    db.refresh(pairing)

    relayed = _charge(
        pairing,
        {"token": token, "state": "joined", "offer": pairing.offer},
        request_bytes,
    )
    db.commit()
    return relayed


def answer(
    db: Session,
    code: str,
    token: str,
    sdp: str,
    *,
    request_bytes: int,
    now: datetime | None = None,
) -> Relayed:
    """Record the answerer's SDP, once."""
    now = now or _now()
    pairing = _load(db, code, now)
    side = _side(pairing, token)
    _refuse_if_open(pairing)
    if side != "answerer":
        raise OutOfTurn("Only the device that joined can answer")
    if pairing.answer is not None:
        raise OutOfTurn("This device has already answered")

    pairing.answer = sdp
    relayed = _charge(pairing, {"state": _state(pairing)}, request_bytes)
    db.commit()
    return relayed


def append_candidate(
    db: Session,
    code: str,
    token: str,
    candidate: Mapping[str, str | int | None],
    *,
    request_bytes: int,
    now: datetime | None = None,
) -> Relayed:
    """Queue one trickled ICE candidate for the other side.

    The candidate is relayed, not read: the router checks its shape, and this
    module stores it as it came.
    """
    now = now or _now()
    pairing = _load(db, code, now)
    side = _side(pairing, token)
    _refuse_if_open(pairing)
    if side == "answerer" and pairing.answer is None:
        raise OutOfTurn("Send the answer before any candidates")

    # Reassigned, not appended to: the JSON column does not track mutation.
    pairing.candidates = [
        *pairing.candidates,
        {"side": side, "candidate": dict(candidate)},
    ]
    relayed = _charge(pairing, {"state": _state(pairing)}, request_bytes)
    db.commit()
    return relayed


def read(
    db: Session,
    code: str,
    token: str,
    cursor: int,
    *,
    now: datetime | None = None,
) -> Relayed:
    """Return what the other side sent after ``cursor``, and the next cursor.

    A read has no request body; its response is charged like any other.
    """
    now = now or _now()
    pairing = _load(db, code, now)
    side = _side(pairing, token)
    _refuse_if_open(pairing)
    if pairing.joined_at is None and _code_has_expired(pairing, now):
        raise CodeExpired("Nobody joined before this code expired")

    events = _stream(pairing, side)
    if not 0 <= cursor <= len(events):
        raise InvalidCursor(f"Cursor must be between 0 and {len(events)}")

    payload: dict[str, Any] = {
        "state": _state(pairing),
        "cursor": len(events),
        "events": events[cursor:],
    }
    if pairing.joined_at is None:
        payload["expires_in"] = _expires_in(pairing, now)
    relayed = _charge(pairing, payload, request_bytes=0)
    db.commit()
    return relayed


def record_open(
    db: Session, code: str, token: str, *, now: datetime | None = None
) -> Relayed:
    """Record that a data channel opened, freeze the count, and report it.

    Idempotent: the second device to report gets the same number as the first.
    """
    now = now or _now()
    pairing = _load(db, code, now)
    _side(pairing, token)
    if pairing.joined_at is None:
        raise OutOfTurn("Nobody has joined this introduction yet")
    if pairing.opened_at is None:
        pairing.opened_at = now
    body = _encode({"state": "open", "relayed_bytes": pairing.relayed_bytes})
    db.commit()
    return Relayed(body)
