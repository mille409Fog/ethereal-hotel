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
- **Language**: Python 3.9+
- **Server**: Uvicorn (ASGI)
- **Validation**: Pydantic 2.9
- **Real-time**: WebSockets 13.1
- **API Docs**: OpenAPI (Swagger/ReDoc)

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
│   │   ├── services/                  # Shared services
│   │   │   └── dashboard-api.service.ts  # Backend integration
│   │   │
│   │   ├── booking/                   # Projects section
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
│   │   └── broadcaster.py           #   ConnectionManager + broadcast task
│   ├── db/                           # Engine, models, metrics, seeder
│   ├── tests/                        # pytest suite
│   ├── requirements.txt              # Python dependencies
│   ├── run.bat                       # Windows startup script
│   ├── Dockerfile                    # Container image
│   ├── docker-compose.yml            # Docker orchestration
│   ├── .env.example                  # Config template
│   └── README.md                     # Backend docs
│
├── .github/workflows/                # CI/CD pipelines
│   └── code-quality.yml             # Automated checks
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
    └── commitlint.config.mjs        # Commit lint rules
```

## 🔌 API Endpoints

### Backend REST API

| Endpoint | Method | Description | Response |
|----------|--------|-------------|----------|
| `/` | GET | Health check | API info |
| `/api/metrics` | GET | Current metrics | `Metrics` |
| `/api/dashboard` | GET | Full dashboard | `DashboardData` |
| `/api/bookings` | GET | List bookings (`limit`, `offset`, `status`) | `BookingPage` |
| `/api/bookings` | POST | Create a booking | `BookingOut` |
| `/api/bookings/{id}` | DELETE | Delete a booking | 204 |
| `/docs` | GET | Swagger UI | HTML |
| `/redoc` | GET | ReDoc UI | HTML |

### WebSocket Endpoint

| Endpoint | Protocol | Update Rate | Data |
|----------|----------|-------------|------|
| `/ws` | WebSocket | 2 seconds (one shared broadcast) | `Metrics` |

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

The backend allows requests from:
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

**Frontend:**
```bash
npm run build               # Outputs to dist/
```

**Backend Options:**

1. **Uvicorn (Simple)**
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

2. **Gunicorn (Multi-worker)**
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

3. **Docker (Recommended)**
```bash
docker-compose up -d
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

**Backend:**
```bash
python test_api.py         # Test REST endpoints
python websocket_test.py   # Test WebSocket
```

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
- **Husky**: Git hooks for pre-commit checks
- **Commitlint**: Conventional commit enforcement
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
