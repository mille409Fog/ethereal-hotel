# Backend Setup Guide

This guide will help you set up and run the Python FastAPI backend for the EtherealHotel real-time dashboard.

## 🎯 What You Get

The backend provides:
- **Real-time data streaming** via WebSocket (updates every 2 seconds)
- **REST API endpoints** for metrics and dashboard data
- **Auto-generated API documentation** (Swagger UI)
- **CORS enabled** for seamless Angular integration
- **Type-safe data validation** with Pydantic

## 📋 Prerequisites

Before you start, make sure you have:
- Python 3.9 or higher installed
- pip (Python package installer)

### Check Python Installation

```bash
python --version
# Should show Python 3.9 or higher

pip --version
# Should show pip version
```

## 🚀 Quick Start (Windows)

### Option 1: Automated Setup (Recommended)

Simply run the batch script:

```bash
cd backend
run.bat
```

This will automatically:
1. Create a virtual environment
2. Install all dependencies
3. Start the server

### Option 2: Manual Setup

If you prefer manual control:

```bash
# 1. Navigate to backend directory
cd backend

# 2. Create a virtual environment
python -m venv venv

# 3. Activate the virtual environment
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start the server
python main.py
```

## ✅ Verify Installation

Once the server starts, you should see:

```
🚀 EtherealHotel Dashboard API started
📊 WebSocket server ready at ws://localhost:8000/ws
🌐 REST API ready at http://localhost:8000
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### Test the API

Open your browser and visit:

1. **Health Check**: http://localhost:8000
   - Should show API information

2. **Interactive API Docs**: http://localhost:8000/docs
   - Test all endpoints directly from your browser

3. **Alternative Docs**: http://localhost:8000/redoc
   - Beautiful alternative documentation

### Test Endpoints Manually

```bash
# Test health endpoint
curl http://localhost:8000/

# Test metrics endpoint
curl http://localhost:8000/api/metrics

# Test dashboard endpoint
curl http://localhost:8000/api/dashboard
```

Or run the provided test script:

```bash
python test_api.py
```

## 🔌 Integration with Frontend

The Angular frontend automatically detects if the backend is running:

- ✅ **Backend available**: Uses real-time data from Python backend via WebSocket
- ⚠️ **Backend not available**: Falls back to mock data (original behavior)

### Starting Both Frontend and Backend

**Terminal 1 - Backend:**
```bash
cd backend
run.bat
```

**Terminal 2 - Frontend:**
```bash
# From project root
npm start
```

Now visit http://localhost:4200 - the dashboard will automatically connect to the backend!

## 📊 API Endpoints

### REST Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Health check and API info |
| `/api/metrics` | GET | Current metrics snapshot |
| `/api/dashboard` | GET | Full dashboard data with history |
| `/docs` | GET | Interactive API documentation |

### WebSocket Endpoint

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `/ws` | WebSocket | Real-time metrics stream (2s updates) |

## 🐛 Troubleshooting

### Issue: "Python is not recognized"

**Solution**: Install Python from [python.org](https://www.python.org/downloads/) and make sure to check "Add Python to PATH" during installation.

### Issue: "No module named 'fastapi'"

**Solution**: Make sure you activated the virtual environment and installed dependencies:
```bash
venv\Scripts\activate
pip install -r requirements.txt
```

### Issue: "Address already in use"

**Solution**: Port 8000 is already in use. Either:
- Stop the other process using port 8000
- Change the port in `main.py` (line: `port=8000`)

### Issue: Frontend not connecting to backend

**Solution**:
1. Verify backend is running: http://localhost:8000
2. Check browser console for errors
3. Verify CORS is configured correctly in `main.py`

### Issue: "WebSocket connection failed"

**Solution**:
1. Make sure the backend server is running
2. Check that no firewall is blocking port 8000
3. Try restarting both frontend and backend

## 🔧 Development Tips

### Auto-reload

The server automatically reloads when you change code files:
```python
# In main.py, this enables hot reload:
uvicorn.run("main:app", reload=True)
```

### Interactive API Testing

Use the Swagger UI at http://localhost:8000/docs to:
- Test all endpoints without writing code
- See request/response schemas
- Try different parameters

### Viewing Logs

The server logs all requests and WebSocket connections:
```
INFO:     127.0.0.1:54321 - "GET /api/metrics HTTP/1.1" 200 OK
Client connected. Total connections: 1
```

### Stopping the Server

Press `Ctrl+C` in the terminal where the server is running.

## 📦 Dependencies

The backend uses these Python packages:

- **fastapi**: Modern web framework
- **uvicorn**: ASGI server
- **pydantic**: Data validation
- **python-dotenv**: Environment variables
- **websockets**: WebSocket support

All are automatically installed via `requirements.txt`.

## 🚀 Next Steps

1. ✅ Start the backend: `cd backend && run.bat`
2. ✅ Start the frontend: `npm start`
3. ✅ Visit http://localhost:4200
4. ✅ Watch real-time data flow from backend to frontend!

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [WebSocket Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [Python Virtual Environments](https://docs.python.org/3/tutorial/venv.html)

## 🎉 Success!

Once you see the dashboard updating with data from the backend, you're all set! The WebSocket connection provides truly real-time updates every 2 seconds.

Check the browser console - you should see: `✅ WebSocket connected to backend`

Happy coding! 🚀
