# Python Services Quick Start

Get up and running with Python microservices in 5 minutes!

## Prerequisites

- Python 3.7+
- Node.js 20+ (for registry)
- pip

## 5-Minute Setup

### 1. Install Dependencies

```bash
cd examples/python-services
pip install requests
```

Or use the setup script:

```bash
./setup.sh
```

### 2. Start the Registry

In a new terminal:

```bash
cd ../..
node src/micro-core/registry/registry-server.js
```

You should see:
```
Registry server listening on port 3000
```

### 3. Set Environment Variable

```bash
export MICRO_REGISTRY_URL=http://localhost:3000
```

### 4. Run Your First Python Service

```bash
./simple-service.py
```

You should see:
```
Starting simple Python service...
Registry URL: http://localhost:3000
✓ Service 'simple-service' is running at http://localhost:3001
Press Ctrl+C to stop...
```

### 5. Test It!

In another terminal:

```bash
# Test with curl
curl -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: simple-service" \
  -H "Content-Type: application/json" \
  -d '{"name": "World"}'

# Expected response:
# {"message": "Hello, World!", "service": "simple-service", "received": {"name": "World"}}
```

Or use the Python test client:

```bash
python test-client.py
```

## What's Next?

### Try Service-to-Service Communication

Start multiple services and have them call each other:

```bash
# Terminal 1: Registry
node ../../src/micro-core/registry/registry-server.js

# Terminal 2: Simple service
export MICRO_REGISTRY_URL=http://localhost:3000
./simple-service.py

# Terminal 3: Service that calls other services
export MICRO_REGISTRY_URL=http://localhost:3000
./service-with-calls.py

# Terminal 4: Test
export MICRO_REGISTRY_URL=http://localhost:3000
python -c "
from microjs import call_service_sync
import os
os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'
result = call_service_sync('service-with-calls', {'callService': 'simple-service'})
print(result)
"
```

### Try Pub/Sub Messaging

```bash
# Terminal 1: Registry
node ../../src/micro-core/registry/registry-server.js

# Terminal 2: Subscriber
export MICRO_REGISTRY_URL=http://localhost:3000
./standalone-subscription.py

# Terminal 3: Publish messages
export MICRO_REGISTRY_URL=http://localhost:3000
python -c "
from microjs import publish_message_sync
import os
os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'
publish_message_sync('user-events', {'userId': 123, 'action': 'created'})
print('Message published!')
"
```

### Try Mixed Language Services

Run Node.js and Python services together:

```bash
./run-mixed-example.sh
```

This starts both Node.js and Python services and tests inter-language communication!

## Common Issues

### "MICRO_REGISTRY_URL environment variable not set"

Make sure you export the environment variable:
```bash
export MICRO_REGISTRY_URL=http://localhost:3000
```

### "Connection refused" or "Registry not detected"

Make sure the registry is running:
```bash
node ../../src/micro-core/registry/registry-server.js
```

### Port already in use

The registry automatically assigns ports. If you get conflicts, restart the registry.

### "Module not found: microjs"

Make sure you're running from the examples/python-services directory, or install the module:
```bash
pip install -e ../../languages/python
```

## Project Structure

```
examples/python-services/
├── simple-service.py              # Basic service example
├── service-with-calls.py          # Inter-service communication
├── pubsub-publisher.py            # Publishing messages
├── pubsub-subscriber.py           # Subscribing to channels
├── route-example.py               # HTTP route creation
├── standalone-subscription.py     # Standalone subscriptions
├── test-client.py                 # Test all services
├── mixed-example.js               # Node.js services
├── run-mixed-example.sh           # Run mixed demo
├── setup.sh                       # Setup script
├── README.md                      # Full documentation
└── QUICKSTART.md                  # This file
```

## Learn More

- Full documentation: [README.md](./README.md)
- Python client API: [../../languages/python/README.md](../../languages/python/README.md)
- Main project docs: [../../README.MD](../../README.MD)

## Need Help?

Check out the comprehensive [README.md](./README.md) for detailed examples and troubleshooting.

