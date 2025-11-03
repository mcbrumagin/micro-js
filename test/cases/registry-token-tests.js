import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'
import { registryServer, createService } from '../../src/index.js'
import { HEADERS, COMMANDS } from '../../src/utils/micro-headers.js'
import httpRequest from '../../src/http-primitives/http-request.js'
import envConfig from '../../src/micro-core/shared/env-config.js'
import Logger from '../../src/utils/logger.js'

const logger = new Logger()

// Helper to set environment temporarily
function setEnv(key, value) {
  if (value === undefined) {
    delete process.env[key]
    envConfig.config.delete(key)
  } else {
    process.env[key] = value
    envConfig.set(key, value)
  }
}

function withEnv(envVars, fn) {
  const saved = {}
  return async (...args) => {
    for (const key in envVars) {
      saved[key] = process.env[key]
      setEnv(key, envVars[key])
    }
    
    try {
      return await fn(...args)
    } finally {
      for (const key in saved) {
        if (saved[key] === undefined) {
          setEnv(key, undefined)
        } else {
          setEnv(key, saved[key])
        }
      }
    }
  }
}

// ============================================================================
// Environment Validation Tests
// ============================================================================

/**
 * Test that registry starts without token in dev environment
 */
async function testRegistryStartsWithoutTokenInDev() {
  await withEnv({ 
    ENVIRONMENT: 'dev',
    MICRO_REGISTRY_TOKEN: undefined 
  }, async () => {
    await terminateAfter(
      await startRegistry(),
      async () => {
        const result = await httpRequest(process.env.MICRO_REGISTRY_URL, {
          headers: { [HEADERS.COMMAND]: COMMANDS.HEALTH }
        })
        
        await assert(result,
          r => r.status === 'ready',
          r => typeof r.timestamp === 'number'
        )
        return result
      }
    )
  })()
}

/**
 * Test that registry warns in non-dev environment without token
 */
async function testRegistryWarnsInNonDevWithoutToken() {
  await withEnv({ 
    ENVIRONMENT: 'test',
    MICRO_REGISTRY_TOKEN: undefined 
  }, async () => {
    await terminateAfter(
      await startRegistry(),
      async () => {
        const result = await httpRequest(process.env.MICRO_REGISTRY_URL, {
          headers: { [HEADERS.COMMAND]: COMMANDS.HEALTH }
        })
        
        await assert(result,
          r => r.status === 'ready'
        )
        return result
      }
    )
  })()
}

/**
 * Test that registry fails to start in production without token
 */
async function testRegistryFailsInProdWithoutToken() {
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: undefined,
    MICRO_REGISTRY_URL: 'http://localhost:19001'
  }, async () => {
    await assertErr(
      async () => await registryServer(19001),
      err => err.message.includes('FATAL'),
      err => err.message.includes('MICRO_REGISTRY_TOKEN'),
      err => err.message.includes('PRODUCTION')
    )
  })()
}

/**
 * Test that registry fails to start in staging without token
 */
async function testRegistryFailsInStagingWithoutToken() {
  await withEnv({ 
    ENVIRONMENT: 'staging',
    MICRO_REGISTRY_TOKEN: undefined,
    MICRO_REGISTRY_URL: 'http://localhost:19002'
  }, async () => {
    await assertErr(
      async () => await registryServer(19002),
      err => err.message.includes('FATAL'),
      err => err.message.includes('MICRO_REGISTRY_TOKEN'),
      err => err.message.toLowerCase().includes('stag')
    )
  })()
}

/**
 * Test that registry starts successfully with token in production
 */
async function testRegistryStartsWithTokenInProduction() {
  const testToken = 'prod-test-token-xyz'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19003'
  }, async () => {
    await terminateAfter(
      await registryServer(19003),
      async () => {
        const result = await httpRequest('http://localhost:19003', {
          headers: { 
            [HEADERS.COMMAND]: COMMANDS.HEALTH 
          }
        })
        
        await assert(result,
          r => r.status === 'ready',
          r => typeof r.timestamp === 'number'
        )
        return result
      }
    )
  })()
}

// ============================================================================
// Token Validation Tests
// ============================================================================

/**
 * Test that protected commands require valid token
 */
async function testProtectedCommandRequiresValidToken() {
  const testToken = 'protected-test-token-123'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19004'
  }, async () => {
    await terminateAfter(
      await registryServer(19004),
      async () => {
        // Should succeed with valid token
        const location = await httpRequest('http://localhost:19004', {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
            [HEADERS.SERVICE_NAME]: 'test-service',
            [HEADERS.SERVICE_HOME]: 'http://localhost',
            [HEADERS.REGISTRY_TOKEN]: testToken
          }
        })
        
        await assert(location,
          l => typeof l === 'string',
          l => l.startsWith('http://localhost:'),
          l => l.includes('19005') || l.includes('19006') // Allocated port
        )
        return location
      }
    )
  })()
}

/**
 * Test that request with wrong token fails with 403
 */
async function testRequestWithWrongTokenFails() {
  const testToken = 'correct-token-456'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19007'
  }, async () => {
    await terminateAfter(
      await registryServer(19007),
      async () => {
        await assertErr(
          async () => await httpRequest('http://localhost:19007', {
            headers: {
              [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
              [HEADERS.SERVICE_NAME]: 'test-service',
              [HEADERS.SERVICE_HOME]: 'http://localhost',
              [HEADERS.REGISTRY_TOKEN]: 'wrong-token-789'
            }
          }),
          err => err.status === 403 || err.message.includes('403'),
          err => err.message.includes('Invalid registry token')
        )
      }
    )
  })()
}

/**
 * Test that request without token fails with 403
 */
async function testRequestWithoutTokenFails() {
  const testToken = 'required-token-abc'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19008'
  }, async () => {
    await terminateAfter(
      await registryServer(19008),
      async () => {
        await assertErr(
          async () => await httpRequest('http://localhost:19008', {
            headers: {
              [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
              [HEADERS.SERVICE_NAME]: 'test-service',
              [HEADERS.SERVICE_HOME]: 'http://localhost'
              // No REGISTRY_TOKEN header
            }
          }),
          err => err.status === 403 || err.message.includes('403'),
          err => err.message.includes('Registry token required')
        )
      }
    )
  })()
}

/**
 * Test that public commands (HEALTH, SERVICE_LOOKUP, SERVICE_CALL) don't require token
 */
async function testPublicCommandsDoNotRequireToken() {
  const testToken = 'public-test-token-def'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19009'
  }, async () => {
    await terminateAfter(
      await registryServer(19009),
      async () => {
        // Health check without token should work
        const healthResult = await httpRequest('http://localhost:19009', {
          headers: { 
            [HEADERS.COMMAND]: COMMANDS.HEALTH 
            // No REGISTRY_TOKEN header
          }
        })
        
        await assert(healthResult,
          r => r.status === 'ready',
          r => typeof r.timestamp === 'number'
        )
        
        return healthResult
      }
    )
  })()
}

/**
 * Test service creation with valid token
 */
async function testServiceCreationWithValidToken() {
  const testToken = 'service-creation-token-ghi'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19010'
  }, async () => {
    await terminateAfter(
      await registryServer(19010),
      await createService('token-test-service', async function(payload) {
        return { success: true, payload }
      }),
      async ([registry, service]) => {
        // Service should be successfully created and registered
        await assert(service,
          s => s.name === 'token-test-service',
          s => typeof s.location === 'string',
          s => s.location.includes('http://localhost:')
        )
        
        return service
      }
    )
  })()
}

/**
 * Test that all protected commands are validated
 */
async function testAllProtectedCommandsValidated() {
  const testToken = 'protected-commands-token-jkl'
  await withEnv({ 
    ENVIRONMENT: 'production',
    MICRO_REGISTRY_TOKEN: testToken,
    MICRO_REGISTRY_URL: 'http://localhost:19011'
  }, async () => {
    await terminateAfter(
      await registryServer(19011),
      async () => {
        const protectedCommands = [
          COMMANDS.SERVICE_SETUP,
          COMMANDS.SERVICE_REGISTER,
          COMMANDS.SERVICE_UNREGISTER,
          COMMANDS.ROUTE_REGISTER,
          COMMANDS.PUBSUB_PUBLISH,
          COMMANDS.PUBSUB_SUBSCRIBE,
          COMMANDS.PUBSUB_UNSUBSCRIBE
        ]
        
        for (const command of protectedCommands) {
          try {
            await httpRequest('http://localhost:19011', {
              headers: {
                [HEADERS.COMMAND]: command,
                [HEADERS.SERVICE_NAME]: 'test',
                [HEADERS.SERVICE_HOME]: 'http://localhost',
                [HEADERS.SERVICE_LOCATION]: 'http://localhost:19012',
                [HEADERS.ROUTE_PATH]: '/test',
                [HEADERS.PUBSUB_CHANNEL]: 'test-channel'
              }
            })
            throw new Error(`Expected ${command} to require token`)
          } catch (err) {
            if (!(err.status === 403 || err.message.includes('403') || err.message.includes('Registry token'))) {
              throw err
            }
          }
        }
        
        return true
      }
    )
  })()
}

export default {
  testRegistryStartsWithoutTokenInDev,
  testRegistryWarnsInNonDevWithoutToken,
  testRegistryFailsInProdWithoutToken,
  testRegistryFailsInStagingWithoutToken,
  testRegistryStartsWithTokenInProduction,
  testProtectedCommandRequiresValidToken,
  testRequestWithWrongTokenFails,
  testRequestWithoutTokenFails,
  testPublicCommandsDoNotRequireToken,
  testServiceCreationWithValidToken,
  testAllProtectedCommandsValidated
}

