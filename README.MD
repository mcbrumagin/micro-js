# micro-js

A lightweight, zero-dependency microservices framework for Node.js with built-in service discovery, pub/sub messaging, HTTP routing, and load balancing.

[![Tests](https://img.shields.io/badge/tests-67%2F67%20passing-brightgreen)]()
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## Features

✨ **Zero Dependencies** - Pure Node.js implementation  
🔍 **Service Discovery** - Automatic service registration and lookup  
📡 **Pub/Sub Messaging** - Built-in publish-subscribe pattern  
🔄 **Load Balancing** - Round-robin and random distribution strategies  
🛣️ **HTTP Routing** - Direct and wildcard route support  
💾 **Cache Service** - In-memory caching with TTL and eviction  
🧪 **Fully Tested** - 67 comprehensive tests with 100% pass rate  
📦 **Modular Architecture** - Clean, maintainable codebase  

## Installation

```sh
npm install micro-js
```

## Quick Start

```sh
export MICRO_REGISTRY_URL=http://localhost:9999
```

### Basic Service Example

```javascript
import { registryServer, createService, callService } from 'micro-js'

async function main() {
  // Start the registry
  await registryServer()

  // Create services
  await createService(function helloService(payload) {
    return { message: 'Hello, ' + payload.name }
  })

  await createService(function greetingService(payload) {
    // Call other services using this.call
    const result = await this.call('helloService', { name: 'World' })
    result.message += ' from micro-js!'
    return result
  })

  // Call a service
  const result = await callService('greetingService', {})
  console.log(result.message) // "Hello, World from micro-js!"
}

main()
```

## Core Concepts

### Service Registry

The registry server is the heart of micro-js. It automatically:
- Tracks all service instances and their locations
- Handles service registration and unregistration
- Provides service discovery and load balancing
- Routes HTTP requests to services
- Manages pub/sub subscriptions

```javascript
import { registryServer } from 'micro-js'

// Start the registry (typically once per application/cluster)
const registry = await registryServer()

// The registry automatically assigns ports starting from REGISTRY_PORT + 1
// Clean shutdown
await registry.terminate()
```

### Creating Services

Services are just functions that receive a payload and return a result:

```javascript
import { createService } from 'micro-js'

// Simple service
await createService(function calculateService(payload) {
  return { result: payload.a + payload.b }
})

// Service that calls other services
await createService(function orchestratorService(payload) {
  const result1 = await this.call('serviceA', payload)
  const result2 = await this.call('serviceB', result1)
  return result2
})
```

**Service Lifecycle:**
1. Service registers with the registry
2. Registry assigns a port and location
3. Service subscribes to registry updates
4. Service is available for calls
5. On termination, service unregisters gracefully

### HTTP Routes

Create HTTP endpoints that map to services:

```javascript
import { createRoute } from 'micro-js'

// Route with inline service
await createRoute('/api/users', function usersService(payload) {
  return { users: ['Alice', 'Bob'] }
})

// Route pointing to existing service
await createRoute('/api/greet', 'greetingService')

// Wildcard routes (controller pattern)
await createRoute('/api/users/*', function usersController(payload) {
  const { url } = payload
  // Handle /api/users/123, /api/users/profile, etc.
  return { path: url }
})

// Now visit: http://localhost:9999/api/users
```

### Pub/Sub Messaging

Built-in publish-subscribe for event-driven architectures:

```javascript
import { createPubSubService } from 'micro-js'

const pubsub = await createPubSubService()

// Subscribe to a channel
await pubsub.subscribe('orders', async (message) => {
  console.log('New order:', message)
  // Process the order
})

// Publish to a channel
await pubsub.publish('orders', {
  orderId: '12345',
  amount: 99.99
})

// Multiple subscribers on same channel
await pubsub.subscribe('orders', async (message) => {
  console.log('Analytics received:', message)
})

// Unsubscribe when done
const subId = await pubsub.subscribe('temp', handler)
await pubsub.unsubscribe('temp', subId)

// Clean shutdown
await pubsub.terminate()
```

**Pub/Sub Features:**
- Multiple subscribers per channel
- Automatic service cleanup
- Error isolation (one handler error doesn't affect others)
- Subscription tracking and management

### Cache Service

In-memory caching with automatic eviction:

```javascript
import { cacheService } from 'micro-js'

const cache = await cacheService({
  expireTime: 60000,      // Default TTL: 60 seconds
  evictionInterval: 30000  // Check every 30 seconds
})

// Use via callService
await callService('cache', {
  set: { userId123: { name: 'Alice', email: 'alice@example.com' } }
})

await callService('cache', {
  get: 'userId123'  // Returns the user object
})

// Set with custom expiration
await callService('cache', {
  setex: { sessionToken: 'abc123' },
  ex: { sessionToken: 300000 }  // Expires in 5 minutes
})

// Get all cached items
await callService('cache', { get: '*' })

// Delete items
await callService('cache', { del: { userId123: true } })

// Clear entire cache
await callService('cache', { clear: true })

// Update settings
await callService('cache', {
  settings: { evictionInterval: 60000 }
})

// Clean shutdown (clears intervals)
await cache.terminate()
```

## Load Balancing

Automatic load balancing when multiple instances of the same service exist:

```javascript
// Create multiple instances of the same service
await createService(function workerService(payload) {
  return { instance: 'A', result: payload.value * 2 }
})

await createService(function workerService(payload) {
  return { instance: 'B', result: payload.value * 2 }
})

await createService(function workerService(payload) {
  return { instance: 'C', result: payload.value * 2 }
})

// Calls are automatically distributed using round-robin
for (let i = 0; i < 6; i++) {
  const result = await callService('workerService', { value: i })
  console.log(`Call ${i}: handled by instance ${result.instance}`)
}
// Output: A, B, C, A, B, C (round-robin distribution)
```

**Load Balancing Strategies:**
- **Round-robin**: Default for `callService()` - distributes evenly
- **Random**: Used for `lookup()` - picks random instance

## Advanced Usage

### Service Communication

Services can call each other using `this.call()`:

```javascript
await createService(function dataService(payload) {
  return { data: [1, 2, 3, 4, 5] }
})

await createService(function processorService(payload) {
  const data = await this.call('dataService', {})
  return {
    total: data.data.reduce((a, b) => a + b, 0)
  }
})

await createService(function apiService(payload) {
  const processed = await this.call('processorService', {})
  const cached = await this.call('cache', { 
    setex: { lastResult: processed.total }
  })
  return processed
})
```

### Error Handling

Services can throw HTTP errors with status codes:

```javascript
import { HttpError } from 'micro-js'

await createService(function validateService(payload) {
  if (!payload.userId) {
    throw new HttpError(400, 'Missing required field: userId')
  }
  
  if (payload.userId !== 'admin') {
    throw new HttpError(403, 'Forbidden: insufficient permissions')
  }
  
  return { status: 'authorized' }
})

// Errors are automatically propagated with proper HTTP status codes
try {
  await callService('validateService', {})
} catch (err) {
  console.log(err.status)  // 400
  console.log(err.message) // "Missing required field: userId"
}
```

### Service Lookup

Query the registry for service locations:

```javascript
import { httpRequest } from 'micro-js'

// Get a random instance location
const location = await httpRequest(process.env.MICRO_REGISTRY_URL, {
  lookup: 'myService'
})
console.log(location) // "http://localhost:10001"

// Get all services
const allServices = await httpRequest(process.env.MICRO_REGISTRY_URL, {
  lookup: 'all'
})
console.log(allServices)
// {
//   myService: ['http://localhost:10001', 'http://localhost:10002'],
//   otherService: ['http://localhost:10003']
// }
```

### Health Checks

```javascript
import { httpRequest } from 'micro-js'

const health = await httpRequest(process.env.MICRO_REGISTRY_URL, {
  health: true
})
console.log(health)
// { status: 'ready', timestamp: 1234567890 }
```

### Dynamic Routes

Routes can be registered dynamically at runtime:

```javascript
import { httpRequest } from 'micro-js'

// Register a direct route
await httpRequest(process.env.MICRO_REGISTRY_URL, {
  register: {
    type: 'route',
    service: 'myService',
    path: '/api/endpoint',
    dataType: 'application/json'
  }
})

// Register a controller route (with wildcard)
await httpRequest(process.env.MICRO_REGISTRY_URL, {
  register: {
    type: 'route',
    service: 'controllerService',
    path: '/api/users/*',
    dataType: 'dynamic'  // Auto-detects content type
  }
})
```

## Architecture

### Registry Server Architecture

The registry is built with a modular architecture for maintainability and testability:

```
📁 src/micro-core/registry/
├── registry-state.js       - State management with Maps
├── content-type-detector.js - MIME type detection
├── load-balancer.js        - Service selection strategies
├── pubsub-manager.js       - Pub/sub lifecycle
├── service-registry.js     - Service CRUD operations
├── route-registry.js       - HTTP route management
├── http-route-handler.js   - Request routing
└── command-router.js       - Command dispatching
```

**Benefits:**
- Each module has single responsibility
- Easy to test and maintain
- Clear separation of concerns
- No global state pollution

### Communication Flow

```
Client Request
    ↓
Registry Server (routes by command or URL)
    ↓
[Service Discovery via Load Balancer]
    ↓
Target Service Instance
    ↓
[Service calls other services if needed]
    ↓
Response back to client
```

### Service Discovery Process

1. Service calls `createService()` with a function
2. Registry allocates a port (sequentially per domain)
3. HTTP server starts on allocated port
4. Service registers with registry (name + location)
5. Registry subscribes service to updates
6. Service is now discoverable by other services
7. Requests are load-balanced across instances

## Environment Variables

```sh
# Required - Registry server URL
export MICRO_REGISTRY_URL=http://localhost:9999

# Optional - Service-specific URL (for containerized deployments)
export MICRO_SERVICE_URL=http://myservice:8080
```

## Testing

Run the comprehensive test suite:

```sh
export MICRO_REGISTRY_URL=http://localhost:9999
npm test
```

**Test Coverage:**
- 67 tests covering all functionality
- Unit tests for registry modules
- Integration tests for services
- Route handling tests
- Pub/sub messaging tests
- Load balancing tests
- Error handling tests

## Examples

Check out the [`examples/`](./examples/) directory for more:

- **[all-in-one](./examples/all-in-one/)** - Single-file microservices setup
- **[multi-service](./examples/multi-service/)** - Kubernetes multi-container deployment
- **[pubsub-cli-example.js](./examples/pubsub-cli-example.js)** - Pub/sub demonstration

## Deployment

### Docker/Kubernetes

Each service can run in its own container:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV MICRO_REGISTRY_URL=http://registry:9999
CMD ["node", "service.js"]
```

See [`examples/multi-service/`](./examples/multi-service/) for Kubernetes deployment examples.

### Process Management

For production deployments, use a process manager:

```javascript
// Graceful shutdown
process.once('SIGINT', async () => {
  await cache.terminate()
  await pubsub.terminate()
  await registry.terminate()
  process.exit(0)
})
```

## API Reference

### Core Functions

#### `registryServer(port?: number): Promise<Server>`
Start the registry server.

#### `createService(name: string, fn: Function): Promise<Server>`
Create and register a service.

#### `callService(name: string, payload: any): Promise<any>`
Call a service by name.

#### `createRoute(path: string, service: string | Function): Promise<void>`
Register an HTTP route.

### Pub/Sub Functions

#### `createPubSubService(): Promise<PubSub>`
Create a pub/sub client.

#### `pubsub.publish(channel: string, message: any): Promise<Result>`
Publish a message to a channel.

#### `pubsub.subscribe(channel: string, handler: Function): Promise<string>`
Subscribe to a channel. Returns subscription ID.

#### `pubsub.unsubscribe(channel: string, subId: string): Promise<boolean>`
Unsubscribe from a channel.

#### `pubsub.listSubscriptions(): Object`
List all active subscriptions.

#### `pubsub.terminate(): Promise<void>`
Clean up all subscriptions and handlers.

### Cache Functions

#### `cacheService(options?: CacheOptions): Promise<Server>`
Create a cache service instance.

**CacheOptions:**
```typescript
{
  expireTime?: number      // Default TTL in ms (default: 600000)
  evictionInterval?: number // Eviction check interval in ms (default: 30000)
}
```

**Cache Commands:**
- `{ get: key }` - Get a value
- `{ get: '*' }` - Get all values
- `{ set: { key: value } }` - Set a value
- `{ setex: { key: value } }` - Set with default expiration
- `{ ex: { key: ttl } }` - Set custom expiration time
- `{ del: { key: true } }` - Delete a value
- `{ clear: true }` - Clear all values
- `{ settings: { evictionInterval: ms } }` - Update settings

## Roadmap

### v1.0 (MVP)
- [x] Service registry and discovery
- [x] HTTP routing
- [x] Pub/sub messaging
- [x] Cache service
- [x] Load balancing
- [x] Comprehensive tests
- [x] Modular architecture
- [ ] CLI tools
- [ ] Cluster failover paradigms
- [ ] Multi-container integration tests
- [ ] Production mode (no error traces)
- [ ] Basic access control

### Future
- [ ] Service mesh capabilities
- [ ] Distributed tracing
- [ ] Metrics and monitoring
- [ ] Rate limiting
- [ ] Circuit breakers
- [ ] API gateway features

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Credits

Built with ❤️ using pure Node.js - no external dependencies required.
