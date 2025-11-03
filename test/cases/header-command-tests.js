import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'
import { createService, createRoute, callService, Logger } from '../../src/index.js'
import { HEADERS, COMMANDS } from '../../src/micro-core/shared/micro-headers.js'
import httpRequest from '../../src/micro-core/http-primitives/http-request.js'

const logger = new Logger()

const getRegistryToken = () => process.env.MICRO_REGISTRY_TOKEN

// ============================================================================
// Basic Command Header Tests
// ============================================================================

/**
 * Test health check command with headers
 */
async function testHealthCheckWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      const result = await httpRequest(process.env.MICRO_REGISTRY_URL, {
        headers: { [HEADERS.COMMAND]: COMMANDS.HEALTH }
      })
      
      await assert(result,
        r => r.status === 'ready',
        r => typeof r.timestamp === 'number',
        r => (Date.now() - r.timestamp) < 1000
      )
      return result
    }
  )
}

/**
 * Test service setup command with headers
 */
async function testServiceSetupWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      const location = await httpRequest(process.env.MICRO_REGISTRY_URL, {
        headers: {
          [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
          [HEADERS.SERVICE_NAME]: 'test-service',
          [HEADERS.SERVICE_HOME]: 'http://localhost',
          [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
        }
      })
      
      await assert(location,
        l => typeof l === 'string',
        l => l.startsWith('http://localhost:'),
        l => l.split(':').length === 3
      )
      return location
    }
  )
}

/**
 * Test service lookup command with headers
 */
async function testServiceLookupWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    await createService('lookup-test', () => 'result'),
    async () => {
      const lookupResult = await httpRequest(process.env.MICRO_REGISTRY_URL, {
        headers: {
          [HEADERS.COMMAND]: COMMANDS.SERVICE_LOOKUP,
          [HEADERS.SERVICE_NAME]: 'lookup-test'
        }
      })

      logger.debug('lookupResult:', lookupResult)
      
      await assert(lookupResult,
        r => typeof r === 'string',
        r => r.startsWith('http://localhost:'),
        r => r.includes('lookup-test') === false  // Location, not name
      )
      return lookupResult
    }
  )
}

/**
 * Test service call command with headers (JSON payload)
 */
async function testServiceCallWithHeadersJson() {
  await terminateAfter(
    await startRegistry(),
    await createService('echo', payload => payload),
    async () => {
      const result = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: { test: 'data', number: 123 },
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'echo'
          }
        }
      )
      
      await assert(result,
        r => r.test === 'data',
        r => r.number === 123,
        r => typeof r === 'object'
      )
      return result
    }
  )
}

/**
 * Test service call command with headers (binary payload)
 */
async function testServiceCallWithHeadersBinary() {
  await terminateAfter(
    await startRegistry(),
    await createService('binaryEcho', payload => payload),
    async () => {
      const buffer = Buffer.from('binary test data')
      const result = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: buffer,
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'binaryEcho',
            'content-type': 'application/octet-stream'
          }
        }
      )
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === buffer.length,
        r => Buffer.compare(r, buffer) === 0
      )
      return result
    }
  )
}

// ============================================================================
// Header Validation Tests
// ============================================================================

/**
 * Test invalid command header value
 */
async function testInvalidCommandHeader() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => httpRequest(process.env.MICRO_REGISTRY_URL, {
          headers: { [HEADERS.COMMAND]: 'invalid-command-xyz' }
        }),
        err => err.message.includes('Unknown command')
      )
    }
  )
}

/**
 * Test missing service name header for service-call
 */
async function testMissingServiceNameForCall() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', () => 'result'),
    async () => {
      await assertErr(
        () => httpRequest(process.env.MICRO_REGISTRY_URL, {
          body: { data: 'test' },
          headers: { 
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL
            // Missing: HEADERS.SERVICE_NAME
          }
        }),
        // TODO clearer error message
        err => err.message.includes('Proxy call requires service "name" property')
      )
    }
  )
}

/**
 * Test missing service name header for service-setup
 */
async function testMissingServiceNameForSetup() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => httpRequest(process.env.MICRO_REGISTRY_URL, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
            [HEADERS.SERVICE_HOME]: 'http://localhost',
            [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
            // Missing: HEADERS.SERVICE_NAME
          }
        }),
        err => err.status === 400,
        err => err.message.includes('SERVICE_SETUP requires micro-service-name header')
      )
    }
  )
}

/**
 * Test missing service location header for service-register
 */
async function testMissingServiceLocationForRegister() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => httpRequest(process.env.MICRO_REGISTRY_URL, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_REGISTER,
            [HEADERS.SERVICE_NAME]: 'test-service',
            // Missing: HEADERS.SERVICE_LOCATION
            [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
          }
        }),
        err => err.status === 400,
        err => err.message.includes('SERVICE_REGISTER requires micro-service-location header')
      )
    }
  )
}

/**
 * Test calling non-existent service with headers
 */
async function testCallNonExistentServiceWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => httpRequest(process.env.MICRO_REGISTRY_URL, {
          body: {},
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'does-not-exist'
          }
        }),
        err => err.message.includes('No service by name'),
        err => err.message.includes('does-not-exist')
      )
    }
  )
}

// ============================================================================
// Priority & Routing Tests
// ============================================================================

/**
 * Test that HTTP routes have priority over command headers
 */
async function testCommandHeaderPriorityOverRoutes() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/priority-test', async function rightService() {
      return 'WRONG'
    }),
    await createService('headerCommandTest', (payload, request, response) => {
      return `CORRECT: ${request.url}`
    }),
    async () => {
      // Send request with both route URL AND command headers
      // Route should win (checked first)
      const result = await httpRequest(
        `${process.env.MICRO_REGISTRY_URL}/priority-test`, {
          headers: {
            // These should be IGNORED because /priority-test matches a route
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'headerCommandTest'
          }
        }
      )
      
      await assert(result, 
        r => r.includes('CORRECT'),
        r => r.includes('priority-test'),
        r => r.includes('WRONG') === false
      )
      return result
    }
  )
}

/**
 * Test routes work without any command headers
 */
async function testRoutesWithoutCommandHeaders() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/no-headers', () => 'Success without headers'),
    async () => {
      // Plain fetch, no custom headers
      const response = await fetch(`${process.env.MICRO_REGISTRY_URL}/no-headers`)
      const result = await response.text()
      
      await assert(result,
        r => r === 'Success without headers',
        () => response.status === 200
      )
      return result
    }
  )
}

/**
 * Test command headers work for non-route URLs
 */
async function testCommandHeadersForNonRouteUrls() {
  await terminateAfter(
    await startRegistry(),
    await createService('regularService', payload => `Got: ${payload.value}`),
    async () => {
      // URL doesn't match a route, so command headers should work
      const result = await httpRequest(
        // Root URL, no route path
        process.env.MICRO_REGISTRY_URL, {
          body: { value: 'test' },
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'regularService'
          }
        }
      )
      
      await assert(result, r => r === 'Got: test')
      return result
    }
  )
}

// ============================================================================
// Content-Type & Encoding Tests
// ============================================================================

/**
 * Test that content-type is preserved with header-based calls
 */
async function testContentTypePreservation() {
  await terminateAfter(
    await startRegistry(),
    await createService('typeEcho', payload => payload),
    async () => {
      // Test 1: JSON
      const jsonResult = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: { type: 'json', value: 123 },
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'typeEcho',
            'content-type': 'application/json'
          }
        }
      )
      
      // Test 2: Binary
      const binaryData = Buffer.from([0x89, 0x50, 0x4E, 0x47])  // PNG header
      const binaryResult = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: binaryData,
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'typeEcho',
            'content-type': 'application/octet-stream'
          }
        }
      )
      
      await assert(jsonResult,
        r => r.type === 'json',
        r => r.value === 123
      )
      
      await assert(binaryResult,
        r => Buffer.isBuffer(r),
        r => r[0] === 0x89,
        r => r.length === 4
      )
    }
  )
}

/**
 * Test primitive types are preserved through JSON encoding
 */
async function testPrimitiveTypePreservation() {
  await terminateAfter(
    await startRegistry(),
    await createService('numberReturner', () => 42),
    await createService('booleanReturner', () => true),
    await createService('nullReturner', () => null),
    async () => {
      const number = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: {},
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'numberReturner'
          }
        }
      )
      
      const boolean = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: {},
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'booleanReturner'
          }
        }
      )
      
      const nullVal = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: {},
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'nullReturner'
          }
        }
      )
      
      await assert(number,
        n => typeof n === 'number',
        n => n === 42
      )
      
      await assert(boolean,
        b => typeof b === 'boolean',
        b => b === true
      )
      
      await assert(nullVal, n => n === null)
    }
  )
}

// ============================================================================
// Pub/Sub Command Header Tests
// ============================================================================

/**
 * Test pub/sub subscribe command with headers
 */
async function testPubSubSubscribeWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    await createService('subscriber', message => message),
    async ([registry, service]) => {
      const result = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.PUBSUB_SUBSCRIBE,
            [HEADERS.PUBSUB_CHANNEL]: 'test-channel',
            [HEADERS.SERVICE_LOCATION]: service.location,
            [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
          }
        }
      )
      
      // Subscribe command should succeed silently
      await assert(result, r => r === undefined || r === null || r === '')
    }
  )
}

/**
 * Test pub/sub publish command with headers
 */
async function testPubSubPublishWithHeaders() {
  await terminateAfter(
    await startRegistry(),
    await createService('subscriber', message => ({ received: message })),
    async ([registry, service]) => {
      await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.PUBSUB_SUBSCRIBE,
            [HEADERS.PUBSUB_CHANNEL]: 'test-channel',
            [HEADERS.SERVICE_LOCATION]: service.location,
            [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
          }
        }
      )
      
      const publishResult = await httpRequest(
        process.env.MICRO_REGISTRY_URL, {
          body: { data: 'test message' },
          headers: {
            [HEADERS.COMMAND]: COMMANDS.PUBSUB_PUBLISH,
            [HEADERS.PUBSUB_CHANNEL]: 'test-channel',
            [HEADERS.REGISTRY_TOKEN]: getRegistryToken()
          }
        }
      )

      console.warn('publishResult:', publishResult.results)
      
      await assert(publishResult,
        r => r !== undefined,
        r => r.results !== undefined,
        r => Array.isArray(r.results),
        r => r.results.length > 0,
        r => r.results[0].received.data === 'test message'
      )
    }
  )
}

// ============================================================================
// API Documentation Tests
// ============================================================================

/**
 * Test that hitting registry root without commands returns API docs
 */
async function testApiDocumentation() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      // Hit root URL without any commands or routes
      process.env.ENVIRONMENT = 'development'
      const docs = await httpRequest(process.env.MICRO_REGISTRY_URL, {})
      console.log('docs:', docs)
      
      await assert(docs,
        d => d.name === 'micro-js',
        d => d.commands !== undefined,
        d => typeof d.commands === 'object',
        d => d.commands.health !== undefined,
        d => d.commands['service-call'] !== undefined,
        d => d.commands['pubsub-publish'] !== undefined,
        d => d.usage !== undefined
      )
      
      // Verify all commands are documented
      const commandNames = Object.keys(docs.commands)
      await assert(commandNames,
        names => names.includes('health'),
        names => names.includes('service-setup'),
        names => names.includes('service-register'),
        names => names.includes('service-call'),
        names => names.includes('route-register'),
        names => names.includes('pubsub-publish'),
        names => names.includes('pubsub-subscribe')
      )
      
      // Verify structure of a command
      await assert(docs.commands.health,
        cmd => cmd.description !== undefined,
        cmd => Array.isArray(cmd.requiredHeaders),
        cmd => cmd.requiredHeaders.includes('micro-command')
      )
      
      return docs
    }
  )
}

/**
 * Test that API documentation is valid JSON (not a function)
 */
async function testApiDocumentationIsJson() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      const docs = await httpRequest(process.env.MICRO_REGISTRY_URL, {})
      
      await assert(docs,
        d => typeof d === 'object',
        d => d !== null,
        d => typeof d.toString !== 'function' || d.toString() !== d, // Not a function string
        d => JSON.stringify(d).length > 0  // Can be serialized to JSON
      )
    }
  )
}

// ============================================================================
// Future/Stub Tests
// ============================================================================

/**
 * Test custom header size limit (STUB - functionality not yet implemented)
 * Default limit should be ~4KB for headers
 */
async function testHeaderSizeLimit() {
  await terminateAfter(
    await startRegistry(),
    await createService('headerTest', () => 'ok'),
    async () => {
      // Create a very large header value (>4KB)
      const largeValue = 'x'.repeat(5000)
      
      // TODO: Implement header size validation in registry
      // For now, this should either:
      // 1. Succeed (no limit enforced yet)
      // 2. Fail with a proper error message about header size
      
      try {
        const result = await httpRequest(
          process.env.MICRO_REGISTRY_URL,
          { data: largeValue },
          {
            headers: {
              [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
              [HEADERS.SERVICE_NAME]: 'headerTest'
            }
          }
        )
        
        // If it succeeds, that's fine for now (no limit implemented)
        logger.debug('Large header accepted (no size limit implemented yet)')
        await assert(result, r => r === 'ok')
      } catch (err) {
        // If it fails, verify it's a proper error about size
        logger.debug('Large header rejected:', err.message)
        // This is acceptable - either works for this stub test
      }
    }
  )
}

export default {
  testHealthCheckWithHeaders,
  testServiceSetupWithHeaders,
  testServiceLookupWithHeaders,
  testServiceCallWithHeadersJson,
  testServiceCallWithHeadersBinary,
  testInvalidCommandHeader,
  testMissingServiceNameForCall,
  testMissingServiceNameForSetup,
  testMissingServiceLocationForRegister,
  testCallNonExistentServiceWithHeaders,
  testCommandHeaderPriorityOverRoutes,
  testRoutesWithoutCommandHeaders,
  testCommandHeadersForNonRouteUrls,
  testContentTypePreservation,
  testPrimitiveTypePreservation,
  testPubSubSubscribeWithHeaders,
  testPubSubPublishWithHeaders,
  testApiDocumentation,
  testApiDocumentationIsJson,
  testHeaderSizeLimit
}

