#!/usr/bin/env python3
"""
Pub/Sub Subscriber Service
Demonstrates subscribing to channels and handling messages
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

# Store received messages for demonstration
received_messages = []

async def message_handler(message):
    """Handler for channel messages"""
    print(f"📨 Received message: {message}")
    received_messages.append(message)
    return {"status": "processed", "timestamp": time.time()}

async def pubsub_subscriber(self, payload):
    """
    A service that can subscribe to channels
    Uses 'self' to access service context (subscribe)
    """
    action = payload.get('action', 'status')
    
    if action == 'subscribe':
        channel = payload.get('channel', 'test-channel')
        print(f"Subscribing to channel '{channel}'...")
        
        # Subscribe to channel
        sub_id = await self.subscribe(channel, message_handler)
        
        return {
            "service": "pubsub-subscriber",
            "action": "subscribed",
            "channel": channel,
            "subscriptionId": sub_id
        }
    
    elif action == 'status':
        return {
            "service": "pubsub-subscriber",
            "receivedMessages": len(received_messages),
            "messages": received_messages[-10:]  # Last 10 messages
        }
    
    else:
        return {
            "service": "pubsub-subscriber",
            "error": f"Unknown action: {action}",
            "validActions": ["subscribe", "status"]
        }

if __name__ == '__main__':
    print("Starting pubsub-subscriber service...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    print("\nThis service can subscribe to channels and track received messages")
    print("Examples:")
    print("  Subscribe: {\"action\": \"subscribe\", \"channel\": \"test-channel\"}")
    print("  Status:    {\"action\": \"status\"}")
    
    # Create and register the service
    service = create_service_sync("pubsub-subscriber", pubsub_subscriber)
    
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

