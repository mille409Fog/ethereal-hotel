#!/bin/bash

echo "========================================"
echo "EtherealHotel Development Environment"
echo "========================================"
echo ""
echo "Starting backend and frontend servers..."
echo ""

# Function to start backend
start_backend() {
    echo "[1/2] Starting Backend Server..."
    cd backend
    
    # Create venv if it doesn't exist
    if [ ! -d "venv" ]; then
        echo "Creating virtual environment..."
        python -m venv venv
    fi
    
    # Activate virtual environment
    source venv/Scripts/activate
    
    # Install dependencies if needed
    if [ ! -f "venv/Scripts/fastapi.exe" ]; then
        echo "Installing dependencies..."
        pip install -r requirements.txt
    fi
    
    # Start server
    echo "Backend starting on http://localhost:8000"
    python main.py
}

# Start backend in background
start_backend &
BACKEND_PID=$!

# Wait a bit for backend to initialize
sleep 5

# Start frontend
echo ""
echo "[2/2] Starting Frontend Server..."
echo "Frontend starting on http://localhost:4200"
ng serve

# Cleanup function
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    exit 0
}

# Set up cleanup on script exit
trap cleanup EXIT INT TERM
