# Micro-JS Python Client

Python client library for the Micro-JS microservices framework.

## Installation

```bash
pip install -r requirements.txt
```

## Environment Variables

Set the following environment variables:

- `MICRO_REGISTRY_URL`: URL of the registry server (e.g., `http://localhost:3000`)
- `MICRO_REGISTRY_TOKEN`: (Optional) Authentication token for the registry

## Usage

### Creating a Service

```python
from microjs import create_service_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

# Simple service
def my_service(payload):
    return {"message": f"Hello {payload.get('name', 'World')}!"}

service = create_service_sync("my_service", my_service)

# Keep service running
try:
    import time
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    service.terminate()
```

### Calling a Service

```python
from microjs import call_service_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

result = call_service_sync("my_service", {"name": "Alice"})
print(result)  # {"message": "Hello Alice!"}
```

### Creating Routes

```python
from microjs import create_route_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

# Map URL path to service
def users_handler(payload):
    return {"users": ["Alice", "Bob", "Charlie"]}

service = create_route_sync("/api/users", users_handler)

# Or map to existing service
create_route_sync("/api/orders", "order_service")

try:
    import time
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    service.terminate()
```

### Publishing Messages

```python
from microjs import publish_message_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

result = publish_message_sync("user-created", {
    "userId": 123,
    "email": "user@example.com"
})
print(result)  # {"results": [...], "errors": [...]}
```

### Subscribing to Channels

```python
from microjs import create_subscription_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

def handle_user_created(message):
    print(f"New user: {message.get('email')}")
    return {"status": "processed"}

subscription = create_subscription_sync("user-created", handle_user_created)

try:
    import time
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    subscription.terminate()
```

### Service with Context (Calling Other Services)

```python
from microjs import create_service_sync
import asyncio
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

# Service can call other services using context
async def my_service(self, payload):
    # Call another service
    result = await self.call("other_service", {"data": "test"})
    
    # Publish a message
    await self.publish("my-event", {"message": "something happened"})
    
    return {"result": result}

service = create_service_sync("my_service", my_service)

try:
    import time
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    service.terminate()
```

## Async Support

All functions have async versions without the `_sync` suffix:

```python
from microjs import create_service, call_service, publish_message
import asyncio

async def main():
    service = await create_service("my_service", lambda p: {"result": "ok"})
    result = await call_service("my_service", {})
    await publish_message("my-channel", {"data": "test"})
    service.terminate()

asyncio.run(main())
```

## API Reference

### `create_service(name_or_fn, service_fn=None, options=None)`

Creates and registers a microservice.

- **name_or_fn**: Service name (str) or function (Callable)
- **service_fn**: Service handler function (if name_or_fn is str)
- **options**: Optional configuration dict
  - `useAuthService`: Name of auth service for protected routes

Returns: `MicroService` instance with `terminate()` method

### `call_service(name, payload=None, content_type='application/json', auth_token=None)`

Calls a service by name through the registry.

- **name**: Service name to call
- **payload**: Request data (will be JSON serialized)
- **content_type**: Content type header
- **auth_token**: Optional authentication token

Returns: Service response (deserialized JSON or text)

### `create_route(path, service_name_or_fn, data_type='application/json')`

Maps a URL path to a service.

- **path**: URL path (e.g., '/api/users')
- **service_name_or_fn**: Service name or function
- **data_type**: Content type

Returns: `MicroService` instance if function provided, None otherwise

### `publish_message(channel, message)`

Publishes a message to all subscribers of a channel.

- **channel**: Channel name
- **message**: Message payload (will be JSON serialized)

Returns: Dict with 'results' and 'errors' arrays

### `create_subscription(channel, handler, options=None)`

Creates a standalone subscription to a channel.

- **channel**: Channel name
- **handler**: Message handler function
- **options**: Optional configuration dict

Returns: Subscription object with `terminate()` method

## Examples

See the `examples/python` directory for complete examples.

