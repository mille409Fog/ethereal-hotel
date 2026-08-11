# EtherealHotel Architecture

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     EtherealHotel Dashboard                     │
│                     Real-Time Data Platform                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────┐              ┌──────────────────────┐
│                      │              │                      │
│   Frontend Layer     │◄────────────►│   Backend Layer      │
│   (Angular 22)       │   WebSocket  │   (FastAPI)          │
│   Port 4200          │   & HTTP     │   Port 8000          │
│                      │              │                      │
└──────────────────────┘              └──────────────────────┘
```

## 📦 Technology Stack

### Frontend

- **Framework**: Angular 22 (Standalone Components)
- **Language**: TypeScript 6.0
- **State Management**: RxJS 7.8
- **Visualization**: Chart.js 4.5
- **Build Tool**: Vite (via Angular CLI 22)
- **Testing**: Vitest 4.0
- **Code Quality**: ESLint + Prettier + Husky

### Backend

- **Framework**: FastAPI 0.115
- **Language**: Python 3.11+
- **Server**: Uvicorn (ASGI)
- **Validation**: Pydantic 2.9
- **Real-time**: WebSockets 13.1
- **API Docs**: OpenAPI (Swagger/ReDoc)
- **Code Quality**: Ruff (lint + format) + mypy (strict) + pytest

## 🔄 Data Flow Architecture

### Real-Time Updates (Primary)

A **single background task** owns the stream. It computes one metrics snapshot per
tick from the database and fans it out to every connected socket, so N viewers cost
the same one query per tick as a single viewer does. Connected clients never poll;
a tick with no listeners skips the database entirely.

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

### REST API (Fallback)

```
┌────────────┐                                    ┌────────────┐
│            │  GET /api/metrics                  │            │
│  Dashboard │───────────────────────────────────►│  FastAPI   │
│  Service   │                                    │  REST API  │
│            │  Response: Metrics JSON            │            │
│            │◄───────────────────────────────────│            │
└────────────┘                                    └────────────┘
```

## 📂 Project Structure

```
ethereal-hotel/
│
├── api/                                # Vercel deployment entrypoint
│   └── index.py                       # Serves backend/ as a Python function
│
├── src/                                # Frontend source
│   ├── app/
│   │   ├── dashboard/                 # Dashboard feature module
│   │   │   ├── dashboard.ts          # Main component
│   │   │   ├── dashboard.html        # Template
│   │   │   ├── dashboard.css         # Styles
│   │   │   ├── metrics-grid/         # Metrics display
│   │   │   ├── charts-section/       # Charts visualization
│   │   │   ├── dashboard-header/     # Header component
│   │   │   └── dashboard-footer/     # Footer component
│   │   │
│   │   ├── booking/                   # Booking feature module (/booking)
│   │   │   ├── booking.ts            # Reactive form + bookings list
│   │   │   ├── booking.html          # Template
│   │   │   ├── booking.css           # Styles
│   │   │   └── booking-field/        # Label/hint/error frame for one control
│   │   │
│   │   ├── services/                  # Shared services
│   │   │   ├── dashboard-api.service.ts  # Metrics + stream integration
│   │   │   └── booking-api.service.ts    # Bookings + reference data
│   │   │
│   │   ├── projects/                  # Projects section
│   │   ├── crm/                       # Experience section
│   │   ├── concierge/                 # Skills section
│   │   ├── resume/                    # Resume section
│   │   └── directives/                # Reusable directives
│   │
│   ├── styles/                        # Global styles
│   └── assets/                        # Static assets
│
├── backend/                           # Backend source
│   ├── main.py                       # App construction and wiring only
│   ├── config.py                     # Env-driven settings + logging
│   ├── schemas.py                    # Pydantic wire contract
│   ├── routers/                      # HTTP + WebSocket endpoints
│   ├── services/                     # Business logic (no FastAPI imports)
│   │   ├── bookings.py              #   booking rules
│   │   ├── reference.py             #   read-only room/guest lists
│   │   └── broadcaster.py           #   ConnectionManager + broadcast task
│   ├── db/                           # Engine, models, metrics, seeder
│   ├── tests/                        # pytest suite
│   ├── requirements.txt              # Runtime Python dependencies
│   ├── requirements-dev.txt          # + pytest, ruff, mypy
│   ├── run.bat                       # Windows startup script
│   ├── Dockerfile                    # Container image
│   ├── docker-compose.yml            # Docker orchestration
│   ├── pytest.ini                    # Test discovery (tests/ only)
│   └── README.md                     # Backend docs
│
├── .github/
│   ├── workflows/                    # CI/CD pipelines
│   │   └── code-quality.yml         # Automated checks (both languages)
│   └── dependabot.yml               # pip + npm + github-actions updates
│
├── scripts/
│   └── py-tool.mjs                   # Resolves ruff/mypy for npm + lint-staged
│
├── .husky/                           # Git hooks
│   ├── pre-commit                    # Pre-commit validation
│   └── commit-msg                    # Commit message check
│
├── Documentation
│   ├── README.md                     # Main documentation
│   ├── ARCHITECTURE.md              # This file
│   ├── ROADMAP.md                   # Planned improvements
│   └── backend/README.md            # Backend documentation
│
└── Configuration
    ├── angular.json                  # Angular config
    ├── tsconfig.json                # TypeScript config
    ├── eslint.config.mjs            # ESLint rules
    ├── .prettierrc                  # Prettier config
    ├── commitlint.config.mjs        # Commit lint rules
    ├── .python-version              # Interpreter for the Vercel function (3.12)
    ├── vercel.json                  # Routing + function bundling for the demo
    ├── pyproject.toml               # Ruff + mypy config, and the deps Vercel installs
    └── pyrightconfig.json           # Pylance/editor only — not a CI gate
```

## 🔌 API Endpoints

### Backend REST API

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
Note that this is _not_ the shape of Pydantic's own 422 — that one is raised before the handler
runs and is a list of issues located by path — so a client has to read both.

Health is mounted twice on purpose: the container is alone on its origin, so `/` is the
natural probe, while on Vercel the Angular app owns `/` and the API is only reachable beneath
`/api`. One handler, two mounts — a second endpoint would drift.

The payload carries `liveStream`, which reports whether _this_ deployment serves the socket
below, and its `endpoints` map omits `/ws` when it does not.

### WebSocket Endpoint

| Endpoint | Protocol  | Update Rate                      | Data      |
| -------- | --------- | -------------------------------- | --------- |
| `/ws`    | WebSocket | 2 seconds (one shared broadcast) | `Metrics` |

Mounted only when `create_app(live_stream=True)` — i.e. the container deployment. The
serverless demo has no process to hold a socket open and does not advertise this endpoint;
its frontend polls `/api/metrics` instead. See [Deployment Options](#-deployment-options).

## 📊 Data Models

### TypeScript (Frontend)

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

interface HistoricalData {
  timestamp: string;
  value: number;
}

interface DashboardData {
  metrics: Metrics;
  historicalGuests: HistoricalData[];
  historicalRevenue: HistoricalData[];
}
```

### Python (Backend)

```python
class Metrics(BaseModel):
    timestamp: str
    occupancy: float
    guestsInHouse: int
    revenueToday: float
    arrivalsToday: int
    departuresToday: int
    occupiedRooms: int
    availableRooms: int
    operationalRooms: int
    totalRooms: int
    adr: float
    revpar: float

class HistoricalData(BaseModel):
    timestamp: str
    value: float

class DashboardData(BaseModel):
    metrics: Metrics
    historicalGuests: list[HistoricalData]
    historicalRevenue: list[HistoricalData]
```

## 🔐 Security & CORS

### CORS Configuration

CORS only applies when the API is on a **different origin** from the page — the container
deployment. The hosted demo serves both from one Vercel origin, so the browser issues no
preflight and this middleware is never exercised there. It is still installed in both, because
`create_app()` builds one application and the container needs it.

By default the backend allows requests from:

- `http://localhost:4200` (Angular dev server)
- `http://localhost:5173` (Vite alternative)
- `http://127.0.0.1:4200`
- `http://127.0.0.1:5173`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", ...],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 🚀 Deployment Options

### Development

**Frontend:**

```bash
npm start                    # http://localhost:4200
```

**Backend:**

```bash
cd backend
python main.py              # http://localhost:8000
```

### Production

Two targets, built from the same application by the same `create_app()` factory in
`backend/main.py`. The factory takes one flag, `live_stream`, which toggles everything that
needs a long-lived process: the `/ws` endpoint, the background broadcaster feeding it, and the
startup seeding they assume.

#### 1. Serverless — the hosted demo (`live_stream=False`)

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

Consequences, all of them deliberate:

|                        | Serverless demo                  | Container                  |
| ---------------------- | -------------------------------- | -------------------------- |
| Metrics transport      | `GET /api/metrics` polling       | `/ws`, pushed every 2s     |
| `liveStream` in health | `false`                          | `true`                     |
| CORS                   | none needed (same origin)        | `ALLOWED_ORIGINS` required |
| Database               | rebuilt per cold start in `/tmp` | persistent                 |
| Writes                 | accepted, not durable            | durable                    |

The seed is fixed (`api/index.py`) so every instance derives the _same_ hotel; the bookings
are still laid out around `date.today()`, so the demo never goes stale the way a committed
snapshot would. The health endpoint reports `liveStream: false` and omits `/ws` from its
advertised surface rather than offering a socket nothing can serve.

#### 2. Container — the full stack (`live_stream=True`)

```bash
docker-compose up -d                                    # recommended
uvicorn main:app --host 0.0.0.0 --port 8000             # simple
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker # multi-worker
```

The WebSocket and shared broadcaster are features of this target. Note that the multi-worker
form gives each worker its own broadcaster and its own in-memory connection list — correct,
because each worker only fans out to the clients it holds, but it does mean the "one query per
tick" property is per worker rather than per cluster.

**Frontend:**

```bash
npm run build               # Outputs to dist/
```

## 🔄 State Management

### Frontend State Flow

```
User Action
    ↓
Component (Dashboard)
    ↓
Service (DashboardApiService)
    ↓
WebSocket/HTTP Request
    ↓
Backend API
    ↓
Response
    ↓
RxJS Observable
    ↓
Component Update
    ↓
Angular Change Detection
    ↓
DOM Update
```

### Backend Data Flow

```
Broadcaster task (one per process, 2s interval)
    ↓
compute_metrics(db) — derived from Room/Guest/Booking rows
    ↓
ConnectionManager.broadcast()
    ↓
JSON Serialization
    ↓
WebSocket.send_json() → every connected client
```

Requests follow the same layering in reverse: `routers/` validates and delegates,
`services/` applies the rules and raises domain errors, `db/` owns persistence.
Domain errors are mapped to status codes in the router, so `services/` carries no
HTTP knowledge.

## 🎨 Component Architecture

### Dashboard Component Hierarchy

```
Dashboard (Container)
├── DashboardHeader
├── MetricsGrid
│   ├── MetricCard (Active Users)
│   ├── MetricCard (Revenue)
│   ├── MetricCard (Requests)
│   └── MetricCard (Uptime)
├── ChartsSection
│   ├── LineChart (Users)
│   └── BarChart (Revenue)
└── DashboardFooter
```

## 🔧 Development Workflow

### Making Changes

**Frontend Changes:**

1. Edit component files in `src/app/`
2. Save (auto-reload via Vite)
3. View changes at http://localhost:4200

**Backend Changes:**

1. Edit `backend/main.py`
2. Save (auto-reload enabled)
3. Test at http://localhost:8000/docs

### Testing

**Frontend:**

```bash
npm test                    # Run Vitest
npm run lint               # Check code quality
npm run format:check       # Check formatting
```

**Backend** (the gates run from the repo root; `pytest` runs from `backend/`):

```bash
ruff check backend/           # Lint
ruff format --check backend/  # Formatting
mypy backend/                 # Types, strict
cd backend && pytest          # 18 tests, isolated seeded SQLite
```

Or `npm run code-quality:py` from the root to run all three gates in one command.

## 📈 Performance Considerations

### Frontend

- **Lazy Loading**: Route-based code splitting
- **OnPush Change Detection**: Optimized re-rendering
- **RxJS Memory Management**: Proper unsubscription
- **Debouncing**: Chart update optimization

### Backend

- **Async/Await**: Non-blocking I/O
- **Connection Pooling**: Efficient WebSocket management
- **Pydantic Validation**: Fast data validation
- **Uvicorn**: High-performance ASGI server

## 🧪 Testing Strategy

### Frontend Testing

- **Unit Tests**: Vitest for components and services
- **E2E Tests**: (Can be added with Playwright/Cypress)
- **Linting**: ESLint for code quality
- **Formatting**: Prettier for consistency

### Backend Testing

- **pytest suite** (`backend/tests/`): REST endpoints, WebSocket stream and the
  broadcaster, all against an isolated, deterministically seeded SQLite database
- **Broadcast fan-out**: `test_broadcaster.py` counts SQL issued against the engine
  and asserts five clients cost the same query count as one, so a per-client poll
  cannot quietly return
- **Static analysis**: `ruff check` + `ruff format --check` (lint and formatting) and
  `mypy` in strict mode, configured in `pyproject.toml` and run in the same CI job as
  pytest, so the Python half is gated exactly like the TypeScript half
- **Interactive Tests**: Swagger UI at `/docs`
- **Health Checks**: Built into Docker setup

## 🌐 Browser Support

### Frontend

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Modern browsers with ES2022+ support

### WebSocket Support

All modern browsers support WebSockets natively.

## 📚 Key Technologies Explained

### FastAPI

Modern Python web framework with automatic API documentation, type hints, and async support.

### WebSockets

Full-duplex communication protocol enabling real-time, bidirectional data flow.

### RxJS

Reactive programming library for handling asynchronous data streams in Angular.

### Pydantic

Data validation library ensuring type safety and automatic JSON serialization.

### Chart.js

Flexible charting library for creating responsive, animated visualizations.

## 🎯 Design Patterns Used

### Frontend

- **Component Pattern**: Modular, reusable UI components
- **Service Pattern**: Business logic separation
- **Observer Pattern**: RxJS observables for state
- **Singleton Pattern**: Injected services

### Backend

- **Singleton Pattern**: ConnectionManager
- **Factory Pattern**: Data generation functions
- **Middleware Pattern**: CORS handling
- **WebSocket Pattern**: Real-time communication

## ✅ Quality Assurance

### Code Quality Tools

- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **Ruff**: Python linting and formatting (replaces black/isort/flake8)
- **Mypy**: Python type checking, strict mode
- **Husky**: Git hooks for pre-commit checks (both languages, via lint-staged)
- **Commitlint**: Conventional commit enforcement
- **Dependabot**: Weekly grouped dependency updates for pip, npm and GitHub Actions
- **GitHub Actions**: CI/CD automation

### Standards

- TypeScript strict mode
- Python type hints
- Conventional commits
- REST API best practices
- WebSocket protocol compliance

## 🚀 Future Enhancements

Potential areas for expansion:

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] User authentication (JWT)
- [ ] Historical data persistence
- [ ] Alert/notification system
- [ ] Admin dashboard
- [ ] Mobile app (Ionic/React Native)
- [ ] Kubernetes deployment
- [ ] Monitoring (Prometheus/Grafana)
- [ ] Load testing
- [ ] Multi-tenant support

## 📖 Additional Resources

- [Angular Documentation](https://angular.dev/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [RxJS Documentation](https://rxjs.dev/)
- [Chart.js Documentation](https://www.chartjs.org/)

---

**Built with ❤️ using modern web technologies**
