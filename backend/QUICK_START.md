# Backend Quick Start Guide

## 🚀 One-Command Start

```bash
cd backend
run.bat
```

That's it! The script will:
- Create virtual environment if needed
- Install dependencies if needed
- Start the server

## 📍 Server URLs

- **REST API**: http://localhost:8000
- **WebSocket**: ws://localhost:8000/ws
- **API Docs**: http://localhost:8000/docs
- **Alt Docs**: http://localhost:8000/redoc

## 🧪 Quick Tests

### Test REST API
```bash
python test_api.py
```

### Test WebSocket
```bash
python websocket_test.py
```

### Manual Test
```bash
curl http://localhost:8000/api/metrics
```

## 📊 API Endpoints

| Endpoint | What It Does |
|----------|--------------|
| `GET /` | Health check |
| `GET /api/metrics` | Current metrics |
| `GET /api/dashboard` | Full dashboard data |
| `WS /ws` | Real-time stream |

## 🔧 Common Commands

### Start Server
```bash
python main.py
```

### Install Dependencies
```bash
pip install -r requirements.txt
```

### Activate Virtual Environment
```bash
venv\Scripts\activate
```

## 🐛 Quick Troubleshooting

**Problem**: Python not found
```bash
# Install Python 3.9+ from python.org
```

**Problem**: Module not found
```bash
venv\Scripts\activate
pip install -r requirements.txt
```

**Problem**: Port 8000 in use
```bash
# Find and kill the process
netstat -ano | findstr :8000
taskkill /PID <process_id> /F
```

## 📚 More Info

- Full docs: `README.md`
- Setup guide: `../BACKEND_SETUP.md`
- Architecture: `../ARCHITECTURE.md`

## ✅ Success Checklist

- [ ] Python 3.9+ installed
- [ ] Virtual environment created
- [ ] Dependencies installed
- [ ] Server running on port 8000
- [ ] Can access http://localhost:8000
- [ ] Frontend connects successfully

## 💡 Pro Tips

1. Keep the server terminal open
2. Check http://localhost:8000/docs for interactive testing
3. Watch the console for connection logs
4. Use `Ctrl+C` to stop the server

Happy coding! 🎉
