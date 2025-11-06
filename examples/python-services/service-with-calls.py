#!/usr/bin/env python3
"""
Service with Inter-Service Communication
Demonstrates calling other services from within a service
"""

import os
import sys
import time
import asyncio

# Add parent directory to path to import microjs
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../languages/python'))

from microjs import create_service_sync, call_service

# Set registry URL
os.environ['MICRO_REGISTRY_URL'] = os.getenv('MICRO_REGISTRY_URL', 'http://localhost:3000')

async def service_with_calls(self, payload):
    """
    A service that calls another service
    Uses 'self' to access service context (call, publish, subscribe)
    """
    print(f"Received payload: {payload}")
    
    # Get target service from payload or use default
    target_service = payload.get('callService', 'simple-service')
    
    # Call another service
    print(f"Calling {target_service}...")
    try:
        result = await self.call(target_service, {
            "name": "Python Service",
            "from": "service-with-calls"
        })
        
        return {
            "service": "service-with-calls",
            "called": target_service,
            "result": result,
            "originalPayload": payload
        }
    except Exception as e:
        return {
            "service": "service-with-calls",
            "error": str(e),
            "message": f"Failed to call {target_service}"
        }

if __name__ == '__main__':
    print("Starting service-with-calls...")
    print(f"Registry URL: {os.environ['MICRO_REGISTRY_URL']}")
    print("\nThis service will call other services based on the 'callService' field in the payload")
    print("Example: {\"callService\": \"simple-service\", \"data\": \"test\"}")
    
    # Create and register the service
    service = create_service_sync("service-with-calls", service_with_calls)
    
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

