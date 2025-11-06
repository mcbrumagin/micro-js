# Micro-JS Client Libraries

Multi-language client libraries for the Micro-JS microservices framework.

## Overview

Micro-JS supports multiple programming languages, allowing you to build polyglot microservice architectures. All clients communicate with the same registry using a header-based HTTP protocol.

## Available Languages

### ✅ Python

Fully implemented Python client with support for all major features.

**Status:** Production Ready

**Features:**
- ✅ Service creation and registration
- ✅ Service-to-service calls
- ✅ Route creation
- ✅ Pub/sub messaging
- ✅ Subscription handling
- ✅ Async/sync APIs

**Documentation:** [python/README.md](./python/README.md)

**Quick Start:**
```python
from microjs import create_service_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

def my_service(payload):
    return {"message": f"Hello {payload.get('name')}!"}

service = create_service_sync("my_service", my_service)
```

### 🚧 Go

Coming soon.

**Status:** Planned

**Documentation:** [go/README.md](./go/README.md)

### 🚧 C#

Coming soon.

**Status:** Planned

### 🚧 Ruby

Coming soon.

**Status:** Planned

## Protocol

All language clients communicate with the Micro-JS registry using HTTP with custom headers.

### Header-Based Protocol

The protocol uses specific HTTP headers for command routing:

**Headers:**
- `micro-command`: Command type (service-call, service-register, etc.)
- `micro-service-name`: Service name
- `micro-service-location`: Service location (URL)
- `micro-pubsub-channel`: Pub/sub channel name
- `micro-registry-token`: Authentication token (optional)

**Commands:**
- `service-setup`: Request port allocation
- `service-register`: Register service
- `service-unregister`: Unregister service
- `service-call`: Call a service
- `route-register`: Register a route
- `pubsub-publish`: Publish message
- `pubsub-subscribe`: Subscribe to channel
- `pubsub-unsubscribe`: Unsubscribe from channel

### Example HTTP Request

```http
POST http://localhost:3000/ HTTP/1.1
micro-command: service-call
micro-service-name: my-service
Content-Type: application/json

{"name": "World"}
```

## Architecture

```
┌──────────────────────────────────────────┐
│           Registry Server                │
│         (Node.js - Port 3000)           │
└───────────────┬──────────────────────────┘
                │
    ┌───────────┼───────────┐
    │           │           │
┌───▼────┐  ┌──▼─────┐  ┌─▼──────┐
│ Python │  │  Node  │  │   Go   │
│Service │  │Service │  │Service │
└────────┘  └────────┘  └────────┘
```

## Creating a New Language Client

To create a client for a new language, implement the following functions:

### Core Functions

1. **createService(name, handler, options)**
   - Allocate port from registry (service-setup)
   - Start HTTP server on allocated port
   - Register service with registry (service-register)
   - Handle incoming requests (regular + pub/sub)
   - Return service object with terminate() method

2. **callService(name, payload, options)**
   - Send HTTP request to registry with service-call command
   - Include micro-service-name header
   - Return response

3. **createRoute(path, serviceNameOrHandler, dataType)**
   - Create service if handler provided
   - Register route with registry (route-register)
   - Include micro-route-path header

4. **publishMessage(channel, message)**
   - Send HTTP request to registry with pubsub-publish command
   - Include micro-pubsub-channel header

5. **createSubscription(channel, handler, options)**
   - Create HTTP server for receiving messages
   - Register subscription with registry (pubsub-subscribe)
   - Handle incoming messages from registry

### Service Context

Services should provide a context object with methods:
- `call(serviceName, payload)`: Call another service
- `publish(channel, message)`: Publish to channel
- `subscribe(channel, handler)`: Subscribe to channel
- `unsubscribe(channel, subId)`: Unsubscribe from channel

### Reference Implementation

See the Python implementation for a complete reference:
- [python/microjs.py](./python/microjs.py)

Key aspects to implement:
1. HTTP client for registry communication
2. HTTP server for receiving requests
3. Header-based command routing
4. JSON serialization/deserialization
5. Async/concurrent request handling
6. Graceful shutdown and cleanup

## Environment Variables

All clients should respect these environment variables:

- `MICRO_REGISTRY_URL`: Registry server URL (required)
  - Example: `http://localhost:3000`
- `MICRO_REGISTRY_TOKEN`: Registry authentication token (optional)
  - Used for securing registry operations

## Examples

See language-specific example directories:
- Python: `examples/python-services/`
- Go: `examples/go-services/` (coming soon)

## Testing

To test a new language client:

1. Start the registry:
```bash
node src/micro-core/registry/registry-server.js
```

2. Create a test service in your language
3. Create a Node.js service to call it
4. Verify bi-directional communication works
5. Test pub/sub functionality

## Contributing

We welcome contributions for new language clients! Please:

1. Follow the protocol specification
2. Include comprehensive examples
3. Add tests
4. Update documentation
5. Ensure compatibility with existing services

## License

Same as main Micro-JS project.

