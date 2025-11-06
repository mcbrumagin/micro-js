#!/usr/bin/env python3
"""
Simple Python Microservice Example
Demonstrates basic service creation and registration
"""

import os
import sys
import time

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import create_service_sync

# Set registry URL (assumes registry is running on localhost:3000)
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

def simple_service(payload):
    """
    A simple service that echoes back the payload with a greeting
    """
    name = payload.get('name', 'World') if isinstance(payload, dict) else 'World'
    return {
        "message": f"Hello, {name}!",
        "service": "simple-service",
        "received": payload
    }

if __name__ == '__main__':
    print("Starting simple Python service...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    
    # Create and register the service
    service = create_service_sync("simple-service", simple_service)
    
    print(f"✓ Service '{service.name}' is running at {service.location}")
    print("Press Ctrl+C to stop...")
    
    # Keep service running
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down...")
        service.terminate()
        print("Service stopped")

