#!/usr/bin/env python3
"""
Pub/Sub Publisher Service
Demonstrates publishing messages to channels
"""

import os
import sys
import time
import asyncio

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import create_service_sync

# Set registry URL
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

async def pubsub_publisher(self, payload):
    """
    A service that publishes messages to a channel
    Uses 'self' to access service context (publish)
    """
    channel = payload.get('channel', 'test-channel')
    message = payload.get('message', {'data': 'default message'})
    
    print(f"Publishing to channel '{channel}': {message}")
    
    # Publish message to channel
    result = await self.publish(channel, message)
    
    print(f"Publish result: {result}")
    
    return {
        "service": "pubsub-publisher",
        "channel": channel,
        "published": message,
        "result": result
    }

if __name__ == '__main__':
    print("Starting pubsub-publisher service...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    print("\nThis service publishes messages to channels based on payload")
    print("Example: {\"channel\": \"user-events\", \"message\": {\"userId\": 123}}")
    
    # Create and register the service
    service = create_service_sync("pubsub-publisher", pubsub_publisher)
    
    print(f"\n✓ Service '{service.name}' is running at {service.location}")
    print("Press Ctrl+C to stop...")
    
    # Keep service running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        service.terminate()
        print("Service stopped")

