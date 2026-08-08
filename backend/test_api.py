"""
Simple test script to verify the API is working
Run this after starting the server with: python main.py
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_health():
    """Test the health check endpoint"""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")

def test_metrics():
    """Test the metrics endpoint"""
    print("Testing metrics endpoint...")
    response = requests.get(f"{BASE_URL}/api/metrics")
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")

def test_dashboard():
    """Test the dashboard endpoint"""
    print("Testing dashboard endpoint...")
    response = requests.get(f"{BASE_URL}/api/dashboard")
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Metrics: {json.dumps(data['metrics'], indent=2)}")
    print(f"Historical Users count: {len(data['historicalUsers'])}")
    print(f"Historical Revenue count: {len(data['historicalRevenue'])}\n")

if __name__ == "__main__":
    print("=" * 50)
    print("EtherealHotel Dashboard API Tests")
    print("=" * 50 + "\n")
    
    try:
        test_health()
        test_metrics()
        test_dashboard()
        print("✅ All tests passed!")
    except requests.exceptions.ConnectionError:
        print("❌ Error: Cannot connect to the server.")
        print("Make sure the server is running: python main.py")
    except Exception as e:
        print(f"❌ Error: {e}")
