#!/usr/bin/env python3
"""
Standalone Subscription Example
Demonstrates creating a standalone subscription without a full service
"""

import os
import sys
import time

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import create_subscription_sync

# Set registry URL
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

def handle_user_events(message):
    """Handler for user events"""
    print(f"👤 User Event: {message}")
    return {"status": "processed"}

def handle_order_events(message):
    """Handler for order events"""
    print(f"🛒 Order Event: {message}")
    return {"status": "processed"}

if __name__ == '__main__':
    print("Starting standalone subscriptions...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    
    # Create subscriptions
    print("\nCreating subscriptions...")
    sub1 = create_subscription_sync("user-events", handle_user_events)
    sub2 = create_subscription_sync("order-events", handle_order_events)
    
    print(f"\n✓ Subscriptions created:")
    print(f"  user-events  → {sub1.location}")
    print(f"  order-events → {sub2.location}")
    print("\nWaiting for messages... (Press Ctrl+C to stop)")
    
    # Keep subscriptions running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        sub1.terminate()
        sub2.terminate()
        print("Subscriptions stopped")

