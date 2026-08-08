# 🐚 Git Bash Setup Guide

Since you're using Git Bash and `ng serve`, here's how to run the backend alongside your frontend.

## 🚀 Quick Start for Git Bash Users

### Method 1: Two Terminals (Recommended)

**Terminal 1 - Backend:**
```bash
cd backend

# First time setup:
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt

# Every time after:
source venv/Scripts/activate
python main.py
```

**Terminal 2 - Frontend (your usual workflow):**
```bash
ng serve
```

### Method 2: Use NPM Scripts

I've added npm scripts for you:

**Terminal 1 - Backend:**
```bash
npm run start:backend
```

**Terminal 2 - Frontend:**
```bash
ng serve
# or
npm start
```

### Method 3: Use the Shell Script

```bash
# Make it executable (first time only)
chmod +x start-dev.sh

# Run it
./start-dev.sh
```

This starts both servers in one terminal.

## 📝 First Time Setup

Run these commands once in Git Bash:

```bash
# Navigate to backend
cd backend

# Create virtual environment
python -m venv venv

# Activate it
source venv/Scripts/activate

# Install dependencies
pip install -r requirements.txt

# Test it
python main.py
```

You should see:
```
🚀 EtherealHotel Dashboard API started
📊 WebSocket server ready at ws://localhost:8000/ws
🌐 REST API ready at http://localhost:8000
```

Press `Ctrl+C` to stop.

## 🔄 Daily Workflow

Every day when you start coding:

**Terminal 1:**
```bash
cd backend
source venv/Scripts/activate
python main.py
```

**Terminal 2:**
```bash
ng serve
```

That's it!

## ✅ Verify It's Working

1. **Backend**: Visit http://localhost:8000
2. **Frontend**: Visit http://localhost:4200
3. **Browser Console** (F12): Should show `✅ WebSocket connected to backend`

## 💡 Pro Tips

### Create an Alias

Add to your `~/.bashrc` or `~/.bash_profile`:

```bash
# EtherealHotel shortcuts
alias backend='cd ~/forest/ethereal-hotel/backend && source venv/Scripts/activate && python main.py'
alias frontend='cd ~/forest/ethereal-hotel && ng serve'
```

Then you can just type:
```bash
backend    # Starts backend
frontend   # Starts frontend
```

### Quick Backend Commands

```bash
# Activate virtual environment
source venv/Scripts/activate

# Or the short version
. venv/Scripts/activate

# Test the API
curl http://localhost:8000/api/metrics

# Test with Python script
python test_api.py
```

## 🐛 Troubleshooting

### "python: command not found"

Use `python3` instead:
```bash
python3 -m venv venv
python3 main.py
```

### "venv/Scripts/activate: No such file or directory"

Make sure you're in the backend directory:
```bash
pwd  # Should show: .../ethereal-hotel/backend
ls venv/Scripts/activate  # Should exist
```

### Virtual environment not activating

Try the full path:
```bash
source ./venv/Scripts/activate
```

Or use the alternative syntax:
```bash
. venv/Scripts/activate
```

## 📚 Cheat Sheet

```bash
# Setup (once)
cd backend
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt

# Daily use
cd backend
source venv/Scripts/activate  # Activate venv
python main.py                # Start server
# Press Ctrl+C to stop

# Testing
curl http://localhost:8000/
python test_api.py
python websocket_test.py

# Frontend (your usual)
ng serve
```

## 🎯 Summary

You don't need `start-dev.bat` - that's for Windows Command Prompt users. 

For Git Bash, just run:

**Terminal 1:**
```bash
cd backend && source venv/Scripts/activate && python main.py
```

**Terminal 2:**
```bash
ng serve
```

Done! 🎉

## 📱 URLs

- Backend: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Frontend: http://localhost:4200

---

**Happy coding in Git Bash! 🚀**
