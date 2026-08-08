# 🚀 Get Started with Your Real-Time Dashboard

Welcome to your full-stack EtherealHotel real-time dashboard! This guide will get you up and running in minutes.

## ⚡ Super Quick Start (1 Command!)

```bash
start-dev.bat
```

That's it! This will:
1. Start the Python backend server
2. Start the Angular frontend server
3. Open your browser to the dashboard

**Done!** Your real-time dashboard is now running! 🎉

---

## 📋 Manual Start (Step by Step)

If you prefer to start things manually or want to understand what's happening:

### Step 1: Start the Backend

Open a terminal and run:

```bash
cd backend
run.bat
```

**What you'll see:**
```
========================================
EtherealHotel Dashboard Backend
========================================

Activating virtual environment...
Starting FastAPI server...

🚀 EtherealHotel Dashboard API started
📊 WebSocket server ready at ws://localhost:8000/ws
🌐 REST API ready at http://localhost:8000
INFO:     Uvicorn running on http://0.0.0.0:8000
```

✅ **Backend is ready!**

### Step 2: Start the Frontend

Open a **new terminal** (keep the first one running) and run:

```bash
npm start
```

**What you'll see:**
```
> ethereal-hotel@0.0.0 start
> ng serve

✔ Browser application bundle generation complete.

Initial chunk files | Names          |  Raw size
polyfills.js        | polyfills      | 83.59 kB  | 
main.js             | main           | 14.53 kB  | 
styles.css          | styles         |  1.20 kB  | 

Application bundle generation complete. [1.234 seconds]

Watch mode enabled. Watching for file changes...
➜  Local:   http://localhost:4200/
```

✅ **Frontend is ready!**

### Step 3: Open the Dashboard

Visit: **http://localhost:4200**

You should see your dashboard with metrics updating every 2 seconds!

---

## ✅ Verify Everything is Working

### Check the Backend

1. **Health Check**: http://localhost:8000
   - Should show API information

2. **API Docs**: http://localhost:8000/docs
   - Interactive API documentation

3. **Test Endpoint**: http://localhost:8000/api/metrics
   - Should return current metrics JSON

### Check the Frontend

1. **Dashboard**: http://localhost:4200
   - Should show metrics cards and charts

2. **Browser Console** (F12):
   - Should show: `✅ WebSocket connected to backend`
   - If you see warnings, the backend might not be running

### Check the Connection

Open your browser's developer tools (F12) and check:

1. **Console Tab**:
   ```
   ✅ Using real backend data
   ✅ WebSocket connected to backend
   ```

2. **Network Tab** → **WS** (WebSocket):
   - Should show active WebSocket connection
   - Messages flowing every 2 seconds

---

## 🧪 Test the System

### Test the REST API

```bash
cd backend
python test_api.py
```

**Expected output:**
```
==================================================
EtherealHotel Dashboard API Tests
==================================================

Testing health endpoint...
Status: 200
Response: {
  "status": "online",
  "service": "EtherealHotel Dashboard API",
  ...
}

✅ All tests passed!
```

### Test the WebSocket

```bash
cd backend
python websocket_test.py
```

**Expected output:**
```
============================================================
WebSocket Connection Test
============================================================
Connecting to: ws://localhost:8000/ws

✅ Connected successfully!

Receiving real-time metrics...

[10:30:15] Update #1
  Active Users: 1247
  Revenue: $18,500.50
  Requests: 687
  Uptime: 99.92%
------------------------------------------------------------
[10:30:17] Update #2
  Active Users: 1189
  Revenue: $17,234.75
  Requests: 652
  Uptime: 99.95%
------------------------------------------------------------
```

Press `Ctrl+C` to stop.

---

## 🎯 What You Should See

### Backend Terminal
```
🚀 EtherealHotel Dashboard API started
📊 WebSocket server ready at ws://localhost:8000/ws
🌐 REST API ready at http://localhost:8000
INFO:     Started server process [12345]
INFO:     Uvicorn running on http://0.0.0.0:8000

Client connected. Total connections: 1
```

### Frontend Terminal
```
✔ Browser application bundle generation complete.
Watch mode enabled. Watching for file changes...
➜  Local:   http://localhost:4200/
```

### Browser Console
```
✅ Using real backend data
✅ WebSocket connected to backend
```

### Dashboard Display
- Active Users: **1,247** (updating)
- Revenue: **$18,500** (updating)
- Requests: **687/min** (updating)
- Uptime: **99.92%** (updating)

---

## 🔧 Troubleshooting

### Problem: Backend won't start

**Solution 1: Install Python**
```bash
# Check if Python is installed
python --version

# Should show Python 3.9 or higher
# If not, install from python.org
```

**Solution 2: Install dependencies**
```bash
cd backend
venv\Scripts\activate
pip install -r requirements.txt
```

**Solution 3: Check port 8000**
```bash
# See if something is using port 8000
netstat -ano | findstr :8000

# Kill the process if needed
taskkill /PID <process_id> /F
```

### Problem: Frontend won't start

**Solution 1: Install Node modules**
```bash
npm install
```

**Solution 2: Clear cache**
```bash
rm -rf node_modules
npm install
```

**Solution 3: Check port 4200**
```bash
# See if something is using port 4200
netstat -ano | findstr :4200
```

### Problem: Frontend shows mock data

**This means the backend is not connected.**

**Check:**
1. Is backend running? Visit http://localhost:8000
2. Check browser console for errors
3. Verify backend terminal shows "Client connected"

**Fix:**
1. Restart backend: `cd backend && run.bat`
2. Refresh browser (F5)
3. Check console for `✅ WebSocket connected`

### Problem: WebSocket disconnects

**Solution:**
1. Check firewall settings
2. Restart both servers
3. Check for proxy interference
4. Try different browser

---

## 📱 URLs Reference

### Backend URLs
| URL | Purpose |
|-----|---------|
| http://localhost:8000 | Health check |
| http://localhost:8000/api/metrics | Current metrics |
| http://localhost:8000/api/dashboard | Full dashboard data |
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:8000/redoc | ReDoc API docs |
| ws://localhost:8000/ws | WebSocket connection |

### Frontend URLs
| URL | Purpose |
|-----|---------|
| http://localhost:4200 | Main dashboard |
| http://localhost:4200/booking | Projects section |
| http://localhost:4200/crm | Experience section |
| http://localhost:4200/concierge | Skills section |

---

## 🎓 Next Steps

### Explore the API
Visit http://localhost:8000/docs and try:
1. Click "GET /api/metrics"
2. Click "Try it out"
3. Click "Execute"
4. See the response!

### Modify the Data
Edit `backend/main.py` and change the `generate_metrics()` function:
```python
def generate_metrics() -> Metrics:
    return Metrics(
        activeUsers=random.randint(2000, 3000),  # Change these ranges!
        revenue=round(random.uniform(25000, 35000), 2),
        requests=random.randint(800, 1000),
        uptime=round(99.9 + random.random() * 0.1, 2),
        timestamp=datetime.now().isoformat()
    )
```

The server auto-reloads and you'll see new data ranges immediately!

### Add a New Endpoint
Add to `backend/main.py`:
```python
@app.get("/api/hello")
async def hello():
    return {"message": "Hello from your custom endpoint!"}
```

Test it: http://localhost:8000/api/hello

### Connect a Database
Add database integration (PostgreSQL, MongoDB, etc.):
```python
from sqlalchemy import create_engine

engine = create_engine('postgresql://user:pass@localhost/dbname')
```

---

## 📚 Documentation

- **[BACKEND_SETUP.md](BACKEND_SETUP.md)** - Detailed backend setup
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture
- **[BEFORE_AND_AFTER.md](BEFORE_AND_AFTER.md)** - What changed
- **[backend/README.md](backend/README.md)** - Backend reference
- **[backend/QUICK_START.md](backend/QUICK_START.md)** - Quick commands

---

## 🎉 You're All Set!

Your real-time dashboard is now running with:
- ✅ Python FastAPI backend
- ✅ Angular frontend
- ✅ WebSocket real-time updates
- ✅ REST API endpoints
- ✅ Interactive API documentation
- ✅ Professional architecture

### Final Checklist

- [ ] Backend running on port 8000
- [ ] Frontend running on port 4200
- [ ] Dashboard visible in browser
- [ ] Metrics updating every 2 seconds
- [ ] Browser console shows "✅ WebSocket connected"
- [ ] No errors in terminals

**All checked? Congratulations! 🎊**

---

## 🚀 Development Workflow

### Day-to-Day Usage

1. **Start development**:
   ```bash
   start-dev.bat
   ```

2. **Make changes**:
   - Frontend: Edit files in `src/app/`
   - Backend: Edit `backend/main.py`
   - Both auto-reload on save!

3. **Test your changes**:
   - Frontend: Automatic (Vite HMR)
   - Backend: Visit http://localhost:8000/docs

4. **Stop servers**:
   - Press `Ctrl+C` in each terminal

### Recommended Workflow

```
Terminal 1: Backend Server  → cd backend && run.bat
Terminal 2: Frontend Server → npm start
Browser:    Dashboard       → http://localhost:4200
Browser:    API Docs        → http://localhost:8000/docs
```

---

## 💡 Pro Tips

1. **Keep terminals visible** to see logs and errors
2. **Use API docs** at `/docs` for testing endpoints
3. **Check browser console** (F12) for frontend issues
4. **Backend auto-reloads** when you save changes
5. **Frontend auto-reloads** with hot module replacement

---

## 🎓 Learn More

- [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [Angular Documentation](https://angular.dev/)
- [WebSocket Guide](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

---

**Ready to build something amazing? Start coding! 💻✨**
