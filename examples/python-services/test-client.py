#!/usr/bin/env python3
"""
Test Client
Demonstrates calling services and publishing messages
"""

import os
import sys

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import call_service_sync, publish_message_sync

# Set registry URL
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

def test_simple_service():
    """Test calling the simple service"""
    print("\n=== Testing simple-service ===")
    try:
        result = call_service_sync("simple-service", {"name": "Python Client"})
        print(f"✓ Response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")

def test_service_with_calls():
    """Test the service that calls other services"""
    print("\n=== Testing service-with-calls ===")
    try:
        result = call_service_sync("service-with-calls", {
            "callService": "simple-service",
            "data": "test data"
        })
        print(f"✓ Response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")

def test_pubsub_subscriber():
    """Test subscribing to a channel"""
    print("\n=== Testing pubsub-subscriber ===")
    try:
        # Subscribe to test-channel
        result = call_service_sync("pubsub-subscriber", {
            "action": "subscribe",
            "channel": "test-channel"
        })
        print(f"✓ Subscribe response: {result}")
        
        # Check status
        result = call_service_sync("pubsub-subscriber", {"action": "status"})
        print(f"✓ Status response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")

def test_publish():
    """Test publishing a message"""
    print("\n=== Testing publish ===")
    try:
        result = publish_message_sync("test-channel", {
            "message": "Hello from Python client!",
            "timestamp": "2025-01-01T00:00:00Z"
        })
        print(f"✓ Publish response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")

def test_pubsub_publisher():
    """Test the publisher service"""
    print("\n=== Testing pubsub-publisher ===")
    try:
        result = call_service_sync("pubsub-publisher", {
            "channel": "user-events",
            "message": {
                "userId": 123,
                "action": "created",
                "email": "user@example.com"
            }
        })
        print(f"✓ Response: {result}")
    except Exception as e:
        print(f"✗ Error: {e}")

if __name__ == '__main__':
    print("Micro-JS Python Test Client")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    
    # Run tests
    test_simple_service()
    test_service_with_calls()
    test_pubsub_subscriber()
    test_publish()
    test_pubsub_publisher()
    
    print("\n=== Tests complete ===")

