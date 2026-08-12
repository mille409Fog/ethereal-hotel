"""Vercel serverless entrypoint for the EtherealHotel API.

The hosted demo runs the FastAPI app from ``backend/`` as a Python function on
the *same* Vercel project that serves the Angular frontend. That choice buys two
things the previous separate-host plan did not: the API is same-origin, so there
is no CORS surface at all, and the URL cannot go stale, because there is no host
to hard-code — ``environment.prod.ts`` addresses ``/api`` relatively and every
preview deployment gets a working backend for free.

It costs one thing, and this file is where that cost is paid: a function
invocation has no process lifetime, so the ``/ws`` metrics stream and the
background broadcaster behind it cannot run here. The frontend degrades to REST
polling when the health check reports ``liveStream: false``. The full stack,
socket included, is what ``backend/Dockerfile`` builds — see "Deployment" in
``ARCHITECTURE.md``.

Vercel routes every ``/api/*`` request here via the rewrite in ``vercel.json``
and invokes the ``app`` exported at the bottom.
"""

import os
import random
import sys
import tempfile
from pathlib import Path

from faker import Faker

# The backend is an application rooted at ./backend, not an installed package,
# so put it on the path the same way `backend/tests/conftest.py` does.
_BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

# The filesystem is read-only apart from the temp directory, and `db.database`
# builds its engine at import time — so this has to be set before that import,
# not after. A DATABASE_URL supplied by the platform still wins, which is the
# seam to a real Postgres if this demo ever needs to outlive its instance.
os.environ.setdefault(
    "DATABASE_URL",
    f"sqlite:///{Path(tempfile.gettempdir()) / 'ethereal_hotel.db'}",
)

from db import init_db  # noqa: E402  (import after DATABASE_URL is set)
from db.seed import seed_if_empty  # noqa: E402
from main import create_app  # noqa: E402

# Every instance seeds its own throwaway database on cold start, so the seed has
# to be fixed: without it, two instances would serve two different hotels and
# the dashboard's numbers would jump as requests landed on one or the other.
# Fixing it makes the data identical everywhere and still derived from real
# rows — `db.seed` lays bookings out around `date.today()`, so the demo stays
# anchored to the actual date instead of decaying into a stale snapshot.
#
# The one seam left: instances either side of a UTC midnight compute "today"
# differently. That is a demo serving yesterday's arrivals for a few minutes,
# which is a fair trade for never going stale.
_RNG_SEED = 20260811

random.seed(_RNG_SEED)
Faker.seed(_RNG_SEED)

init_db()
seed_if_empty()

# Vercel's Python runtime invokes this ASGI callable directly. `live_stream` is
# False for the reason in the module docstring: no long-lived process, so no
# socket and no broadcaster — and the health endpoint says so rather than
# advertising a `/ws` that would never connect.
app = create_app(live_stream=False)
