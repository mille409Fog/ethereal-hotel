# Connection Flow Diagram

## 🔄 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Browser (localhost:4200)                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                    Dashboard Component                      │   │
│  │                                                              │   │
│  │  1. ngOnInit()                                              │   │
│  │     └─► checkBackendHealth()                               │   │
│  │                                                              │   │
│  │  2. If Backend Available:                                   │   │
│  │     ├─► connectWebSocket()                                  │   │
│  │     └─► Subscribe to metrics stream                         │   │
│  │                                                              │   │
│  │  3. If Backend Not Available:                               │   │
│  │     └─► Use local mock data generation                      │   │
│  │                                                              │   │
│  └──────────────────────┬───────────────────────────────────────┘  │
│                         │                                            │
│                         │ WebSocket/HTTP                             │
└─────────────────────────┼────────────────────────────────────────────┘
                          │
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Python Backend (localhost:8000)                   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                      FastAPI Application                    │   │
│  │                                                              │   │
│  │  REST Endpoints:                                            │   │
│  │  ├─► GET /                  (Health check)                 │   │
│  │  ├─► GET /api/metrics       (Current snapshot)             │   │
│  │  └─► GET /api/dashboard     (Full data)                    │   │
│  │                                                              │   │
│  │  WebSocket Endpoint:                                        │   │
│  │  └─► WS /ws                                                 │   │
│  │       ├─► Accept connection                                 │   │
│  │       ├─► Add to ConnectionManager                          │   │
│  │       └─► Start 2-second update loop                        │   │
│  │            └─► generate_metrics()                           │   │
│  │                 └─► Send JSON to client                     │   │
│  │                                                              │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔌 WebSocket Connection Lifecycle

```
Frontend                           Backend
   │                                  │
   │  1. new WebSocket(url)          │
   ├─────────────────────────────────►│
   │                                  │  2. Accept connection
   │                                  │  3. Add to active connections
   │                                  │
   │  ◄─────── Connected ──────────► │
   │                                  │
   │                                  │  4. Start async loop
   │                                  │     └─► Every 2 seconds
   │  5. Receive metrics JSON        │
   │◄─────────────────────────────────│
   │                                  │
   │  6. Update UI                   │
   │                                  │
   │  7. Receive metrics JSON        │
   │◄─────────────────────────────────│
   │                                  │
   │  8. Update UI                   │
   │                                  │
   │         ... continues ...        │
   │                                  │
   │  9. Close connection            │
   ├─────────────────────────────────►│
   │                                  │  10. Remove from connections
   │                                  │
   └───────── Disconnected ──────────┘
```

## 🏃 Startup Sequence

### 1. Start Backend

```
run.bat
   │
   ├─► Check if venv exists
   │   └─► Create if missing
   │
   ├─► Activate virtual environment
   │
   ├─► Check if dependencies installed
   │   └─► Install if missing
   │
   └─► python main.py
       │
       ├─► Import FastAPI
       ├─► Configure CORS
       ├─► Register endpoints
       ├─► Start Uvicorn server
       │
       └─► Server ready on port 8000
```

### 2. Start Frontend

```
npm start
   │
   ├─► Angular CLI starts
   ├─► Vite dev server starts
   ├─► Compile TypeScript
   ├─► Bundle application
   │
   └─► Serve on port 4200
       │
       └─► Dashboard component loads
           │
           ├─► Check backend health
           │   └─► fetch('http://localhost:8000/')
           │
           ├─► If success:
           │   └─► Connect WebSocket
           │       └─► ws://localhost:8000/ws
           │
           └─► If fail:
               └─► Use mock data
```

## 📦 Data Format

### Metrics Object

```typescript
{
  activeUsers: 1247,        // Random: 800-1300
  revenue: 18500.50,        // Random: 15000-20000
  requests: 687,            // Random: 500-700
  uptime: 99.92,           // Random: 99.8-100.0
  timestamp: "2024-01-15T10:30:00Z"
}
```

### WebSocket Message

```json
{
  "activeUsers": 1247,
  "revenue": 18500.5,
  "requests": 687,
  "uptime": 99.92,
  "timestamp": "2024-01-15T10:30:00.123456"
}
```

## 🔀 Connection States

### Frontend State Machine

```
Initial State: "checking"
   │
   ├─► Backend Health Check
   │
   ├─► Success ─────────► State: "connected"
   │                          │
   │                          └─► WebSocket connects
   │                              │
   │                              ├─► Receiving data
   │                              │
   │                              └─► If error ──► State: "disconnected"
   │                                                    │
   │                                                    └─► Fallback to mock
   │
   └─► Fail ───────────► State: "disconnected"
                             │
                             └─► Use mock data
```

## 🛡️ Error Handling

### Backend Error Handling

```
WebSocket Connection
   │
   ├─► Try:
   │   ├─► Accept connection
   │   ├─► Add to manager
   │   └─► Send updates
   │
   └─► Except WebSocketDisconnect:
       └─► Remove from manager
       
   └─► Except Exception:
       ├─► Log error
       └─► Remove from manager
```

### Frontend Error Handling

```
WebSocket Connection
   │
   ├─► onopen:
   │   └─► Log success
   │
   ├─► onmessage:
   │   ├─► Parse JSON
   │   └─► Update metrics
   │
   ├─► onerror:
   │   ├─► Log error
   │   └─► Fallback to mock
   │
   └─► onclose:
       └─► Log disconnection
```

## 🔄 Fallback Mechanism

```
┌──────────────────────┐
│  Dashboard Component │
│                      │
│  checkBackendHealth()│
└──────────┬───────────┘
           │
           ▼
    Backend Available?
           │
     ┌─────┴─────┐
     │           │
    Yes         No
     │           │
     ▼           ▼
┌─────────┐  ┌──────────┐
│ Backend │  │   Mock   │
│  Mode   │  │   Mode   │
│         │  │          │
│ Real    │  │ Random   │
│ Data    │  │ Generate │
│ via WS  │  │ via RxJS │
└─────────┘  └──────────┘
```

## 🎯 Connection Monitoring

### Backend Logs

```
🚀 EtherealHotel Dashboard API started
📊 WebSocket server ready at ws://localhost:8000/ws
🌐 REST API ready at http://localhost:8000
INFO: Uvicorn running on http://0.0.0.0:8000

Client connected. Total connections: 1
Client disconnected. Total connections: 0
```

### Frontend Console

```
✅ Using real backend data
✅ WebSocket connected to backend
New metrics: {activeUsers: 1247, revenue: 18500, ...}

⚠️ Backend not available, using mock data
```

## 📊 Performance Metrics

| Metric | Value |
|--------|-------|
| WebSocket latency | <10ms (local) |
| Update frequency | 2 seconds |
| Message size | ~150 bytes |
| Connection overhead | ~1KB |
| CPU usage | <1% (idle) |

## 🔧 Development Tips

### Monitor Connections

```bash
# Backend terminal
# Watch for connection logs
Client connected. Total connections: X
```

### Test WebSocket

```bash
# Use test script
python websocket_test.py

# Or use browser console
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Debug CORS

```javascript
// Check browser console for CORS errors
// Backend must allow frontend origin
```

## ✅ Connection Checklist

- [ ] Backend server running on port 8000
- [ ] Frontend server running on port 4200
- [ ] No firewall blocking connections
- [ ] CORS configured correctly
- [ ] WebSocket protocol supported
- [ ] Browser console shows "✅ WebSocket connected"

## 🎉 Success Indicators

✅ Backend terminal shows: "Client connected"
✅ Frontend console shows: "✅ Using real backend data"
✅ Dashboard metrics updating every 2 seconds
✅ No errors in browser console
✅ Smooth data flow end-to-end

---

**Everything connected and working? You're all set! 🚀**
