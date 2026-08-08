"""
FastAPI Backend for EtherealHotel Real-Time Dashboard
Provides WebSocket and REST API endpoints for live metrics
"""

import asyncio
import json
import random
from datetime import datetime
from typing import Dict, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


# Data Models
class Metrics(BaseModel):
    """Real-time metrics data model"""
    activeUsers: int
    revenue: float
    requests: int
    uptime: float
    timestamp: str


class HistoricalData(BaseModel):
    """Historical data point for charts"""
    timestamp: str
    value: float


class DashboardData(BaseModel):
    """Complete dashboard data"""
    metrics: Metrics
    historicalUsers: List[HistoricalData]
    historicalRevenue: List[HistoricalData]


# Initialize FastAPI app
app = FastAPI(
    title="EtherealHotel Dashboard API",
    description="Real-time dashboard backend with WebSocket support",
    version="1.0.0"
)

# CORS Configuration - Allow Angular frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",  # Angular dev server
        "http://localhost:5173",  # Vite alternative
        "http://127.0.0.1:4200",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# WebSocket Connection Manager
class ConnectionManager:
    """Manages active WebSocket connections"""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"Client connected. Total connections: {len(self.active_connections)}")
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        print(f"Client disconnected. Total connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"Error sending to client: {e}")


manager = ConnectionManager()


# Data Generation Functions
def generate_metrics() -> Metrics:
    """Generate random metrics data simulating real-time changes"""
    return Metrics(
        activeUsers=random.randint(800, 1300),
        revenue=round(random.uniform(15000, 20000), 2),
        requests=random.randint(500, 700),
        uptime=round(99.8 + random.random() * 0.2, 2),
        timestamp=datetime.now().isoformat()
    )


def generate_historical_data(points: int = 10) -> List[HistoricalData]:
    """Generate historical data points for charts"""
    data = []
    base_value = random.randint(800, 1000)
    
    for i in range(points):
        value = base_value + random.randint(-50, 150)
        data.append(HistoricalData(
            timestamp=datetime.now().isoformat(),
            value=value
        ))
    
    return data


# REST API Endpoints
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "online",
        "service": "EtherealHotel Dashboard API",
        "version": "1.0.0",
        "endpoints": {
            "metrics": "/api/metrics",
            "dashboard": "/api/dashboard",
            "websocket": "/ws"
        }
    }


@app.get("/api/metrics", response_model=Metrics)
async def get_metrics():
    """Get current metrics snapshot"""
    return generate_metrics()


@app.get("/api/dashboard", response_model=DashboardData)
async def get_dashboard():
    """Get complete dashboard data including metrics and historical data"""
    return DashboardData(
        metrics=generate_metrics(),
        historicalUsers=generate_historical_data(20),
        historicalRevenue=generate_historical_data(20)
    )


# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time metrics streaming
    Sends updates every 2 seconds
    """
    await manager.connect(websocket)
    
    try:
        while True:
            # Generate and send new metrics
            metrics = generate_metrics()
            await websocket.send_json(metrics.model_dump())
            
            # Wait 2 seconds before next update
            await asyncio.sleep(2)
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)


# Background task for broadcasting to all clients
@app.on_event("startup")
async def startup_event():
    """Start background tasks on application startup"""
    print("🚀 EtherealHotel Dashboard API started")
    print("📊 WebSocket server ready at ws://localhost:8000/ws")
    print("🌐 REST API ready at http://localhost:8000")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown"""
    print("👋 Shutting down EtherealHotel Dashboard API")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
