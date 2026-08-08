# EtherealHotel Dashboard Backend

A FastAPI-based backend providing real-time metrics via WebSocket and REST API endpoints.

## 🚀 Quick Start

```bash
# Easy way (Windows)
run.bat

# Manual way
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

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

## Data Models

### Metrics
```python
{
  "activeUsers": int,      # Number of active users (800-1300)
  "revenue": float,        # Revenue in $ (15000-20000)
  "requests": int,         # API requests per minute (500-700)
  "uptime": float,         # System uptime % (99.8-100)
  "timestamp": string      # ISO format timestamp
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
├── main.py              # FastAPI application
├── requirements.txt     # Python dependencies
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Integration with Angular Frontend

The backend is configured with CORS to allow requests from:
- http://localhost:4200 (Angular dev server)
- http://localhost:5173 (Vite alternative)

### Angular Service Example

```typescript
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private ws: WebSocket;

  connectWebSocket(): Observable<Metrics> {
    return new Observable(observer => {
      this.ws = new WebSocket('ws://localhost:8000/ws');

      this.ws.onmessage = (event) => {
        observer.next(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        observer.error(error);
      };

      return () => this.ws.close();
    });
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
- **WebSockets**: Real-time communication
- **Python 3.9+**: Latest Python features

## License

Part of the EtherealHotel project.
