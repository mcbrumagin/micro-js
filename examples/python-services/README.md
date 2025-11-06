# Python Microservices Examples

This directory contains example Python microservices demonstrating the Micro-JS Python client library.

## Prerequisites

1. **Start the Micro-JS Registry:**

```bash
cd /path/to/micro-js
node src/micro-core/registry/registry-server.js
# Or use: npm start
```

2. **Install Python Dependencies:**

```bash
cd examples/python-services
pip install -r ../../languages/python/requirements.txt
```

3. **Set Environment Variable:**

```bash
export MICRO_REGISTRY_URL=http://localhost:3000
```

## Examples

### 1. Simple Service

Basic service that echoes back payloads with a greeting.

```bash
python simple-service.py
```

Test it:
```bash
python test-client.py
# Or use curl:
curl -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: simple-service" \
  -H "Content-Type: application/json" \
  -d '{"name": "World"}'
```

### 2. Service with Inter-Service Calls

Demonstrates calling other services from within a service.

```bash
# Terminal 1: Start simple-service
python simple-service.py

# Terminal 2: Start service-with-calls
python service-with-calls.py

# Terminal 3: Test
python test-client.py
```

### 3. Pub/Sub Publisher

Service that publishes messages to channels.

```bash
python pubsub-publisher.py
```

Test it:
```bash
# Call the service to publish
curl -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: pubsub-publisher" \
  -H "Content-Type: application/json" \
  -d '{"channel": "test-channel", "message": {"data": "hello"}}'
```

### 4. Pub/Sub Subscriber

Service that subscribes to channels and tracks messages.

```bash
python pubsub-subscriber.py
```

Test it:
```bash
# Subscribe to a channel
curl -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: pubsub-subscriber" \
  -H "Content-Type: application/json" \
  -d '{"action": "subscribe", "channel": "test-channel"}'

# Check status
curl -X POST http://localhost:3000/api/call \
  -H "micro-command: service-call" \
  -H "micro-service-name: pubsub-subscriber" \
  -H "Content-Type: application/json" \
  -d '{"action": "status"}'
```

### 5. Route Example

Creates HTTP routes mapped to services.

```bash
python route-example.py
```

Test it:
```bash
# Access routes through registry
curl http://localhost:3000/api/users
curl http://localhost:3000/api/products
```

### 6. Standalone Subscription

Creates standalone subscriptions without a full service.

```bash
python standalone-subscription.py
```

Test it:
```bash
# Publish messages to the channels
curl -X POST http://localhost:3000/api/publish \
  -H "micro-command: pubsub-publish" \
  -H "micro-pubsub-channel: user-events" \
  -H "Content-Type: application/json" \
  -d '{"userId": 123, "action": "created"}'
```

### 7. Test Client

Comprehensive test client that calls all services.

```bash
# Start services first, then run:
python test-client.py
```

## Full Example Flow

```bash
# Terminal 1: Start registry
cd /path/to/micro-js
node src/micro-core/registry/registry-server.js

# Terminal 2: Start simple service
cd examples/python-services
export MICRO_REGISTRY_URL=http://localhost:3000
python simple-service.py

# Terminal 3: Start subscriber
export MICRO_REGISTRY_URL=http://localhost:3000
python pubsub-subscriber.py

# Terminal 4: Subscribe to channel and test
export MICRO_REGISTRY_URL=http://localhost:3000
python -c "
from microjs import call_service_sync, publish_message_sync
import os
os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

# Subscribe
result = call_service_sync('pubsub-subscriber', {'action': 'subscribe', 'channel': 'test-channel'})
print('Subscribe:', result)

# Publish a message
result = publish_message_sync('test-channel', {'message': 'Hello!'})
print('Publish:', result)

# Check status
result = call_service_sync('pubsub-subscriber', {'action': 'status'})
print('Status:', result)
"
```

## Architecture

```
┌─────────────┐
│   Registry  │ :3000
└──────┬──────┘
       │
       ├── Python Service (simple-service)
       ├── Python Service (service-with-calls) → calls → simple-service
       ├── Python Service (pubsub-publisher) → publishes → channels
       ├── Python Service (pubsub-subscriber) ← receives ← channel messages
       └── Routes (/api/users, /api/products)
```

## Development Tips

1. **Enable Debug Logging:**
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

2. **Using Async Services:**
```python
async def my_service(self, payload):
    result = await self.call("other_service", payload)
    await self.publish("my-channel", result)
    return result

service = create_service_sync("my_service", my_service)
```

3. **Error Handling:**
```python
from microjs import MicroJSError

try:
    result = call_service_sync("my_service", payload)
except MicroJSError as e:
    print(f"Error {e.status_code}: {e.message}")
```

4. **Graceful Shutdown:**
```python
import signal
import sys

def signal_handler(sig, frame):
    print('Shutting down...')
    service.terminate()
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
```

## Troubleshooting

**Service registration fails:**
- Ensure registry is running on the correct port
- Check `MICRO_REGISTRY_URL` environment variable
- Verify network connectivity

**Service calls fail:**
- Ensure target service is registered and running
- Check service names match exactly
- Review registry logs for errors

**Pub/sub messages not received:**
- Ensure subscription is registered before publishing
- Check channel names match exactly
- Verify both services are connected to same registry

## Next Steps

- Explore the full Python client API in `languages/python/README.md`
- Review the main Micro-JS documentation
- Try creating your own services
- Integrate with Node.js services for polyglot microservices

