#!/bin/bash

# Quick start script for Git Bash
# Usage: ./start.sh

echo "Starting EtherealHotel Backend..."

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
source venv/Scripts/activate

# Check if dependencies are installed
if [ ! -f "venv/Scripts/fastapi.exe" ]; then
    echo "Installing dependencies..."
    pip install -r requirements.txt
fi

# Start the server
echo ""
echo "🚀 Starting FastAPI server..."
echo "Backend: http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python main.py
