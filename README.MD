# micro-js

A lightweight, zero-dependency microservices framework for Node.js with built-in service discovery, pub/sub messaging, HTTP routing, and load balancing.

[![Tests](https://img.shields.io/badge/tests-203%2F203%20passing-brightgreen)]()
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

## Features

✨ **Zero Dependencies** - Pure Node.js implementation  
🔍 **Service Discovery** - Automatic service registration and lookup  
📡 **Pub/Sub Messaging** - Built-in publish-subscribe pattern  
🔄 **Load Balancing** - Round-robin and random distribution strategies  
🛣️ **HTTP Routing** - Direct and wildcard route support  
💾 **Built-in Services** - Cache, auth, static files, and file upload services  
🌍 **Multi-Language Support** - Python client available, Go coming soon  
🧪 **Fully Tested** - Comprehensive tests with 85%+ coverage  
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

// Start the registry
await registryServer()

// Create a service
await createService(function helloService(payload) {
  return { message: 'Hello, ' + payload.name }
})

// Call the service
const result = await callService('helloService', { name: 'World' })
console.log(result.message) // "Hello, World"
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


## Built-in Services

### Cache Service

In-memory caching with automatic eviction:

```javascript
import { createCacheService } from 'micro-js/src/micro-services/cache-service.js'

const cache = await createCacheService({
  expireTime: 60000,      // Default TTL: 60 seconds
  evictionInterval: 30000  // Check every 30 seconds
})

// Use via callService
await callService('cache', { set: { userId123: { name: 'Alice' } } })
await callService('cache', { get: 'userId123' })
await callService('cache', { del: { userId123: true } })
await callService('cache', { clear: true })
```

### Pub/Sub Service

Event-driven messaging with multiple subscribers:

```javascript
import { createPubSubService } from 'micro-js/src/micro-services/pubsub-service.js'

const pubsub = await createPubSubService()

// Subscribe to events
await pubsub.subscribe('orders', async (message) => {
  console.log('New order:', message)
})

// Publish events
await pubsub.publish('orders', { orderId: '12345', amount: 99.99 })
```

### Static File Service

Serve static files with flexible routing:

```javascript
import { createStaticFileService } from 'micro-js/src/micro-services/static-file-service.js'

const staticServer = await createStaticFileService({
  rootDir: './public',
  urlRoot: '/assets',
  fileMap: {
    '/': 'index.html',
    '/styles/*': 'css',
    '/assets/*': 'public/assets'
  }
})
```

### File Upload Service

Handle multipart file uploads with validation:

```javascript
import { createFileUploadService } from 'micro-js/src/micro-services/file-upload-service/file-upload-service.js'

const uploadService = await createFileUploadService({
  uploadDir: './uploads',
  fileFieldName: 'file',
  textFields: ['title', 'description'],
  validateFile: (filename, mimetype) => {
    return mimetype.startsWith('image/')
  }
})
```

**Note:** File services require external dependencies (`busboy` for uploads), while the core framework remains dependency-free.

## Multi-Language Support

Micro-JS supports multiple programming languages, allowing you to build polyglot microservice architectures. All clients communicate with the same registry using a standard HTTP protocol.

### Python Client

Full-featured Python client with support for all core features:

```python
from microjs import create_service_sync, call_service_sync
import os

os.environ['MICRO_REGISTRY_URL'] = 'http://localhost:3000'

# Create a Python service
def my_service(payload):
    return {"message": f"Hello from Python: {payload.get('name')}!"}

service = create_service_sync("my_service", my_service)

# Call other services (Node.js or Python)
result = call_service_sync("other_service", {"data": "test"})
```

**Features:**
- ✅ Service creation and registration
- ✅ Service-to-service calls
- ✅ HTTP routes
- ✅ Pub/sub messaging
- ✅ Async/sync APIs

**Documentation:** See [languages/python/README.md](./languages/python/README.md)  
**Examples:** See [examples/python-services/](./examples/python-services/)

### Go Client (Coming Soon)

Go client library is currently in development.

**Documentation:** See [languages/go/README.md](./languages/go/README.md)

### Creating Services in Multiple Languages

Services can seamlessly communicate regardless of implementation language:

```javascript
// Node.js service
await createService(function nodeService(payload) {
  // Call Python service
  return await this.call('pythonService', payload)
})
```

```python
# Python service
async def python_service(self, payload):
    # Call Node.js service
    result = await self.call('nodeService', payload)
    return result
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

// Calls are automatically distributed using round-robin
const result1 = await callService('workerService', { value: 1 }) // → instance A
const result2 = await callService('workerService', { value: 2 }) // → instance B
```

**Strategies:** Round-robin for `callService()`, random for service lookup.

## Error Handling

Services can throw HTTP errors with status codes:

```javascript
import { HttpError } from 'micro-js'

await createService(function validateService(payload) {
  if (!payload.userId) {
    throw new HttpError(400, 'Missing required field: userId')
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

## Environment Variables

```sh
# Required - Registry server URL
export MICRO_REGISTRY_URL=http://localhost:8080

# Optional - Service-specific URL (for containerized deployments)
export MICRO_SERVICE_URL=http://myservice:10000
```



## API Reference

### Core Functions

#### `registryServer(port?: number): Promise<Server>`
Start the registry server. Port defaults to value from `MICRO_REGISTRY_URL`.

#### `createService(name: string | Function, serviceFn?: Function, options?: Object): Promise<Server>`
Create and register a service. Accepts named functions or separate name/function parameters.

#### `callService(name: string, payload: any): Promise<any>`
Call a service by name with automatic load balancing.

#### `createRoute(path: string, service: string | Function, dataType?: string): Promise<Server>`
Register an HTTP route. Supports wildcards (`/api/users/*`).

#### `publishMessage(channel: string, message: any): Promise<any>`
Publish a message to a pub/sub channel.

#### `HttpError(status: number, message: string)`
Create HTTP errors with status codes for service responses.

### Service Helper Functions

#### `createCacheService(options?: CacheOptions): Promise<Server>`
Create an in-memory cache service with TTL and eviction.

**Options:**
- `expireTime?: number` - Default TTL in ms (default: 600000)
- `evictionInterval?: number` - Eviction check interval in ms (default: 30000)

**Cache Commands (via callService):**
- `{ get: key }` - Get a value
- `{ set: { key: value } }` - Set a value  
- `{ del: { key: true } }` - Delete a value
- `{ clear: true }` - Clear all values

#### `createPubSubService(): Promise<PubSub>`
Create a pub/sub service for event-driven messaging.

**Methods:**
- `publish(channel, message)` - Publish to channel
- `subscribe(channel, handler)` - Subscribe with callback
- `unsubscribe(channel, subId)` - Remove subscription
- `terminate()` - Clean shutdown

#### `createStaticFileService(options?: StaticOptions): Promise<Server>`
Serve static files with flexible routing and security.

**Options:**
- `rootDir?: string` - Base directory (default: cwd)
- `urlRoot?: string` - URL prefix (default: '/')
- `fileMap?: Object` - URL to file mappings
- `simpleSecurity?: boolean` - Basic path traversal protection

#### `createFileUploadService(options?: UploadOptions): Promise<Server>`
Handle multipart file uploads with validation. **Requires `busboy` dependency.**

**Options:**
- `uploadDir?: string` - Upload directory (default: './uploads')
- `fileFieldName?: string` - Form field name (default: 'file')
- `textFields?: string[]` - Additional form fields to capture
- `validateFile?: Function` - File validation callback

## Roadmap

### v1.0 (MVP)
- [x] Service registry and discovery
- [x] HTTP routing
- [x] Pub/sub messaging
- [x] Cache service
- [x] Load balancing
- [x] Comprehensive tests
- [x] Modular architecture
- [x] Python client library
- [ ] Go client library
- [ ] Read-only (cache-control) support
- [ ] CLI tools
- [ ] Multi-container integration tests
- [ ] Cluster failover paradigms
- [ ] Production mode (no error traces)
- [ ] Basic access control

### Future
- [ ] Service mesh capabilities
- [ ] Distributed tracing
- [ ] Metrics and monitoring
- [ ] Rate limiting
- [ ] Circuit breakers
- [ ] API gateway features
- [ ] Additional language clients (Ruby, C#, Java, Rust)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Credits

Built with ❤️ using pure Node.js - no external dependencies required.
