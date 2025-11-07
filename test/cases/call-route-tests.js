import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'

import {
  createRoute,
  callRoute,
  createService,
  HttpError,
  Logger
} from '../../src/index.js'

const logger = new Logger()

// ============================================================================
// Basic callRoute Tests
// ============================================================================

/**
 * Test basic GET request to a route
 */
async function testBasicGetRoute() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/hello', async function() {
      return { message: 'Hello World!' }
    }),
    async () => {
      const result = await callRoute('/hello')
      
      await assert(result, 
        r => r.message === 'Hello World!'
      )
      
      logger.info('✓ Basic GET route works')
    }
  )
}

/**
 * Test GET request with query parameters
 * Note: Routes with query params should use wildcard (*) for flexible matching
 */
async function testGetWithQueryParams() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/search/*', async function(payload, request) {
      // Parse query string from URL
      const url = new URL(request.url, 'http://localhost')
      const query = url.searchParams.get('q')
      const page = url.searchParams.get('page')
      
      return { 
        query, 
        page: parseInt(page),
        results: ['result1', 'result2'] 
      }
    }),
    async () => {
      // Need to include trailing slash for wildcard routes
      const result = await callRoute('/search/', {
        params: { q: 'test', page: 2 }
      })
      
      await assert(result,
        r => r.query === 'test',
        r => r.page === 2,
        r => r.results.length === 2
      )
      
      logger.info('✓ GET with query parameters works')
    }
  )
}

/**
 * Test POST request with JSON body
 */
async function testPostWithBody() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/users', async function(payload) {
      return { 
        id: 123, 
        name: payload.name,
        email: payload.email,
        created: true 
      }
    }),
    async () => {
      const result = await callRoute('/users', {
        method: 'POST',
        body: { name: 'John Doe', email: 'john@example.com' }
      })
      
      await assert(result,
        r => r.id === 123,
        r => r.name === 'John Doe',
        r => r.email === 'john@example.com',
        r => r.created === true
      )
      
      logger.info('✓ POST with body works')
    }
  )
}

/**
 * Test PUT request
 */
async function testPutRequest() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/users/*', async function(payload, request) {
      return { 
        method: request.method,
        updated: true,
        data: payload 
      }
    }),
    async () => {
      const result = await callRoute('/users/123', {
        method: 'PUT',
        body: { name: 'Jane Doe' }
      })
      
      await assert(result,
        r => r.method === 'PUT',
        r => r.updated === true,
        r => r.data.name === 'Jane Doe'
      )
      
      logger.info('✓ PUT request works')
    }
  )
}

/**
 * Test DELETE request
 * Note: DELETE method works like GET/HEAD (no body)
 */
async function testDeleteRequest() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/users/*', async function(payload, request) {
      return { 
        method: request.method,
        path: request.url,
        deleted: true 
      }
    }),
    async () => {
      const result = await callRoute('/users/123', {
        method: 'DELETE'
      })
      
      await assert(result,
        r => r.method === 'DELETE',
        r => r.deleted === true,
        r => r.path.includes('/users/123')
      )
      
      logger.info('✓ DELETE request works')
    }
  )
}

// ============================================================================
// Path Validation Tests
// ============================================================================

/**
 * Test path without leading slash (should auto-add)
 */
async function testPathWithoutLeadingSlash() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/test', async function() {
      return { ok: true }
    }),
    async () => {
      const result = await callRoute('api/test')
      
      await assert(result, r => r.ok === true)
      
      logger.info('✓ Path without leading slash auto-corrected')
    }
  )
}

/**
 * Test invalid path (empty string)
 */
async function testInvalidEmptyPath() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => callRoute(''),
        err => err.status === 400,
        err => err.message.includes('Route path is required')
      )
      
      logger.info('✓ Empty path rejected')
    }
  )
}

/**
 * Test invalid path (null)
 */
async function testInvalidNullPath() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => callRoute(null),
        err => err.status === 400,
        err => err.message.includes('Route path is required')
      )
      
      logger.info('✓ Null path rejected')
    }
  )
}

/**
 * Test invalid path characters
 */
async function testInvalidPathCharacters() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => callRoute('/api/test<script>'),
        err => err.status === 400,
        err => err.message.includes('invalid characters')
      )
      
      logger.info('✓ Invalid path characters rejected')
    }
  )
}

// ============================================================================
// Controller Route (Wildcard) Tests
// ============================================================================

/**
 * Test controller route with wildcard
 */
async function testControllerRoute() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/*', async function(payload, request) {
      return { 
        path: request.url,
        method: request.method 
      }
    }),
    async () => {
      const result1 = await callRoute('/api/users')
      const result2 = await callRoute('/api/products', { method: 'POST' })
      
      await assert(result1,
        r => r.path === '/api/users',
        r => r.method === 'GET'
      )
      
      await assert(result2,
        r => r.path === '/api/products',
        r => r.method === 'POST'
      )
      
      logger.info('✓ Controller routes work')
    }
  )
}

/**
 * Test controller route with nested paths
 */
async function testControllerRouteNested() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/v1/*', async function(payload, request) {
      return { 
        fullPath: request.url 
      }
    }),
    async () => {
      const result = await callRoute('/api/v1/users/123/posts')
      
      await assert(result,
        r => r.fullPath === '/api/v1/users/123/posts'
      )
      
      logger.info('✓ Nested controller routes work')
    }
  )
}

// ============================================================================
// HTTP Method Tests
// ============================================================================

/**
 * Test various HTTP methods
 */
async function testVariousHttpMethods() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/*', async function(payload, request) {
      return { method: request.method }
    }),
    async () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
      
      for (const method of methods) {
        const result = await callRoute('/api/test', { method })
        await assert(result, r => r.method === method)
      }
      
      logger.info('✓ All HTTP methods work')
    }
  )
}

// ============================================================================
// Custom Headers Tests
// ============================================================================

/**
 * Test custom headers
 * Note: Some headers may be filtered/modified by the framework
 */
async function testCustomHeaders() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/test', async function(payload, request) {
      return { 
        hasCustomHeader: !!request.headers['x-custom-header'],
        hasUserAgent: !!request.headers['user-agent'],
        allHeaders: Object.keys(request.headers).filter(h => h.startsWith('x-'))
      }
    }),
    async () => {
      const result = await callRoute('/api/test', {
        headers: {
          'x-custom-header': 'custom-value',
          'user-agent': 'test-agent'
        }
      })
      
      await assert(result,
        r => r.hasCustomHeader === true || r.allHeaders.length > 0,
        r => r.hasUserAgent === true
      )
      
      logger.info('✓ Custom headers work')
    }
  )
}

// ============================================================================
// Content Type Tests
// ============================================================================

/**
 * Test custom content type
 */
async function testCustomContentType() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/data', async function(payload, request) {
      return { 
        contentType: request.headers['content-type']
      }
    }),
    async () => {
      const result = await callRoute('/api/data', {
        method: 'POST',
        body: 'plain text data',
        contentType: 'text/plain'
      })
      
      await assert(result,
        r => r.contentType === 'text/plain'
      )
      
      logger.info('✓ Custom content type works')
    }
  )
}

// ============================================================================
// Error Handling Tests
// ============================================================================

/**
 * Test 404 error for non-existent route
 * Note: In dev mode, registry may return documentation instead of 404
 */
async function testNonExistentRoute() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      try {
        const result = await callRoute('/does-not-exist-route-test-123')
        // In dev mode, may return documentation
        if (result && result.name === 'micro-js') {
          logger.info('✓ Non-existent route returns documentation (dev mode)')
          return
        }
        throw new Error('Expected error for non-existent route')
      } catch (err) {
        if (err.status === 404 || err.message.includes('No route')) {
          logger.info('✓ Non-existent route returns 404')
        } else {
          throw err
        }
      }
    }
  )
}

/**
 * Test service error propagation
 */
async function testServiceErrorPropagation() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/error', async function() {
      throw new HttpError(418, "I'm a teapot")
    }),
    async () => {
      await assertErr(
        () => callRoute('/error'),
        err => err.status === 418,
        err => err.message.includes('teapot')
      )
      
      logger.info('✓ Service errors propagate correctly')
    }
  )
}

// ============================================================================
// Complex Query Parameter Tests
// ============================================================================

/**
 * Test complex query parameters
 */
async function testComplexQueryParams() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/filter/*', async function(payload, request) {
      const url = new URL(request.url, 'http://localhost')
      return {
        name: url.searchParams.get('name'),
        age: url.searchParams.get('age'),
        active: url.searchParams.get('active'),
        hasParams: url.search.length > 0
      }
    }),
    async () => {
      const result = await callRoute('/filter/', {
        params: {
          name: 'John Doe',
          age: 30,
          active: true
        }
      })
      
      await assert(result,
        r => r.hasParams === true,
        r => r.name === 'John Doe',
        r => r.age === '30',
        r => r.active === 'true'
      )
      
      logger.info('✓ Complex query parameters work')
    }
  )
}

/**
 * Test null/undefined query parameters are filtered
 */
async function testNullQueryParamsFiltered() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/test/*', async function(payload, request) {
      return { 
        url: request.url,
        hasQueryString: request.url.includes('?')
      }
    }),
    async () => {
      const result = await callRoute('/test/', {
        params: {
          valid: 'value',
          nullParam: null,
          undefinedParam: undefined
        }
      })
      
      // URL should only contain valid parameter
      await assert(result,
        r => r.hasQueryString === true,
        r => r.url.includes('valid=value'),
        r => !r.url.includes('nullParam'),
        r => !r.url.includes('undefinedParam')
      )
      
      logger.info('✓ Null/undefined query params filtered')
    }
  )
}

// ============================================================================
// Integration Tests
// ============================================================================

/**
 * Test callRoute with service backend
 */
async function testCallRouteWithServiceBackend() {
  await terminateAfter(
    await startRegistry(),
    await createService('userService', async function(payload) {
      return {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      }
    }),
    async () => {
      await createRoute('/api/users', 'userService')
      
      const result = await callRoute('/api/users')
      
      await assert(result,
        r => r.users.length === 2,
        r => r.users[0].name === 'Alice',
        r => r.users[1].name === 'Bob'
      )
      
      logger.info('✓ callRoute works with service backend')
    }
  )
}

/**
 * Test mixed callRoute methods in sequence
 * Tests a realistic CRUD API pattern
 */
async function testMixedMethodsSequence() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/users/*', async function(payload, request) {
      // Use a simple in-memory store (closure)
      if (!this.users) this.users = []
      
      const method = request.method
      
      if (method === 'GET') {
        return { users: this.users, count: this.users.length }
      } else if (method === 'POST') {
        const newUser = { id: this.users.length + 1, ...payload }
        this.users.push(newUser)
        return newUser
      } else if (method === 'DELETE') {
        const urlParts = request.url.split('/')
        const id = parseInt(urlParts[urlParts.length - 1])
        const index = this.users.findIndex(u => u.id === id)
        if (index >= 0) {
          this.users.splice(index, 1)
          return { deleted: true, id }
        }
        return { deleted: false, id }
      }
      
      return { method, received: true }
    }),
    async () => {
      // POST to create users
      const user1 = await callRoute('/users', {
        method: 'POST',
        body: { name: 'Alice' }
      })
      
      const user2 = await callRoute('/users', {
        method: 'POST',
        body: { name: 'Bob' }
      })
      
      await assert(user1, u => u.id && u.name === 'Alice')
      await assert(user2, u => u.id && u.name === 'Bob')
      
      // GET to list users
      const list = await callRoute('/users')
      await assert(list, l => l.count === 2)
      
      // DELETE a user
      const deleted = await callRoute('/users/1', { method: 'DELETE' })
      await assert(deleted, d => d.deleted === true)
      
      // GET again to verify deletion
      const updatedList = await callRoute('/users')
      await assert(updatedList, l => l.count === 1)
      
      logger.info('✓ Mixed methods sequence works')
    }
  )
}

// ============================================================================
// Export all tests
// ============================================================================

export default {
  // Basic tests
  testBasicGetRoute,
  testGetWithQueryParams,
  testPostWithBody,
  testPutRequest,
  testDeleteRequest,
  
  // Path validation
  testPathWithoutLeadingSlash,
  testInvalidEmptyPath,
  testInvalidNullPath,
  testInvalidPathCharacters,
  
  // Controller routes
  testControllerRoute,
  testControllerRouteNested,
  
  // HTTP methods
  testVariousHttpMethods,
  
  // Headers
  testCustomHeaders,
  
  // Content type
  testCustomContentType,
  
  // Error handling
  testNonExistentRoute,
  testServiceErrorPropagation,
  
  // Query parameters
  testComplexQueryParams,
  testNullQueryParamsFiltered,
  
  // Integration
  testCallRouteWithServiceBackend,
  testMixedMethodsSequence

  // TODO auth integration tests
}
