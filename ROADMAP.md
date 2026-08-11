# EtherealHotel — Improvement Roadmap

Work these in order. Each item has a **Definition of Done (DoD)** so a separate instance can
implement it and this instance can verify it. Effort is a rough estimate.

The bar for every item: _would a senior engineer reviewing this repo in an interview see judgment,
or see a tutorial?_ Prefer finishing one thing convincingly over starting three.

---

## 1. Finish the backend deployment ✅ **Done**

**Effort:** M · **Why:** `environment.prod.ts` pointed at `ethereal-hotel-api.onrender.com`, which
404d. The live site therefore showed failed requests in DevTools and ran on mock data. A dead URL
in production source is worse than no URL: it reads as unfinished rather than scoped.

**What was done.** The FastAPI app is deployed as a Python function on the _same_ Vercel project
as the frontend (`api/index.py`), rather than on a separate host. Same origin, so there is no CORS
surface and no hostname to rot — `environment.prod.ts` addresses `/api` relatively, and every
preview deployment gets a working backend for free.

The tradeoff, taken deliberately and surfaced rather than hidden: a function invocation has no
process, so there is no `/ws`. The health payload reports `liveStream: false` and omits the
endpoint; the dashboard polls `/api/metrics` instead and the badge reads "Live data · polled from
the API every few seconds" rather than claiming a stream it does not have. The WebSocket remains a
real feature of the container deployment (`backend/Dockerfile`), and both are built by the same
`create_app()` factory — `live_stream` is the only difference.

**DoD:**

- [x] `curl https://ethereal-hotel-pink.vercel.app/api/health` returns the health JSON (~0.5s).
- [x] The live Vercel site shows real data with a clean network tab — verified in a headless
      browser: three same-origin `/api/*` calls, all 200, no failed requests, no console errors,
      and the rendered figures match what the API serves.
- [x] N/A — the deploy was not skipped. `environment.prod.ts` no longer references any host.

**Notable details, for whoever reads this next:**

- Seeding uses a **fixed RNG seed** so every cold-started instance derives the same hotel;
  bookings are still laid out around `date.today()`, so the demo does not decay the way a
  committed snapshot would. Verified byte-identical across fresh instances.
- Vercel's Python runtime offers 3.12/3.13/3.14 and **no 3.11**, so the function runs 3.12 while
  the container and ruff/mypy target 3.11. The CI matrix runs both rather than assuming the gap
  is harmless. Dependencies are declared in two files for the same reason, and
  `backend/tests/test_dependency_pins.py` fails if they drift.
- `requires-python`/`.python-version` are only consulted when `pyproject.toml` is the dependency
  source; a root `requirements.txt` silently overrode both and pinned the build to 3.14, where
  our `pydantic-core` has no wheel. That is why there is no `requirements.txt` at the root.
