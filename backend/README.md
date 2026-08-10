# EtherealHotel Dashboard Backend

A FastAPI-based backend providing real-time hotel metrics via WebSocket and REST API
endpoints. Every dashboard value is **derived from real records** (rooms, guests,
bookings) stored in a SQLite database via SQLAlchemy — not random numbers.

## 🚀 Quick Start

```bash
# Easy way (Windows)
run.bat

# Manual way
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt        # runtime only
pip install -r requirements-dev.txt    # + pytest, ruff, mypy (what CI installs)

# Create the schema and load realistic sample data
python -m alembic upgrade head
python -m db.seed --reset

python main.py
```

> On first run, `main.py` also creates the schema and seeds sample data automatically
> if the database is empty, so the manual `alembic`/`seed` steps are optional for a quick demo.

## 🗄️ Database

Persistence is provided by **SQLAlchemy** (ORM) + **Alembic** (migrations) over a local
**SQLite** file (`ethereal_hotel.db`, git-ignored). Override the location with the
`DATABASE_URL` env var (e.g. Postgres in production).

| Command | Purpose |
| --- | --- |
| `python -m alembic upgrade head` | Apply migrations / create the schema |
| `python -m alembic revision --autogenerate -m "msg"` | Generate a new migration from model changes |
| `python -m db.seed` | Seed sample data (only if empty) |
| `python -m db.seed --reset` | Wipe and reseed |

**Domain model:** `Room` (number, type, floor, rate, operational/maintenance status),
`Guest`, and `Booking` (guest ↔ room, check-in/out dates, status, rate, party size).
Metrics such as occupancy, revenue today, arrivals today, ADR, and RevPAR are computed
from these rows in [`db/metrics.py`](db/metrics.py). Adding or deleting a booking
changes the reported numbers immediately.

**Server will start at:**
- 🌐 REST API: http://localhost:8000
- 🔌 WebSocket: ws://localhost:8000/ws
- 📚 API Docs: http://localhost:8000/docs

## API Endpoints

### REST Endpoints

#### `GET /`
Health check and API information
```json
{
  "status": "online",
  "service": "EtherealHotel Dashboard API",
  "version": "2.1.0",
  "endpoints": {
    "metrics": "/api/metrics",
    "dashboard": "/api/dashboard",
    "bookings": "/api/bookings",
    "websocket": "/ws"
  }
}
```

#### `GET /api/metrics`
Get current metrics snapshot
```json
{
  "timestamp": "2026-08-10T15:27:04.033508",
  "occupancy": 85.0,
  "guestsInHouse": 77,
  "revenueToday": 16176.08,
  "arrivalsToday": 16,
  "departuresToday": 12,
  "occupiedRooms": 51,
  "availableRooms": 9,
  "operationalRooms": 60,
  "totalRooms": 64,
  "adr": 317.18,
  "revpar": 269.60
}
```

#### `GET /api/dashboard`
Get complete dashboard data including the trailing 20-day series
```json
{
  "metrics": { "occupancy": 85.0, "adr": 317.18, "revpar": 269.60, "...": "..." },
  "historicalGuests": [{ "timestamp": "2026-08-10", "value": 77 }],
  "historicalRevenue": [{ "timestamp": "2026-08-10", "value": 16176.08 }]
}
```

### WebSocket Endpoint

#### `WS /ws`
Real-time metrics streaming

Connect to receive metrics updates every 2 seconds:
```javascript
const ws = new WebSocket('ws://localhost:8000/ws');

ws.onmessage = (event) => {
  const metrics = JSON.parse(event.data);
  console.log('New metrics:', metrics);
};
```

A client receives one snapshot immediately on connect, then rides the shared
broadcast — see [Streaming architecture](#streaming-architecture) for why that
distinction matters.

### Booking Endpoints (demonstrate live metric changes)

```bash
# List bookings: newest stay first, paginated, optionally filtered by status
curl "http://localhost:8000/api/bookings?limit=20&offset=0&status=checked_in"

# Create a booking (raises guests-in-house / revenue for today)
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"guest_id":1,"room_id":1,"check_in":"2026-08-08","check_out":"2026-08-11","adults":2,"status":"checked_in","nightly_rate":500}'

# Delete a booking (restores the metrics)
curl -X DELETE http://localhost:8000/api/bookings/1
```

#### `GET /api/bookings`

| Query param | Type | Default | Notes |
| --- | --- | --- | --- |
| `limit` | int | `50` | 1–200 |
| `offset` | int | `0` | ≥ 0 |
| `status` | enum | *(none)* | `reserved`, `checked_in`, `checked_out`, `cancelled` |

```json
{
  "items": [{ "id": 1, "guest_id": 4, "room_id": 12, "check_in": "2026-08-10", "...": "..." }],
  "total": 1312,
  "limit": 50,
  "offset": 0
}
```

`total` is the count *before* `limit`/`offset`, so a client can render page counts
without walking the collection. Results are ordered by check-in date descending and
tie-broken on id, giving a total ordering — without one, rows can repeat or vanish
across pages.

## Streaming architecture

**One background task serves every client.** The task computes a single metrics
snapshot per tick and fans it out via `ConnectionManager.broadcast(...)`; connected
sockets do no polling of their own. Ten viewers on the live demo therefore cost the
same one query per tick as a single viewer, and a tick with nobody connected skips
the database entirely.

```
                                   ┌───────────────────────┐
   asyncio task (every 2s) ───────►│  compute_metrics(db)  │  1 query set
                                   └───────────┬───────────┘
                                               │ one snapshot
                          ┌────────────────────┼────────────────────┐
                          ▼                    ▼                    ▼
                     client A             client B             client C
```

`backend/tests/test_broadcaster.py` enforces this by counting the SQL issued against
the engine: it asserts that five connected clients produce exactly the same query
count as one, so a per-client poll cannot quietly return.

The only per-client query is the snapshot sent on connect, so a newly opened
dashboard renders immediately instead of waiting out a tick.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | local SQLite file | Swap in Postgres, etc. |
| `ALLOWED_ORIGINS` | localhost dev servers | Comma-separated CORS allowlist |
| `LOG_LEVEL` | `INFO` | Standard `logging` levels; unknown values fall back to INFO with a warning rather than failing startup |
| `BROADCAST_INTERVAL_SECONDS` | `2` | Stream cadence |

## Data Models

### Metrics
Every field is derived from the database and is a quantity a hotelier would
recognise. (The old generic `activeUsers` / `revenue` / `requests` / `uptime`
payload was retired once the dashboard rendered the domain directly.)
```python
{
  "timestamp": string,     # ISO format timestamp
  "occupancy": float,      # occupied / operational rooms (%)
  "guestsInHouse": int,
  "revenueToday": float,
  "arrivalsToday": int,
  "departuresToday": int,
  "occupiedRooms": int,
  "availableRooms": int,
  "operationalRooms": int,
  "totalRooms": int,
  "adr": float,            # average daily rate
  "revpar": float          # revenue per available room
}
```

### Historical Data
```python
{
  "timestamp": string,     # ISO format timestamp
  "value": float          # Metric value
}
```

## Development

### Interactive API Documentation

FastAPI automatically generates interactive API documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

You can test all endpoints directly from the browser!

### Project Structure

```
backend/
├── main.py              # App construction and wiring only (~80 lines)
├── config.py            # Env-driven settings + logging setup
├── schemas.py           # Pydantic request/response models (the wire contract)
├── routers/             # HTTP + WebSocket endpoints, one module per resource
│   ├── health.py        #   GET /
│   ├── metrics.py       #   GET /api/metrics, /api/dashboard
│   ├── bookings.py      #   GET/POST/DELETE /api/bookings
│   └── stream.py        #   WS /ws
├── services/            # Business logic, no FastAPI imports
│   ├── bookings.py      #   booking rules; raises domain errors
│   └── broadcaster.py   #   ConnectionManager + the shared broadcast task
├── db/                  # Database layer
│   ├── database.py      #   engine, session, Base, init_db
│   ├── models.py        #   Room, Guest, Booking ORM models
│   ├── metrics.py       #   derive dashboard metrics from rows
│   └── seed.py          #   realistic sample-data seeder
├── tests/               # pytest suite (isolated, seeded SQLite)
├── alembic/             # Alembic migrations (versions/ + env.py)
├── alembic.ini          # Alembic config (DB URL resolved at runtime)
├── requirements.txt     # Runtime dependencies (what the Docker image installs)
├── requirements-dev.txt # + pytest, ruff, mypy (what CI installs)
├── .env.example         # Environment variables template
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

> Ruff and mypy are configured in [`pyproject.toml`](../pyproject.toml) at the **repo
> root**, alongside the frontend's `eslint.config.mjs` and `.prettierrc`, and are run
> from there — `ruff check backend/`, `ruff format --check backend/`, `mypy backend/`.
> `pyrightconfig.json` is separate and serves the editor only; CI does not use it.

Routers stay thin: they validate input, delegate to `services/`, and map domain
errors onto status codes. `services/` never imports FastAPI, so the booking rules
can be exercised with a bare session and no test client.

## Integration with Angular Frontend

The backend is configured with CORS to allow requests from:
- http://localhost:4200 (Angular dev server)
- http://localhost:5173 (Vite alternative)

### Angular Service Example

The live service ([`src/app/services/dashboard-api.service.ts`](../src/app/services/dashboard-api.service.ts))
streams metrics over a **self-healing** WebSocket: it emits on a fresh `Subject`
per connection and reconnects with exponential backoff (1s → 30s cap) when the
socket drops — e.g. when the backend restarts — instead of erroring the stream
dead. A trimmed sketch of that pattern:

```typescript
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private static readonly INITIAL_RECONNECT_DELAY_MS = 1000;
  private static readonly MAX_RECONNECT_DELAY_MS = 30000;

  private ws: WebSocket | null = null;
  private metrics$: Subject<Metrics> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;

  connectWebSocket(): Observable<Metrics> {
    this.disconnectWebSocket();       // drop any previous connection/stream
    this.metrics$ = new Subject<Metrics>();
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.openSocket();
    return this.metrics$.asObservable();
  }

  private openSocket(): void {
    const metrics$ = this.metrics$;
    if (!metrics$) return;

    this.ws = new WebSocket('ws://localhost:8000/ws');
    this.ws.onopen = () => (this.reconnectAttempts = 0); // reset backoff
    this.ws.onmessage = (event) => metrics$.next(JSON.parse(event.data));
    this.ws.onerror = (error) => console.error('WebSocket error:', error);
    this.ws.onclose = () => {
      this.ws = null;
      if (this.shouldReconnect) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      DashboardService.INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      DashboardService.MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.shouldReconnect) this.openSocket();
    }, delay);
  }

  disconnectWebSocket(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;         // don't let this close trigger a reconnect
      this.ws.close();
      this.ws = null;
    }
    this.metrics$?.complete();
    this.metrics$ = null;
  }

  getMetrics(): Observable<Metrics> {
    return this.http.get<Metrics>('http://localhost:8000/api/metrics');
  }
}
```

## Production Deployment

### Using Gunicorn

```bash
pip install gunicorn

gunicorn main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Using Docker

Build and run with Docker:

```bash
# Build the image
docker build -t ethereal-hotel-backend .

# Run the container
docker run -p 8000:8000 ethereal-hotel-backend

# Or use docker-compose
docker-compose up
```

### Using Docker Compose (Recommended)

```bash
# Start the backend
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the backend
docker-compose down
```

## Testing and static analysis

```bash
# Run the automated suite (isolated, seeded SQLite — no live server needed)
pytest
```

The same three static-analysis gates CI runs, from the **repo root**:

```bash
ruff check backend/           # lint          (--fix to auto-fix)
ruff format --check backend/  # formatting    (drop --check to apply)
mypy backend/                 # types, strict
```

Or via npm from the root, which finds the tools in `venv` without activating it:

```bash
npm run code-quality:py
```

Manual pokes against a running server:

```bash
# Test health endpoint
curl http://localhost:8000/

# Test metrics endpoint
curl http://localhost:8000/api/metrics

# Test WebSocket (using wscat)
npm install -g wscat
wscat -c ws://localhost:8000/ws
```

## Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` with your configuration.

## Tech Stack

- **FastAPI**: Modern Python web framework
- **Uvicorn**: ASGI server
- **Pydantic**: Data validation
- **SQLAlchemy 2.0**: ORM / database layer
- **Alembic**: Schema migrations
- **SQLite**: Default persistence (swap via `DATABASE_URL`)
- **WebSockets**: Real-time communication
- **Python 3.9+**: Latest Python features

## License

Part of the EtherealHotel project.
