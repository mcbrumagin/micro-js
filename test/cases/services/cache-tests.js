import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../../core/index.js'
import createCacheService, { createInMemoryCache } from '../../../src/micro-services/cache-service.js'
import { callService, createService, Logger } from '../../../src/index.js'
import { isCacheUpdateRequest } from '../../../src/micro-core/service/cache-handler.js'
import { buildCacheUpdateHeaders, parseCommandHeaders } from '../../../src/utils/micro-headers.js'

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
      const setResult = await callService('cache', { set: { key1: 'value1' } })
      await assert(setResult, r => r === true)

      // Get the value
      const getValue = await callService('cache', { get: 'key1' })
      await assert(getValue, v => v === 'value1')

      // Get non-existent key
      const nullValue = await callService('cache', { get: 'nonexistent' })
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
      await callService('cache', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: { nested: 'object' }
        } 
      })

      // Get all keys
      const allValues = await callService('cache', { get: '*' })
      
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
      await callService('cache', { setex: { tempKey: 'tempValue' } })
      
      // Value should exist immediately
      const valueBeforeExpire = await callService('cache', { get: 'tempKey' })
      await assert(valueBeforeExpire, v => v === 'tempValue')
      
      // Check expiration time is set
      const expireTime = await callService('cache', { getex: 'tempKey' })
      await assert(expireTime, 
        t => typeof t === 'number',
        t => t > Date.now()
      )
      
      // Wait for expiration
      await sleep(250)
      
      // Value should be evicted
      const valueAfterExpire = await callService('cache', { get: 'tempKey' })
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
      await callService('cache', { set: { customKey: 'customValue' } })
      
      // Set custom expiration (100ms from now)
      await callService('cache', { ex: { customKey: 100 } })
      
      // Value should exist
      const valueBefore = await callService('cache', { get: 'customKey' })
      await assert(valueBefore, v => v === 'customValue')
      
      // Wait for expiration
      await sleep(150)
      
      // Value should be evicted
      const valueAfter = await callService('cache', { get: 'customKey' })
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
      await callService('cache', { setex: { persistKey: 'persistValue' } })
      
      // Verify expiration is set
      const expireBefore = await callService('cache', { getex: 'persistKey' })
      await assert(expireBefore, t => typeof t === 'number')
      
      // Remove expiration
      await callService('cache', { rex: { persistKey: true } })
      
      // Verify expiration is removed
      const expireAfter = await callService('cache', { getex: 'persistKey' })
      await assert(expireAfter, t => t === null)
      
      // Wait longer than original expire time
      await sleep(150)
      
      // Value should still exist
      const value = await callService('cache', { get: 'persistKey' })
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
      await callService('cache', { 
        set: { 
          deleteMe: 'value1',
          keepMe: 'value2'
        } 
      })
      
      // Delete one key
      await callService('cache', { del: { deleteMe: true } })
      
      // Verify deletion
      const deletedValue = await callService('cache', { get: 'deleteMe' })
      const keptValue = await callService('cache', { get: 'keepMe' })
      
      await assert(deletedValue, v => v === null)
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
      await callService('cache', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        } 
      })
      
      // Verify values exist
      const beforeClear = await callService('cache', { get: '*' })
      await assert(beforeClear,
        v => Object.keys(v).length === 3,
        v => v.key1 === 'value1'
      )
      
      // Clear cache
      await callService('cache', { clear: true })
      
      // Verify cache is empty
      const afterClear = await callService('cache', { get: '*' })
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
      const newSettings = await callService('cache', { 
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
      await callService('cache', { set: { userData: complexObject } })
      
      // Get and verify
      const retrieved = await callService('cache', { get: 'userData' })
      
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
      await callService('cache', { 
        setex: { 
          expire1: 'value1',
          expire2: 'value2',
          expire3: 'value3'
        } 
      })
      
      // All should exist
      const before = await callService('cache', { get: '*' })
      await assert(before, v => Object.keys(v).length === 3)
      
      // Wait for eviction interval to run (100ms + 50ms buffer)
      await sleep(150)
      
      // All should be evicted
      const after = await callService('cache', { get: '*' })
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
      await callService('cache', { 
        set: { 
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        } 
      })
      
      // Set expiration on multiple keys
      await callService('cache', { 
        ex: { 
          key1: 100,
          key2: 200,
          key3: 300
        } 
      })
      
      // Check all expirations are set
      const ex1 = await callService('cache', { getex: 'key1' })
      const ex2 = await callService('cache', { getex: 'key2' })
      const ex3 = await callService('cache', { getex: 'key3' })
      
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
        callService('cache', { set: { concurrent1: 'value1' } }),
        callService('cache', { set: { concurrent2: 'value2' } }),
        callService('cache', { set: { concurrent3: 'value3' } }),
      ])
      
      // Verify all values were set
      const all = await callService('cache', { get: '*' })
      
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
      
      // Wait for cache updates to propagate
      await sleep(300)
      
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
      
      logger.info('Service registration cache updates working correctly')
    }
  )
}

function testCacheMemoryOnly() {
  let cache = createInMemoryCache({ isMemoryOnly: true })
  cache.set('test', 'value1')
  let value = cache.get('test')
  
  return assert(value,
    v => v === 'value1'
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
  testCacheMemoryOnly
}
