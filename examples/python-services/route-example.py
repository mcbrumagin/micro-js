#!/usr/bin/env python3
"""
Route Example
Demonstrates creating HTTP routes mapped to services
"""

import os
import sys
import time

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import create_route_sync

# Set registry URL
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

def users_handler(payload):
    """Handler for /api/users route"""
    return {
        "users": [
            {"id": 1, "name": "Alice", "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "email": "bob@example.com"},
            {"id": 3, "name": "Charlie", "email": "charlie@example.com"}
        ]
    }

def products_handler(payload):
    """Handler for /api/products route"""
    return {
        "products": [
            {"id": 101, "name": "Widget", "price": 9.99},
            {"id": 102, "name": "Gadget", "price": 19.99},
            {"id": 103, "name": "Doohickey", "price": 29.99}
        ]
    }

if __name__ == '__main__':
    print("Starting route examples...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    
    # Create routes
    print("\nCreating routes...")
    service1 = create_route_sync("/api/users", users_handler)
    service2 = create_route_sync("/api/products", products_handler)
    
    print(f"\n✓ Routes created:")
    print(f"  GET/POST {os.environ['MICRO_REGISTRY_URL']}/api/users")
    print(f"  GET/POST {os.environ['MICRO_REGISTRY_URL']}/api/products")
    print("\nPress Ctrl+C to stop...")
    
    # Keep services running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        service1.terminate()
        service2.terminate()
        print("Routes stopped")

