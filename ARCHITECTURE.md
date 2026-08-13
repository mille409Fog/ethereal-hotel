# EtherealHotel Architecture

Reference for the parts of this repo that are decisions rather than defaults: how the two
routes get their data, what the API returns when it says no, and why the same application
deploys two different ways. Setup and the CI gates live in [CONTRIBUTING.md](CONTRIBUTING.md);
the database schema, seeding and streaming internals live in
[backend/README.md](backend/README.md).

## System overview

One Angular SPA, one FastAPI application, two supported deployments. The frontend never talks
to anything but its own origin in production; in development it crosses from :4200 to :8000 and
CORS applies.

```
┌──────────────────────┐        WebSocket (container only)        ┌──────────────────────┐
│  Angular 22 SPA      │◄─────────────────────────────────────────►│  FastAPI             │
│  signals, OnPush     │        HTTP (both deployments)            │  create_app()        │
│  :4200 dev           │◄─────────────────────────────────────────►│  :8000 dev           │
└──────────────────────┘                                           └──────────┬───────────┘
                                                                              │
                                                                   ┌──────────▼───────────┐
                                                                   │  SQLite (SQLAlchemy) │
                                                                   │  seeded on startup   │
                                                                   └──────────────────────┘
```

## Transport and degradation

The dashboard has three ways to get metrics and says on screen which one it is using. This is
the behaviour the whole read path is built around, so it is worth stating precisely.

The frontend picks its transport from `wsUrl` in the active environment file — it does not
discover the absence of a socket by failing to open one:

| `wsUrl`             | Transport                                 | Badge                                             |
| ------------------- | ----------------------------------------- | ------------------------------------------------- |
| set                 | WebSocket, pushed every 2s                | Live data · streaming from the API                |
| `null`              | `GET /api/metrics` every `pollIntervalMs` | Live data · polled from the API every few seconds |
| — (API unreachable) | none; committed fixture                   | Simulated data · backend unreachable              |

`wsUrl: null` in `src/environments/environment.prod.ts` is not an unfinished config value. It
is the instruction to poll, because the hosted demo is a serverless function with no process to
hold a socket open. `pollIntervalMs` is 15000 rather than an imitation of the 2s socket cadence,
because on serverless every poll is a billed invocation.

The last row is the fixture fallback:
`src/app/services/offline-dashboard.fixture.json` is a committed snapshot of a real seeded
database, not generated numbers — so the shapes on the charts are still facts about a hotel,
and the badge says you are looking at a snapshot.

**`/booking` deliberately has no equivalent fallback.** A fixture is honest on the dashboard
because a committed snapshot of real metrics is still true; it would not be honest on a form
whose entire claim is that submitting it writes a row someone can read back. A visitor would
fill the form, watch a booking appear, reload, and find it gone. Instead the form is disabled,
the badge says the API is unreachable, and the empty list says why it is empty.

### Streaming, when there is a stream

A **single background task** owns the stream. It computes one metrics snapshot per tick from
the database and fans it out to every connected socket, so N viewers cost the same one query
per tick as a single viewer does. Connected clients never poll; a tick with no listeners skips
the database entirely.

```
┌────────────┐                                    ┌──────────────────────┐
│            │  1. Connect ws://localhost:8000/ws │  FastAPI /ws         │
│  Dashboard │───────────────────────────────────►│  registers client,   │
│ Component  │                                    │  sends one snapshot  │
│            │  2. Snapshot on connect            │  so the UI renders   │
│            │◄───────────────────────────────────│  without waiting     │
└────────────┘                                    └──────────┬───────────┘
      ▲                                                      │ registered on
      │ 4. send_json to every client                         ▼
      │                                           ┌──────────────────────┐
      └───────────────────────────────────────────│  ConnectionManager   │
                                                  └──────────┬───────────┘
                                                             ▲
                                        3. one snapshot/tick │
                                       ┌─────────────────────┴───────────┐
                                       │ broadcaster task (asyncio, 2s)  │
                                       │ compute_metrics(db) — 1 query   │
                                       │ set, derived from real rows     │
                                       └─────────────────────────────────┘
```

`test_broadcaster.py` counts the SQL issued against the engine and asserts five clients cost
the same query count as one, so a per-client poll cannot quietly return.

The socket reconnects with exponential backoff (1s → 30s cap), and subscriptions are torn down
by `takeUntilDestroyed(DestroyRef)` rather than manual `unsubscribe()`.

## API endpoints

| Endpoint             | Method | Description                                 | Response        |
| -------------------- | ------ | ------------------------------------------- | --------------- |
| `/`                  | GET    | Health check                                | API info        |
| `/api/health`        | GET    | The same handler, second mount              | API info        |
| `/api/metrics`       | GET    | Current metrics                             | `Metrics`       |
| `/api/dashboard`     | GET    | Full dashboard                              | `DashboardData` |
| `/api/bookings`      | GET    | List bookings (`limit`, `offset`, `status`) | `BookingPage`   |
| `/api/bookings`      | POST   | Create a booking                            | `BookingOut`    |
| `/api/bookings/{id}` | DELETE | Delete a booking                            | 204             |
| `/api/rooms`         | GET    | Every room (reference data)                 | `RoomOut[]`     |
| `/api/guests`        | GET    | Every guest, id and name only               | `GuestOut[]`    |
| `/docs`              | GET    | Swagger UI                                  | HTML            |
| `/redoc`             | GET    | ReDoc UI                                    | HTML            |

| Endpoint | Protocol  | Update Rate                      | Data      |
| -------- | --------- | -------------------------------- | --------- |
| `/ws`    | WebSocket | 2 seconds (one shared broadcast) | `Metrics` |

`/ws` is mounted only when `create_app(live_stream=True)` — the container deployment. The
health payload carries `liveStream`, which reports whether *this* deployment serves the socket,
and its `endpoints` map omits `/ws` when it does not.

Health is mounted twice on purpose: the container is alone on its origin, so `/` is the natural
probe, while on Vercel the Angular app owns `/` and the API is only reachable beneath `/api`.
One handler, two mounts — a second endpoint would drift.

`/api/rooms` and `/api/guests` are read-only and exist for one caller: `POST /api/bookings`
takes foreign keys, and a form that asks a visitor to guess one cannot be demonstrated. They
have no create/update/delete because nothing needs them, and `GuestOut` carries an id and a
display name and nothing contactable — the list is served unauthenticated to anyone who opens
the demo.

### How a rejected booking comes back

A `BookingError` carries the request field it belongs to, and the router serialises both:

```json
{ "detail": { "message": "check_out must be after check_in", "field": "check_out" } }
```

The `field` is part of the domain error rather than something the router infers from the
message, because inferring it would mean matching on prose. It is what lets the booking form
render the server's objection under the input that caused it instead of as a detached banner.

The rule itself lives once, in `backend/services/bookings.py`, and has no counterpart in the
browser. A second implementation in TypeScript would have rendered faster and been one refactor
away from disagreeing with the server about what a valid booking is.

Note that this is *not* the shape of Pydantic's own 422 — that one is raised before the handler
runs and is a list of issues located by path — so a client has to read both.

## Layering

Requests go one way through the backend, and domain code carries no HTTP knowledge:

```
routers/    validates the request shape and delegates      (FastAPI lives here)
   ↓
services/   applies the rules, raises domain errors        (no FastAPI imports)
   ↓
db/         owns persistence                               (SQLAlchemy models, metrics, seed)
```

Domain errors are mapped to status codes in the router. `services/` never imports FastAPI, so
the booking rules are callable — and testable — without a request.

The frontend is the mirror image: components hold `signal()` state and `computed()` derivations,
services own the transport, and RxJS appears only where the transport is genuinely a stream.
State is signals over an RxJS transport, not an RxJS store.

## Data models

```typescript
interface Metrics {
  timestamp: string;
  occupancy: number; // occupied / operational rooms (%)
  guestsInHouse: number;
  revenueToday: number;
  arrivalsToday: number;
  departuresToday: number;
  occupiedRooms: number;
  availableRooms: number;
  operationalRooms: number;
  totalRooms: number;
  adr: number; // average daily rate
  revpar: number; // revenue per available room
}

interface DashboardData {
  metrics: Metrics;
  historicalGuests: HistoricalData[]; // { timestamp: string; value: number }
  historicalRevenue: HistoricalData[];
}
```

The Python side is the same shape, declared in `backend/schemas.py`. The camelCase field names
are the wire contract the Angular interfaces consume, which is why `N815` is switched off for
that file. The metrics payloads are `TypedDict`s internally, so a typo in a metric key fails
`mypy --strict` rather than reaching the frontend as a missing field.

## Deployment

Two targets, built from the same application by the same `create_app()` factory in
`backend/main.py`. The factory takes one flag, `live_stream`, which toggles everything that
needs a long-lived process: the `/ws` endpoint, the background broadcaster feeding it, and the
startup seeding they assume. There is no second copy of the wiring to keep in sync.

|                        | Serverless demo (`live_stream=False`) | Container (`live_stream=True`) |
| ---------------------- | ------------------------------------- | ------------------------------ |
| Metrics transport      | `GET /api/metrics` polling            | `/ws`, pushed every 2s         |
| `liveStream` in health | `false`                               | `true`                         |
| CORS                   | none needed (same origin)             | `ALLOWED_ORIGINS` required     |
| Database               | rebuilt per cold start in `/tmp`      | persistent                     |
| Writes                 | accepted, not durable                 | durable                        |

### Serverless — the hosted demo

Frontend and API deploy as **one Vercel project**, so the browser sees a single origin:

```
                      https://ethereal-hotel-pink.vercel.app
                                      │
                     ┌────────────────┴────────────────┐
        /api/*  ─────┤  vercel.json rewrites           ├───── /*
                     └────────────────┬────────────────┘
                                      │
          ┌───────────────────────────┴───────────────────────┐
          ▼                                                   ▼
   api/index.py                                    dist/ethereal-hotel/browser
   Python 3.12 function                            Angular SPA shell
   → backend/ create_app(live_stream=False)        → client-side routing
   → SQLite seeded in /tmp, fixed RNG seed
```

Same-origin is worth more than it looks: no CORS preflight, no `ALLOWED_ORIGINS` to keep in
sync, and no hostname that can rot — every preview deployment gets a working backend at its own
URL with no edit to `environment.prod.ts`.

The seed is fixed (`api/index.py`) so every cold-started instance derives the *same* hotel —
without that, two function instances would serve two different hotels. The bookings are still
laid out around `date.today()`, so the demo does not decay the way a committed database would.
The figures are derived from real `Room`/`Guest`/`Booking` rows either way: the seed decides
which rows, not what the numbers mean.

Writes work and move the metrics, but only for that instance's lifetime. The dashboard is
read-only, so this is invisible in normal use; it matters if you go poking at the API. Cold
start is roughly a second, of which seeding is ~0.16s.

### Container — the full stack

```bash
docker build -t ethereal-hotel-api backend/
docker run -p 8000:8000 -e ALLOWED_ORIGINS="https://your-frontend" ethereal-hotel-api
```

This is the deployment with the live WebSocket, the shared broadcaster and a database that
persists. Point a frontend at it by setting `apiUrl`/`wsUrl`/`healthUrl` in
`environment.prod.ts` to its origin, and add that origin to `ALLOWED_ORIGINS` — cross-origin
means CORS applies again, which the same-origin demo avoids entirely.

`backend/docker-compose.yml` is the other supported way in, and the one that makes the
*persistent* and *durable* rows above literally true:

```bash
cd backend && docker compose up -d
```

It puts the SQLite file on a named volume mounted at `/data`, so writes outlive
`docker compose down`. The bare `docker run` above leaves the database in the
container's writable layer, where `docker rm` discards it — fine for a look around,
wrong for anything you want to still be there tomorrow.

Run under multiple workers and each worker gets its own broadcaster and its own in-memory
connection list. That is correct — each worker only fans out to the clients it holds — but it
does mean the "one query per tick" property is per worker rather than per cluster.

### The Python version gap

The container and CI run **3.11**; the hosted function runs **3.12**, because Vercel's Python
runtime offers 3.12/3.13/3.14 and no 3.11. Rather than leave that gap untested, the CI matrix
runs the backend suite on both.

Runtime dependencies are declared twice for the same reason — `backend/requirements.txt` for
the container, `[project.dependencies]` in `pyproject.toml` for Vercel — and
`backend/tests/test_dependency_pins.py` fails if the two lists ever disagree.

There is deliberately **no `requirements.txt` at the repo root**. Its presence makes it the
dependency source, which silently overrides `requires-python` and `.python-version` and pins
the Vercel build to 3.14, where the pinned `pydantic-core` has no wheel. This has broken the
deploy before.

## Configuration

The API base URLs are not hardcoded. `src/environments/environment.model.ts` is the interface
both environment files satisfy, so a field added to one and forgotten in the other fails to
compile instead of failing in production; `angular.json` swaps `environment.ts` for
`environment.prod.ts` on production builds via `fileReplacements`.

On the backend there is **no `.env` loading**: `backend/config.py` reads `os.getenv` at import
time and nothing calls `load_dotenv()`, so configuration comes from real environment variables.
Every one has a default that makes a fresh clone run, so none is required:

| Env var                      | Default               | Purpose                                                                     |
| ---------------------------- | --------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`               | local SQLite file     | Swap in Postgres, etc.                                                      |
| `ALLOWED_ORIGINS`            | localhost dev servers | Comma-separated CORS allowlist                                              |
| `LOG_LEVEL`                  | `INFO`                | Unknown values fall back to INFO with a warning rather than failing startup |
| `BROADCAST_INTERVAL_SECONDS` | `2`                   | Stream cadence                                                              |

CORS only applies when the API is on a different origin from the page — the container
deployment, and local development. The hosted demo serves both from one Vercel origin, so the
browser issues no preflight and the middleware is never exercised there. It is still installed
in both, because `create_app()` builds one application and the container needs it.

## Accessibility

Enforced rather than asserted: the `@angular-eslint/template` accessibility rules run at
**error** severity, and every commit is scanned by **axe** against the production build on `/`,
`/dashboard` and `/booking`. The CI job fails on any serious or critical finding. `/booking` is
scanned twice — once at rest, once with a rejected field on screen — because an error message
is new content inserted after load that has to be associated with its control, and a form that
scans clean empty can still fail the moment it fails.

Alongside the scan, Playwright checks what axe cannot: that the first Tab reaches a skip link,
that the nav is traversable and moves focus to the section it targets, and that under
`prefers-reduced-motion` the animations stop and no content stays stranded behind a fade-in.

Two decisions went against the obvious version:

- **The metrics grid is deliberately not an `aria-live` region.** The socket pushes a snapshot
  every two seconds; announcing six cards at that cadence produces speech a listener can never
  get ahead of, which is worse than silence, not better. Instead one throttled `role="status"`
  region speaks a plain-language digest at most every 30 seconds ("Occupancy 85.0 percent. 51 of
  60 sellable rooms occupied…"), and a second announces backend connect/disconnect transitions —
  so a screen reader user learns when the figures stop being real.
- **The brand red is two tokens.** `--color-blood` (`#9d2235`) reached only ~2:1 as text on this
  background. It stays for borders, fills and glows; `--color-blood-text` carries anything anyone
  has to read, and the focus ring moved to it as well, since a 2:1 focus indicator fails
  WCAG 1.4.11 and is genuinely hard to find on a dark theme.

## Testing

| Suite                  | Covers                                                                        |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm test`             | Vitest over components and services, with coverage thresholds that fail the build |
| `npm run test:backend` | pytest: REST endpoints, the WebSocket stream, broadcaster fan-out, dependency pins |
| `npm run e2e`          | Playwright smoke tests + the axe audit, against the production build          |
| `npm run a11y`         | Just the axe audit and the keyboard/reduced-motion checks                      |

The backend suite runs against an isolated, deterministically seeded SQLite database and needs
no running server. The Playwright suites run against `dist/` rather than `ng serve`, so they
exercise the production `fileReplacements`, the lazy chunks and the minified CSS that users
actually load; they stub the backend at the network layer, so they need no running server
either.

`ruff check`, `ruff format --check` and `mypy --strict` run in the same CI job as pytest, so the
Python half is gated exactly like the TypeScript half. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the commands.

## Project structure

```
ethereal-hotel/
├── api/index.py                   # Vercel entrypoint: backend/ as a Python function
├── src/
│   ├── app/
│   │   ├── dashboard/             # /dashboard — the read path
│   │   │   ├── dashboard.ts       #   container
│   │   │   ├── metrics-grid/      #   the six figures
│   │   │   ├── charts-section/    #   Chart.js panels
│   │   │   ├── dashboard-header/  #   title + connection badge
│   │   │   └── dashboard-footer/
│   │   ├── booking/               # /booking — the write path
│   │   │   ├── booking.ts         #   reactive form + bookings list
│   │   │   └── booking-field/     #   label/hint/error frame for one control
│   │   ├── services/
│   │   │   ├── dashboard-api.service.ts     # metrics: socket, polling, fixture
│   │   │   ├── booking-api.service.ts       # bookings + reference data
│   │   │   ├── analytics.service.ts         # see docs/analytics.md
│   │   │   └── offline-dashboard.fixture.json
│   │   ├── hero/ work/ projects/ experience/ skills/ resume/  # portfolio sections
│   │   ├── navigation/ footer/ directives/
│   │   └── app.routes.ts          # lazy routes, titles from src/route-meta.json
│   ├── environments/              # environment.ts, .prod.ts, .model.ts
│   ├── route-meta.json            # per-route social card copy
│   ├── styles.css                 # global tokens, focus rings, reduced-motion
│   └── index.html
├── backend/
│   ├── main.py                    # create_app(live_stream=...) — wiring only
│   ├── config.py                  # env-driven settings + logging
│   ├── schemas.py                 # Pydantic wire contract
│   ├── routers/                   # health, metrics, bookings, reference, stream
│   ├── services/                  # bookings, reference, broadcaster — no FastAPI
│   ├── db/                        # database, models, metrics, seed
│   ├── alembic/                   # migrations
│   ├── tests/                     # pytest suite
│   ├── Dockerfile, docker-compose.yml
│   └── README.md                  # schema, seeding, streaming internals
├── e2e/                           # Playwright: smoke + axe, backend stubbed
├── scripts/
│   ├── check-docs.mjs             # fails when CLAUDE.md drifts from the repo
│   ├── emit-route-meta.mjs        # stamps <route>/index.html for crawlers
│   ├── gen-social-assets.mjs      # og-image + favicons
│   ├── py-tool.mjs                # resolves ruff/mypy/pytest for npm + lint-staged
│   └── serve-dist.mjs             # static server for the Playwright suites
├── docs/                          # analytics.md, README screenshots
├── .github/workflows/             # code-quality.yml, supply-chain.yml
├── pyproject.toml                 # ruff + mypy config, and the deps Vercel installs
├── .python-version                # 3.12 — the Vercel function's interpreter
├── .nvmrc                         # 22.22.3 — the Node version CI installs
└── vercel.json                    # routing + function bundling
```
