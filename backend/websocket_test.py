"""
WebSocket client test script
Tests the real-time WebSocket connection to the backend
"""

import asyncio
import websockets
import json
from datetime import datetime


async def test_websocket():
    """Connect to WebSocket and receive real-time metrics"""
    uri = "ws://localhost:8000/ws"
    
    print("=" * 60)
    print("WebSocket Connection Test")
    print("=" * 60)
    print(f"Connecting to: {uri}")
    print("Press Ctrl+C to stop\n")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected successfully!")
            print("\nReceiving real-time metrics...\n")
            
            count = 0
            while True:
                # Receive message
                message = await websocket.recv()
                data = json.loads(message)
                
                count += 1
                timestamp = datetime.now().strftime("%H:%M:%S")
                
                print(f"[{timestamp}] Update #{count}")
                print(f"  Active Users: {data['activeUsers']}")
                print(f"  Revenue: ${data['revenue']:,.2f}")
                print(f"  Requests: {data['requests']}")
                print(f"  Uptime: {data['uptime']}%")
                print("-" * 60)
                
    except websockets.exceptions.WebSocketException as e:
        print(f"❌ WebSocket error: {e}")
        print("\nMake sure the backend server is running:")
        print("  cd backend")
        print("  python main.py")
    except KeyboardInterrupt:
        print("\n\n👋 Disconnected. Received", count, "updates.")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")


if __name__ == "__main__":
    asyncio.run(test_websocket())
