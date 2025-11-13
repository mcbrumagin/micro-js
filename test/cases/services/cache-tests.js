import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../../core/index.js'

import {
  createCacheService,
  callService,
  createService,
  Logger,
  buildCacheUpdateHeaders,
  parseCommandHeaders
} from '../../../src/index.js'

import { isCacheUpdateRequest } from '../../../src/micro-core/service/cache-handler.js'
import { createInMemoryCache } from '../../../src/micro-services/cache-service.js'

const logger = new Logger()

/**
 * Test basic set and get operations
 */
async function testBasicSetAndGet() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async ([registry, cache]) => {
      // Set a value
      const setResult = await callService('cache-service', { set: { key1: 'value1' } })
      await assert(setResult, 
        r => r.success === true,
        r => r.action === 'set',
        r => r.keys.includes('key1')
      )

      // Get the value
      const getValue = await callService('cache-service', { get: 'key1' })
      await assert(getValue, v => v === 'value1')

      // Get non-existent key
      const nullValue = await callService('cache-service', { get: 'nonexistent' })
      await assert(nullValue, v => v === null)
    }
  )
}

/**
 * Test setting multiple keys at once
 */
async function testSetMultipleKeys() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Set multiple keys
      await callService('cache-service', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: { nested: 'object' }
        } 
      })

      // Get all keys
      const allValues = await callService('cache-service', { get: '*' })
      
      await assert(allValues,
        v => v.key1 === 'value1',
        v => v.key2 === 'value2',
        v => v.key3.nested === 'object'
      )
    }
  )
}

/**
 * Test cache expiration with setex
 */
async function testCacheExpiration() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 200, evictionInterval: 20 }),
    async () => {
      // Set value with expiration
      const setexResult = await callService('cache-service', { setex: { tempKey: 'tempValue' } })
      await assert(setexResult, 
        r => r.success === true,
        r => r.action === 'setex'
      )
      
      // Value should exist immediately
      const valueBeforeExpire = await callService('cache-service', { get: 'tempKey' })
      await assert(valueBeforeExpire, v => v === 'tempValue')
      
      // Check expiration time is set
      const expireTime = await callService('cache-service', { getex: 'tempKey' })
      await assert(expireTime, 
        t => typeof t === 'number',
        t => t > Date.now()
      )
      
      // Wait for expiration
      await sleep(250)
      
      // Value should be evicted
      const valueAfterExpire = await callService('cache-service', { get: 'tempKey' })
      await assert(valueAfterExpire, v => v === null)
    }
  )
}

/**
 * Test setting custom expiration time
 */
async function testCustomExpirationTime() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 1000, evictionInterval: 20 }),
    async () => {
      // Set a value
      await callService('cache-service', { set: { customKey: 'customValue' } })
      
      // Set custom expiration (100ms from now)
      await callService('cache-service', { ex: { customKey: 100 } })
      
      // Value should exist
      const valueBefore = await callService('cache-service', { get: 'customKey' })
      await assert(valueBefore, v => v === 'customValue')
      
      // Wait for expiration
      await sleep(150)
      
      // Value should be evicted
      const valueAfter = await callService('cache-service', { get: 'customKey' })
      await assert(valueAfter, v => v === null)
    }
  )
}

/**
 * Test removing expiration (rex)
 */
async function testRemoveExpiration() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 100 }),
    async () => {
      // Set value with expiration
      await callService('cache-service', { setex: { persistKey: 'persistValue' } })
      
      // Verify expiration is set
      const expireBefore = await callService('cache-service', { getex: 'persistKey' })
      await assert(expireBefore, t => typeof t === 'number')
      
      // Remove expiration
      await callService('cache-service', { rex: 'persistKey' })
      
      // Verify expiration is removed
      const expireAfter = await callService('cache-service', { getex: 'persistKey' })
      await assert(expireAfter, t => t === null)
      
      // Wait longer than original expire time
      await sleep(150)
      
      // Value should still exist
      const value = await callService('cache-service', { get: 'persistKey' })
      await assert(value, v => v === 'persistValue')
    }
  )
}

/**
 * Test deleting keys
 */
async function testDeleteKeys() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Set some values
      await callService('cache-service', { 
        set: { 
          deleteMe: 'value1',
          keepMe: 'value2'
        } 
      })
      
      // Delete one key
      await callService('cache-service', { del: 'deleteMe' })
      
      // Verify deletion
      const deletedValue = await callService('cache-service', { get: 'deleteMe' })
      const keptValue = await callService('cache-service', { get: 'keepMe' })
      
      await assert(deletedValue, v => v === null)
      await assert(keptValue, v => v === 'value2')
    }
  )
}


/**
 * Test deleting keys
 */
async function testDeleteMultipleKeys() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Set some values
      await callService('cache-service', { 
        set: { 
          deleteMe1: 'value1',
          deleteMe2: 'value2',
          keepMe: 'value2'
        } 
      })
      
      // Delete one key
      await callService('cache-service', { del: ['deleteMe1', 'deleteMe2'] })
      
      // Verify deletion
      const deletedValue = await callService('cache-service', { get: 'deleteMe1' })
      const deletedValue2 = await callService('cache-service', { get: 'deleteMe2' })
      const keptValue = await callService('cache-service', { get: 'keepMe' })
      
      await assert([deletedValue, deletedValue2], v => v.every(v => v === null))
      await assert(keptValue, v => v === 'value2')
    }
  )
}

/**
 * Test clearing entire cache
 */
async function testClearCache() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Set multiple values
      await callService('cache-service', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        } 
      })
      
      // Verify values exist
      const beforeClear = await callService('cache-service', { get: '*' })
      await assert(beforeClear,
        v => Object.keys(v).length === 3,
        v => v.key1 === 'value1'
      )
      
      // Clear cache
      const clearResult = await callService('cache-service', { clear: true })
      await assert(clearResult,
        r => r.success === true,
        r => r.action === 'clear',
        r => r.keysCleared === 3
      )
      
      // Verify cache is empty
      const afterClear = await callService('cache-service', { get: '*' })
      await assert(afterClear, v => Object.keys(v).length === 0)
    }
  )
}

/**
 * Test updating cache settings
 */
async function testUpdateSettings() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 1000, evictionInterval: 500 }),
    async () => {
      // Update settings
      const newSettings = await callService('cache-service', { 
        settings: { 
          expireTime: 2000,
          evictionInterval: 1000
        } 
      })
      
      await assert(newSettings,
        s => s.expireTime === 2000,
        s => s.evictionInterval === 1000
      )
    }
  )
}

/**
 * Test cache with complex objects
 */
async function testCacheComplexObjects() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      const complexObject = {
        user: {
          id: 123,
          name: 'John Doe',
          settings: {
            theme: 'dark',
            notifications: true
          }
        },
        timestamps: [1234567890, 9876543210],
        metadata: null
      }
      
      // Set complex object
      await callService('cache-service', { set: { userData: complexObject } })
      
      // Get and verify
      const retrieved = await callService('cache-service', { get: 'userData' })
      
      await assert(retrieved,
        r => r.user.id === 123,
        r => r.user.name === 'John Doe',
        r => r.user.settings.theme === 'dark',
        r => r.timestamps.length === 2,
        r => r.metadata === null
      )
    }
  )
}

/**
 * Test eviction interval cleanup
 */
async function testEvictionInterval() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ 
      expireTime: 100,
      evictionInterval: 50 // Check every 50ms
    }),
    async () => {
      // Set multiple keys with expiration
      await callService('cache-service', { 
        setex: { 
          expire1: 'value1',
          expire2: 'value2',
          expire3: 'value3'
        } 
      })
      
      // All should exist
      const before = await callService('cache-service', { get: '*' })
      await assert(before, v => Object.keys(v).length === 3)
      
      // Wait for eviction interval to run (100ms + 50ms buffer)
      await sleep(150)
      
      // All should be evicted
      const after = await callService('cache-service', { get: '*' })
      await assert(after, v => Object.keys(v).length === 0)
    }
  )
}

/**
 * Test setting expiration on multiple keys
 */
async function testSetMultipleExpirations() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Set values
      await callService('cache-service', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        } 
      })
      
      // Set expiration on multiple keys
      await callService('cache-service', { 
        ex: { 
          key1: 100,
          key2: 200,
          key3: 300
        } 
      })
      
      // Check all expirations are set
      const ex1 = await callService('cache-service', { getex: 'key1' })
      const ex2 = await callService('cache-service', { getex: 'key2' })
      const ex3 = await callService('cache-service', { getex: 'key3' })
      
      await assert([ex1, ex2, ex3],
        expirations => expirations.every(e => typeof e === 'number'),
        expirations => expirations.every(e => e > Date.now())
      )
    }
  )
}

/**
 * Test concurrent cache operations
 */
async function testConcurrentOperations() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Perform multiple concurrent operations
      await Promise.all([
        callService('cache-service', { set: { concurrent1: 'value1' } }),
        callService('cache-service', { set: { concurrent2: 'value2' } }),
        callService('cache-service', { set: { concurrent3: 'value3' } }),
      ])
      
      // Verify all values were set
      const all = await callService('cache-service', { get: '*' })
      
      await assert(all,
        v => v.concurrent1 === 'value1',
        v => v.concurrent2 === 'value2',
        v => v.concurrent3 === 'value3'
      )
    }
  )
}

/**
 * Test cache update mechanism with micro headers
 * This tests that services can receive cache updates from the registry
 * without conflicting with their normal service function
 */
async function testCacheUpdateWithHeaders() {
  let cacheUpdatesReceived = []
  
  // Create a test service that tracks cache updates
  const testService = async function(payload, request, response) {
    // This service should only handle non-cache-update requests
    return { message: 'normal service call', payload }
  }
  
  await terminateAfter(
    await startRegistry(),
    await createService('test-service', testService, { port: 11001 }),
    async () => {
      // Wait a moment for service registration
      await sleep(100)
      
      // Test 1: Verify normal service calls work
      const normalResult = await callService('test-service', { test: 'data' })
      await assert(normalResult,
        r => r.message === 'normal service call',
        r => r.payload.test === 'data'
      )
      
      // Test 2: Test cache update header detection
      const cacheHeaders = buildCacheUpdateHeaders('new-service', 'http://localhost:11002')
      const mockRequest = { headers: cacheHeaders }
      
      const isCacheUpdate = isCacheUpdateRequest(mockRequest)
      await assert(isCacheUpdate, result => result === true)
      
      // Test 3: Test non-cache-update header detection
      const normalHeaders = { 'content-type': 'application/json' }
      const normalRequest = { headers: normalHeaders }
      
      const isNotCacheUpdate = isCacheUpdateRequest(normalRequest)
      await assert(isNotCacheUpdate, result => result === false)
      
      logger.info('Cache update header mechanism working correctly')
    }
  )
}

/**
 * Test that service registration triggers cache updates to other services
 * This test verifies that when a new service registers, existing services
 * receive cache update notifications via micro headers
 */
async function testServiceRegistrationCacheUpdate() {
  let service1, service2, newService
  
  await terminateAfter(
    await startRegistry(),
    service1 = await createService('tracking-service-1', async () => ({ message: 'service1' }), { port: 11001 }),
    service2 = await createService('tracking-service-2', async () => ({ message: 'service2' }), { port: 11002 }),
    async () => {
      // Wait for initial registrations
      await sleep(200)
      
      // Get initial cache state for both services
      const initialCache1 = Object.keys(service1.cache.services || {})
      const initialCache2 = Object.keys(service2.cache.services || {})
      
      logger.info(`Initial cache service1: ${JSON.stringify(initialCache1)}`)
      logger.info(`Initial cache service2: ${JSON.stringify(initialCache2)}`)
      
      // Register a new service - this should trigger cache updates to existing services
      newService = await createService('new-service', async () => ({ message: 'new service' }), { port: 11003 })
      
      try {
        // Wait for cache updates to propagate
        await sleep(100)
        
        // Check that both services now have the new service in their cache
        const updatedCache1 = Object.keys(service1.cache.services || {})
        const updatedCache2 = Object.keys(service2.cache.services || {})
        
        logger.info(`Updated cache service1: ${JSON.stringify(updatedCache1)}`)
        logger.info(`Updated cache service2: ${JSON.stringify(updatedCache2)}`)
        
        // Verify that both services received the cache update
        await assert(updatedCache1,
          cache => cache.includes('new-service'),
          cache => cache.length > initialCache1.length
        )
        
        await assert(updatedCache2,
          cache => cache.includes('new-service'),
          cache => cache.length > initialCache2.length
        )
      } finally {
        await newService.terminate()
      }
      
      logger.info('Service registration cache updates working correctly')
    }
  )
}

function testCacheMemoryOnly() {
  let cache = createInMemoryCache({ isMemoryOnly: true })
  const setResult = cache.set('test', 'value1')
  let value = cache.get('test')
  
  return assert(value,
    v => v === 'value1'
  )
}

/**
 * Test cache with expireTime set to 'None'
 * Items should never expire automatically
 */
async function testExpireTimeNone() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 'None', evictionInterval: 50 }),
    async () => {
      // Set value with expiration (should be ignored since expireTime is 'None')
      await callService('cache-service', { setex: { persistKey: 'persistValue' } })
      
      // Wait longer than a typical expiration would be
      await sleep(200)
      
      // Value should still exist since expireTime is 'None'
      const value = await callService('cache-service', { get: 'persistKey' })
      await assert(value, v => v === 'persistValue')
      
      logger.info('✓ expireTime: "None" - items persist indefinitely')
    }
  )
}

/**
 * Test cache with evictionInterval set to 'None'
 * Expired items should not be automatically cleaned up
 */
async function testEvictionIntervalNone() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 100, evictionInterval: 'None' }),
    async () => {
      // Set value with expiration
      await callService('cache-service', { setex: { expiredKey: 'expiredValue' } })
      
      // Wait for expiration time to pass
      await sleep(150)
      
      // Value should still be in cache (not evicted since evictionInterval is 'None')
      const value = await callService('cache-service', { get: 'expiredKey' })
      // Note: It's still there because no eviction ran, even though it's "expired"
      await assert(value, v => v === 'expiredValue')
      
      logger.info('✓ evictionInterval: "None" - expired items not cleaned up')
    }
  )
}

/**
 * Test cache with both expireTime and evictionInterval set to 'None'
 * Cache should grow indefinitely with no automatic cleanup
 */
async function testBothSettingsNone() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 'None', evictionInterval: 'None' }),
    async () => {
      // Set multiple values
      await callService('cache-service', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        } 
      })
      
      // Wait to ensure no cleanup happens
      await sleep(200)
      
      // All values should still exist
      const all = await callService('cache-service', { get: '*' })
      await assert(all,
        v => Object.keys(v).length === 3,
        v => v.key1 === 'value1',
        v => v.key2 === 'value2',
        v => v.key3 === 'value3'
      )
      
      logger.info('✓ Both settings "None" - cache persists indefinitely')
    }
  )
}

/**
 * Test runtime toggling of expireTime from number to 'None' and back
 */
async function testToggleExpireTimeAtRuntime() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 100, evictionInterval: 50 }),
    async () => {
      // Set value with expiration (should expire)
      await callService('cache-service', { setex: { tempKey: 'tempValue' } })
      
      // Wait for expiration
      await sleep(150)
      
      // Value should be evicted
      const afterExpire = await callService('cache-service', { get: 'tempKey' })
      await assert(afterExpire, v => v === null)
      
      // Toggle expireTime to 'None'
      await callService('cache-service', { settings: { expireTime: 'None' } })
      
      // Set new value
      await callService('cache-service', { setex: { persistKey: 'persistValue' } })
      
      // Wait
      await sleep(150)
      
      // Value should persist (expireTime is now 'None')
      const persistValue = await callService('cache-service', { get: 'persistKey' })
      await assert(persistValue, v => v === 'persistValue')
      
      // Toggle back to a number
      await callService('cache-service', { settings: { expireTime: 100 } })
      
      // Set another value
      await callService('cache-service', { setex: { expireAgain: 'expireValue' } })
      
      // Wait for expiration
      await sleep(150)
      
      // Value should be evicted again
      const afterToggleBack = await callService('cache-service', { get: 'expireAgain' })
      await assert(afterToggleBack, v => v === null)
      
      logger.info('✓ Runtime toggle of expireTime works correctly')
    }
  )
}

/**
 * Test runtime toggling of evictionInterval from number to 'None' and back
 */
async function testToggleEvictionIntervalAtRuntime() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 100, evictionInterval: 50 }),
    async () => {
      // Set value with expiration
      await callService('cache-service', { setex: { key1: 'value1' } })
      
      // Wait for eviction
      await sleep(150)
      
      // Value should be evicted
      const afterEviction = await callService('cache-service', { get: 'key1' })
      await assert(afterEviction, v => v === null)
      
      // Toggle evictionInterval to 'None'
      await callService('cache-service', { settings: { evictionInterval: 'None' } })
      
      // Set new value with expiration
      await callService('cache-service', { setex: { key2: 'value2' } })
      
      // Wait past expiration time
      await sleep(150)
      
      // Value should still exist (no eviction running)
      const noEviction = await callService('cache-service', { get: 'key2' })
      await assert(noEviction, v => v === 'value2')
      
      // Toggle back to a number
      await callService('cache-service', { settings: { evictionInterval: 50 } })
      
      // Wait for new eviction to run
      await sleep(100)
      
      // Now the value should be evicted
      const afterToggleBack = await callService('cache-service', { get: 'key2' })
      await assert(afterToggleBack, v => v === null)
      
      logger.info('✓ Runtime toggle of evictionInterval works correctly')
    }
  )
}

/**
 * Test validation of invalid expireTime values
 */
async function testInvalidExpireTimeValidation() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      // Test negative expireTime
      await assertErr(
        () => createCacheService({ expireTime: -100 }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('expireTime must be positive')
      )
      
      // Test invalid type (string that's not 'None')
      await assertErr(
        () => createCacheService({ expireTime: 'invalid' }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('expireTime must be a number or \'None\'')
      )
      
      // Test zero expireTime
      await assertErr(
        () => createCacheService({ expireTime: 0 }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('expireTime must be positive')
      )
      
      logger.info('✓ expireTime validation works correctly')
    }
  )
}

/**
 * Test validation of invalid evictionInterval values
 */
async function testInvalidEvictionIntervalValidation() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      // Test negative evictionInterval
      await assertErr(
        () => createCacheService({ evictionInterval: -100 }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('evictionInterval must be positive')
      )
      
      // Test invalid type
      await assertErr(
        () => createCacheService({ evictionInterval: 'invalid' }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('evictionInterval must be a number or \'None\'')
      )
      
      // Test zero evictionInterval
      await assertErr(
        () => createCacheService({ evictionInterval: 0 }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('evictionInterval must be positive')
      )
      
      logger.info('✓ evictionInterval validation works correctly')
    }
  )
}

/**
 * Test validation during runtime settings update
 */
async function testRuntimeValidation() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 1000, evictionInterval: 500 }),
    async () => {
      // Try to update to invalid expireTime
      await assertErr(
        () => callService('cache-service', { settings: { expireTime: -100 } }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('expireTime must be positive')
      )
      
      // Try to update to invalid evictionInterval
      await assertErr(
        () => callService('cache-service', { settings: { evictionInterval: 0 } }),
        err => err.message.includes('Cache service validation failed') && err.message.includes('evictionInterval must be positive')
      )
      
      // Valid updates should still work
      const validUpdate = await callService('cache-service', { 
        settings: { 
          expireTime: 2000,
          evictionInterval: 1000
        } 
      })
      
      await assert(validUpdate,
        s => s.expireTime === 2000,
        s => s.evictionInterval === 1000
      )
      
      logger.info('✓ Runtime validation works correctly')
    }
  )
}

/**
 * Test updating multiple settings at once including 'None' values
 */
async function testBulkSettingsUpdate() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService({ expireTime: 1000, evictionInterval: 500 }),
    async () => {
      // Update both settings to 'None'
      const noneSettings = await callService('cache-service', { 
        settings: { 
          expireTime: 'None',
          evictionInterval: 'None'
        } 
      })
      
      await assert(noneSettings,
        s => s.expireTime === 'None',
        s => s.evictionInterval === 'None'
      )
      
      // Set a value and verify it persists
      await callService('cache-service', { set: { testKey: 'testValue' } })
      await sleep(200)
      
      const value = await callService('cache-service', { get: 'testKey' })
      await assert(value, v => v === 'testValue')
      
      // Update both back to numbers
      const numericSettings = await callService('cache-service', { 
        settings: { 
          expireTime: 100,
          evictionInterval: 50
        } 
      })
      
      await assert(numericSettings,
        s => s.expireTime === 100,
        s => s.evictionInterval === 50
      )
      
      logger.info('✓ Bulk settings update works correctly')
    }
  )
}

/**
 * Test validation of invalid get action
 */
async function testInvalidGetAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test get with invalid type (number)
      await assertErr(
        () => callService('cache-service', { get: 123 }),
        err => err.message.includes('get action requires a string key')
      )
      
      logger.info('✓ Invalid get action validation works')
    }
  )
}

/**
 * Test validation of invalid set action
 */
async function testInvalidSetAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test set with invalid type (string)
      await assertErr(
        () => callService('cache-service', { set: 'invalid' }),
        err => err.message.includes('set action requires an object')
      )
      
      // Test set with null
      await assertErr(
        () => callService('cache-service', { set: null }),
        err => err.message.includes('set action requires an object')
      )
      
      logger.info('✓ Invalid set action validation works')
    }
  )
}

/**
 * Test validation of invalid setex action
 */
async function testInvalidSetexAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test setex with invalid type
      await assertErr(
        () => callService('cache-service', { setex: 'invalid' }),
        err => err.message.includes('setex action requires an object')
      )
      
      logger.info('✓ Invalid setex action validation works')
    }
  )
}

/**
 * Test validation of invalid ex action
 */
async function testInvalidExAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test ex with invalid type
      await assertErr(
        () => callService('cache-service', { ex: 'invalid' }),
        err => err.message.includes('ex action requires an object')
      )
      
      logger.info('✓ Invalid ex action validation works')
    }
  )
}

/**
 * Test validation of invalid del action
 */
async function testInvalidDelAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test del with invalid type
      await assertErr(
        () => callService('cache-service', { del: {'invalid': true} }),
        err => err.message.includes('del action requires a key-string or array of strings')
      )
      
      logger.info('✓ Invalid del action validation works')
    }
  )
}

/**
 * Test validation of unknown action
 */
async function testUnknownAction() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test unknown action
      await assertErr(
        () => callService('cache-service', { unknownAction: 'test' }),
        err => err.message.includes('Unknown cache action')
      )
      
      logger.info('✓ Unknown action validation works')
    }
  )
}

/**
 * Test action result structures
 */
async function testActionResults() {
  await terminateAfter(
    await startRegistry(),
    await createCacheService(),
    async () => {
      // Test set result
      const setResult = await callService('cache-service', { set: { key1: 'value1', key2: 'value2' } })
      await assert(setResult,
        r => r.success === true,
        r => r.action === 'set',
        r => Array.isArray(r.keys),
        r => r.keys.length === 2,
        r => r.keys.includes('key1'),
        r => r.keys.includes('key2')
      )
      
      // Test ex result
      const exResult = await callService('cache-service', { ex: { key1: 1000 } })
      await assert(exResult,
        r => r.success === true,
        r => r.action === 'ex',
        r => r.keys.includes('key1')
      )
      
      // Test del result
      const delResult = await callService('cache-service', { del: 'key1' })
      await assert(delResult,
        r => r.success === true,
        r => r.action === 'del',
        r => r.keys.key1 === 1
      )
      
      logger.info('✓ Action results have proper structure')
    }
  )
}

export default {
  testBasicSetAndGet,
  testSetMultipleKeys,
  testCacheExpiration,
  testCustomExpirationTime,
  testRemoveExpiration,
  testDeleteKeys,
  testClearCache,
  testUpdateSettings,
  testCacheComplexObjects,
  testEvictionInterval,
  testSetMultipleExpirations,
  testConcurrentOperations,
  testCacheUpdateWithHeaders,
  testServiceRegistrationCacheUpdate,
  testCacheMemoryOnly,
  testExpireTimeNone,
  testEvictionIntervalNone,
  testBothSettingsNone,
  testToggleExpireTimeAtRuntime,
  testToggleEvictionIntervalAtRuntime,
  testInvalidExpireTimeValidation,
  testInvalidEvictionIntervalValidation,
  testRuntimeValidation,
  testBulkSettingsUpdate,
  testInvalidGetAction,
  testInvalidSetAction,
  testInvalidSetexAction,
  testInvalidExAction,
  testInvalidDelAction,
  testUnknownAction,
  testActionResults
}
