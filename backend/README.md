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
pip install -r requirements.txt

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
  "version": "1.0.0",
  "endpoints": {
    "metrics": "/api/metrics",
    "dashboard": "/api/dashboard",
    "websocket": "/ws"
  }
}
```

#### `GET /api/metrics`
Get current metrics snapshot
```json
{
  "activeUsers": 1247,
  "revenue": 18500.50,
  "requests": 687,
  "uptime": 99.92,
  "timestamp": "2024-01-15T10:30:00"
}
```

#### `GET /api/dashboard`
Get complete dashboard data including historical data
```json
{
  "metrics": {
    "activeUsers": 1247,
    "revenue": 18500.50,
    "requests": 687,
    "uptime": 99.92,
    "timestamp": "2024-01-15T10:30:00"
  },
  "historicalUsers": [...],
  "historicalRevenue": [...]
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

### Booking Endpoints (demonstrate live metric changes)

```bash
# Create a booking (raises guests-in-house / revenue for today)
curl -X POST http://localhost:8000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{"guest_id":1,"room_id":1,"check_in":"2026-08-08","check_out":"2026-08-11","adults":2,"status":"checked_in","nightly_rate":500}'

# Delete a booking (restores the metrics)
curl -X DELETE http://localhost:8000/api/bookings/1
```

## Data Models

### Metrics
All fields are derived from the database. Legacy fields are kept for the existing
frontend contract; hotel-domain fields are added alongside.
```python
{
  # legacy contract
  "activeUsers": int,      # guests currently in house
  "revenue": float,        # room revenue recognized today ($)
  "requests": int,         # arrivals (check-ins) today
  "uptime": float,         # room availability % (operational / total)
  "timestamp": string,     # ISO format timestamp
  # hotel-domain fields
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
├── main.py              # FastAPI application (REST + WebSocket)
├── db/                  # Database layer
│   ├── database.py      #   engine, session, Base, init_db
│   ├── models.py        #   Room, Guest, Booking ORM models
│   ├── metrics.py       #   derive dashboard metrics from rows
│   └── seed.py          #   realistic sample-data seeder
├── alembic/             # Alembic migrations (versions/ + env.py)
├── alembic.ini          # Alembic config (DB URL resolved at runtime)
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variables template
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

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

## Testing

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
