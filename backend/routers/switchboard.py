"""/switchboard's signaling endpoints: the introduction, and nothing after it.

Each handler delegates to ``services.switchboard`` and maps its refusals onto
statuses via ``_STATUS_BY_ERROR``, with the same ``{ message, field }`` detail
the bookings router uses. So a mistyped code comes back with ``field: "code"``
and the client can show it under the code's input.

**The count is exact, so this router does not serialise anything.** Every
handler reads the raw body with ``request.body()`` and passes its length to the
service as ``request_bytes``, then returns the service's ``Relayed.body`` as it
came. FastAPI has already read the same body to validate it, and Starlette keeps
the bytes on the request, so the length is the length of what was parsed. There
is no ``response_model`` anywhere here, on purpose: re-encoding the body would
change its length and turn the number on screen into an estimate.

**The token travels in a header** (``X-Pairing-Token``) so that a read can stay
a ``GET`` and the body stays the thing being counted. It is not authentication.
It proves only that the caller is one of the two devices this code introduced.

**The rate limit is per instance, and that is a known weakness.** Creation is
limited per client address by ``CREATE_LIMIT`` in ``CREATE_WINDOW_SECONDS``, in
memory. A container has one instance, so the limit is exact there. On Vercel each
function instance keeps its own window, so a determined client gets the limit
times the number of warm instances. Keeping the window in the database would
fix that, but it would mean storing visitors' addresses for longer than a
pairing lives. The limit exists to stop row floods on a free-tier store, and
it does that well enough per instance.

The client address is the first ``X-Forwarded-For`` hop when there is one.
Vercel overwrites that header at its edge, so it cannot be forged on the public
deployment. A client talking straight to the container could forge it, but the
container is not public.
"""

import math
import time
from collections import deque
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from db import get_db
from schemas import IceCandidate, PairingAnswer, PairingOffer, SwitchboardErrorDetail
from services import switchboard as service
from services.switchboard import (
    CODE_ALPHABET,
    CODE_LENGTH,
    CodeAlreadyUsed,
    CodeExpired,
    InvalidCursor,
    NotAParty,
    OutOfTurn,
    PairingClosed,
    PairingNotFound,
    Relayed,
    SwitchboardError,
)

# Calibration: a visitor who reloads the page a few times is never refused,
# and a script cannot fill the store faster than a pairing every twelve
# seconds per address per instance.
CREATE_LIMIT = 5
CREATE_WINDOW_SECONDS = 60.0

router = APIRouter(prefix="/api/switchboard", tags=["switchboard"])

_STATUS_BY_ERROR: dict[type[SwitchboardError], int] = {
    PairingNotFound: 404,
    CodeExpired: 410,
    CodeAlreadyUsed: 409,
    NotAParty: 403,
    OutOfTurn: 409,
    PairingClosed: 409,
    InvalidCursor: 422,
}

_JSON = "application/json"


class SlidingWindowLimiter:
    """At most ``limit`` hits per key in any ``window`` seconds."""

    # Past this many addresses, every stale one is dropped on the next hit, so
    # the table cannot grow without bound between restarts.
    _PRUNE_AT = 1024

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self._hits: dict[str, deque[float]] = {}

    def wait(self, key: str, now: float) -> float | None:
        """Record a hit and return None, or return the seconds until one is allowed."""
        if len(self._hits) > self._PRUNE_AT:
            for stale in [
                k for k, h in self._hits.items() if now - h[-1] >= self.window
            ]:
                del self._hits[stale]

        hits = self._hits.setdefault(key, deque())
        while hits and now - hits[0] >= self.window:
            hits.popleft()
        if len(hits) >= self.limit:
            return self.window - (now - hits[0])
        hits.append(now)
        return None

    def clear(self) -> None:
        self._hits.clear()


create_limiter = SlidingWindowLimiter(CREATE_LIMIT, CREATE_WINDOW_SECONDS)


def _refusal(
    status: int,
    message: str,
    field: str | None,
    headers: dict[str, str] | None = None,
) -> HTTPException:
    """``detail`` dumped to a dict, as in the bookings router, and for its reason."""
    detail = SwitchboardErrorDetail(message=message, field=field)
    return HTTPException(status, detail.model_dump(), headers=headers)


def _as_http(exc: SwitchboardError) -> HTTPException:
    """Map a refusal to its HTTP equivalent (400 if unclassified)."""
    return _refusal(_STATUS_BY_ERROR.get(type(exc), 400), str(exc), exc.field)


def _code(code: str) -> str:
    """Refuse a code that cannot exist before asking the database about it."""
    normal = code.strip().upper()
    if len(normal) != CODE_LENGTH or not set(normal) <= set(CODE_ALPHABET):
        raise _refusal(
            422,
            f"A code is {CODE_LENGTH} characters: the digits 2 to 9 and the "
            "letters other than I, L, O and U",
            "code",
        )
    return normal


def _token(token: str | None) -> str:
    if not token:
        raise _as_http(NotAParty("This device is not part of that introduction"))
    return token


def _client_address(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    if first:
        return first
    return request.client.host if request.client else "unknown"


def _send(relayed: Relayed, status: int = 200) -> Response:
    return Response(content=relayed.body, status_code=status, media_type=_JSON)


Token = Annotated[str | None, Header(alias="X-Pairing-Token")]
Db = Annotated[Session, Depends(get_db)]


@router.post("", status_code=201, response_class=Response)
async def create_pairing(payload: PairingOffer, request: Request, db: Db) -> Response:
    """Open an introduction with the offer and issue a code and a token."""
    wait = create_limiter.wait(_client_address(request), time.monotonic())
    if wait is not None:
        raise _refusal(
            429,
            "Too many codes from this address; try again shortly",
            None,
            headers={"Retry-After": str(math.ceil(wait))},
        )

    body = await request.body()
    try:
        relayed = service.create(db, payload.offer, request_bytes=len(body))
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed, 201)


@router.post("/{code}/join", response_class=Response)
async def join_pairing(code: str, request: Request, db: Db) -> Response:
    """Consume the code and hand over the offer and the joiner's token."""
    body = await request.body()
    try:
        relayed = service.join(db, _code(code), request_bytes=len(body))
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed)


@router.post("/{code}/answer", response_class=Response)
async def answer_pairing(
    code: str, payload: PairingAnswer, request: Request, db: Db, token: Token = None
) -> Response:
    """Record the joiner's answer."""
    body = await request.body()
    try:
        relayed = service.answer(
            db, _code(code), _token(token), payload.sdp, request_bytes=len(body)
        )
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed)


@router.post("/{code}/candidates", response_class=Response)
async def append_candidate(
    code: str, payload: IceCandidate, request: Request, db: Db, token: Token = None
) -> Response:
    """Queue one trickled ICE candidate for the other device."""
    body = await request.body()
    try:
        relayed = service.append_candidate(
            db,
            _code(code),
            _token(token),
            payload.model_dump(),
            request_bytes=len(body),
        )
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed)


@router.get("/{code}", response_class=Response)
async def read_pairing(
    code: str,
    db: Db,
    token: Token = None,
    cursor: Annotated[int, Query(ge=0)] = 0,
) -> Response:
    """Return what the other device sent after ``cursor``. Polled at 500 ms."""
    try:
        relayed = service.read(db, _code(code), _token(token), cursor)
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed)


@router.post("/{code}/open", response_class=Response)
async def record_open(code: str, db: Db, token: Token = None) -> Response:
    """Report that the data channel opened. Freezes the count; never charged."""
    try:
        relayed = service.record_open(db, _code(code), _token(token))
    except SwitchboardError as exc:
        raise _as_http(exc) from exc
    return _send(relayed)
