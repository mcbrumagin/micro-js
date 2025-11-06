/**
 * Subscription Service Tests
 * Tests for createSubscriptionService functionality
 */

import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../core/index.js'

import {
  createService,
  callService,
  createSubscriptionService,
  publishMessage,
  Logger
} from '../../src/index.js'

const logger = new Logger()

/**
 * Test basic subscription creation and message delivery
 */
async function testBasicSubscription() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const messages = []
      
      const subscription = await createSubscriptionService('test-subscription', {
        'test-channel': async (message) => {
          messages.push(message)
          return { received: true }
        }
      })
      
      // Publish a message
      await publishMessage('test-channel', { data: 'test message 1' })
      
      await assert(messages,
        m => m.length === 1,
        m => m[0].data === 'test message 1'
      )
      
      // Publish another message
      await publishMessage('test-channel', { data: 'test message 2' })
      
      await assert(messages,
        m => m.length === 2,
        m => m[1].data === 'test message 2'
      )
      
      // Verify subscription object structure
      await assert(subscription,
        s => typeof s.terminate === 'function',
        s => Array.isArray(s.channels),
        s => s.channels.includes('test-channel'),
        s => typeof s.location === 'string',
        s => typeof s.name === 'string',
        s => s.name === 'test-subscription'
      )
      
      await subscription.terminate()
    }
  )
}

/**
 * Test multiple subscription services to the same channel
 */
async function testMultipleSubscriptionsToSameChannel() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const messages1 = []
      const messages2 = []
      
      const subscription1 = await createSubscriptionService('sub1', {
        'shared-channel': async (message) => {
          messages1.push(message)
        }
      })
      
      const subscription2 = await createSubscriptionService('sub2', {
        'shared-channel': async (message) => {
          messages2.push(message)
        }
      })
      
      // Publish a message - both should receive it
      await publishMessage('shared-channel', { data: 'broadcast' })
      
      await assert([messages1, messages2],
        ([m1, m2]) => m1.length === 1,
        ([m1, m2]) => m2.length === 1,
        ([m1, m2]) => m1[0].data === 'broadcast',
        ([m1, m2]) => m2[0].data === 'broadcast'
      )
      
      await subscription1.terminate()
      await subscription2.terminate()
    }
  )
}

/**
 * Test subscription service with multiple channels
 */
async function testMultipleChannelSubscriptions() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const channelAMessages = []
      const channelBMessages = []
      
      const sub = await createSubscriptionService('multi-channel-sub', {
        'channel-a': async (message) => {
          channelAMessages.push(message)
        },
        'channel-b': async (message) => {
          channelBMessages.push(message)
        }
      })
      
      // Publish to different channels
      await publishMessage('channel-a', { source: 'A' })
      await publishMessage('channel-b', { source: 'B' })
      
      await assert([channelAMessages, channelBMessages],
        ([a, b]) => a.length === 1,
        ([a, b]) => b.length === 1,
        ([a, b]) => a[0].source === 'A',
        ([a, b]) => b[0].source === 'B'
      )
      
      await sub.terminate()
    }
  )
}

/**
 * Test subscription termination stops message delivery
 */
async function testSubscriptionTermination() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const messages = []
      
      const subscription = await createSubscriptionService('term-service', {
        'term-channel': async (message) => {
          messages.push(message)
        }
      })
      
      // Send first message
      await publishMessage('term-channel', { id: 1 })
      
      await assert(messages, m => m.length === 1)
      
      // Terminate subscription
      await subscription.terminate()
      
      // Send second message - should NOT be received
      await publishMessage('term-channel', { id: 2 })
      
      await assert(messages,
        m => m.length === 1, // Still only 1 message
        m => m[0].id === 1
      )
    }
  )
}

/**
 * Test subscription with invalid handler
 */
async function testInvalidHandler() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      await assertErr(
        () => createSubscriptionService('test-service', { 'test-channel': 'not-a-function' }),
        err => err.message.includes('must be a function')
      )
      
      await assertErr(
        () => createSubscriptionService('test-service2', { 'test-channel': null }),
        err => err.message.includes('must be a function')
      )
      
      await assertErr(
        () => createSubscriptionService('test-service3', {}),
        err => err.message.includes('at least one channel')
      )
    }
  )
}

/**
 * Test subscription handler error is caught and logged
 */
async function testSubscriptionHandlerError() {
  await terminateAfter(
    await startRegistry(),
    await createSubscriptionService('error-service', {
      'error-channel': async (message) => {
        if (message.shouldError) {
          throw new Error('Intentional handler error')
        }
        return { success: true }
      }
    }),
    async ([registry, subscription]) => {
      // Publish message that causes handler error
      const result = await publishMessage('error-channel', { shouldError: true })
      
      // Check that error is captured in errors array
      await assert(result,
        r => r.results && r.results.length > 0,
        r => r.results[0].errors && r.results[0].errors.length > 0
      )
    }
  )
}

/**
 * Test subscription with complex message payloads
 */
async function testComplexMessagePayloads() {
  const messages = []
  
  await terminateAfter(
    await startRegistry(),
    await createSubscriptionService('complex-service', {
      'complex-channel': async (message) => {
        messages.push(message)
      }
    }),
    async ([registry, subscription]) => {
      
      // Send various complex payloads
      await publishMessage('complex-channel', {
        nested: { deeply: { nested: { value: 123 } } },
        array: [1, 2, 3],
        mixed: { items: [{ id: 1 }, { id: 2 }] }
      })
      
      await publishMessage('complex-channel', {
        string: 'test',
        number: 42,
        boolean: true,
        null: null
      })
      
      await assert(messages,
        m => m.length === 2,
        m => m[0].nested.deeply.nested.value === 123,
        m => m[0].array.length === 3,
        m => m[0].mixed.items[1].id === 2,
        m => m[1].string === 'test',
        m => m[1].number === 42,
        m => m[1].boolean === true,
        m => m[1].null === null
      )
    }
  )
}

/**
 * Test subscription publish results
 */
async function testSubscriptionPublishResults() {
  await terminateAfter(
    await startRegistry(),
    await createSubscriptionService('rpc-service', {
      'rpc-channel': async (message) => {
        return { echo: message, processed: true }
      }
    }),
    async ([registry, subscription]) => {
      
      // Publish returns results from all handlers
      const result = await publishMessage('rpc-channel', { test: 'data' })
      
      console.log(JSON.stringify(result, null, 2))
      await assert(result,
        r => r.results.length === 1,
        r => r.results[0].results[0].echo.test === 'data',
        r => r.results[0].results[0].processed === true
      )
    }
  )
}

/**
 * Test concurrent message handling
 */
async function testConcurrentMessages() {
  const messages = []
  
  await terminateAfter(
    await startRegistry(),
    await createSubscriptionService('concurrent-service', {
      'concurrent-channel': async (message) => {
        await sleep(10) // Simulate async processing
        messages.push(message.id)
      }
    }),
    async ([registry, subscription]) => {
      // Send multiple messages concurrently
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(publishMessage('concurrent-channel', { id: i }))
      }
      
      await Promise.all(promises)
      
      await assert(messages,
        m => m.length === 5,
        m => new Set(m).size === 5, // All unique IDs received
        m => m.includes(0) && m.includes(4) // First and last received
      )
    }
  )
}

/**
 * Test subscription receives messages from start
 */
async function testSubscriptionStartsClean() {
  const messages = []
  
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      // Publish before subscription exists
      await publishMessage('clean-channel', { id: 0 })
      
      const subscription = await createSubscriptionService('clean-service', {
        'clean-channel': async (message) => {
          messages.push(message)
        }
      })
      
      // Should not receive the message sent before subscription
      await assert(messages, m => m.length === 0)
      
      // But should receive new messages
      await publishMessage('clean-channel', { id: 1 })
      
      await assert(messages,
        m => m.length === 1,
        m => m[0].id === 1
      )
      
      await subscription.terminate()
    }
  )
}

/**
 * Test subscription creation on regular service
 */
async function testSubscriptionCreationOnRegularService() {
  const messages = []
  await terminateAfter(
    await startRegistry(),
    await createService('regular-service', async () => {
      return { totalMessages: messages.length }
    }),
    async ([registry, service]) => {

      await service.createSubscription({
        'middleware-channel': async (message) => {
          messages.push(message)
        }
      })

      await publishMessage('middleware-channel', { data: 'test message' })
      let result = await callService('regular-service')

      await assert([messages, result],
        ([m, r]) => m.length === 1,
        ([m, r]) => m[0].data === 'test message',
        ([m, r]) => r.totalMessages === 1
      )
    }
  )
}

/**
 * Test subscription creation on regular service with middleware
 */
async function testSubscriptionCreationOnMiddlewareService() {
  const messages = []
  await terminateAfter(
    await startRegistry(),
    await createService('middleware-service', async (payload) => {
      return { totalMessages: messages.length, ...payload }
    }),
    async ([registry, service]) => {

      service.before(async (payload, request, response) => {
        payload.before = true
        return payload
      })

      await service.createSubscription({
        'middleware-channel': async (message) => {
          messages.push(message)
        }
      })

      await publishMessage('middleware-channel', { data: 'test message' })
      let result = await callService('middleware-service', { call: 'test' })

      await assert([messages, result],
        ([m, r]) => m.length === 1,
        ([m, r]) => m[0].data === 'test message',
        ([m, r]) => r.totalMessages === 1,
        ([m, r]) => r.call === 'test',
        ([m, r]) => r.before === true
      )
    }
  )
}


/**
 * Test subscription creation on regular service with middleware
 */
async function testSubscriptionCreationBeforeMiddlewareOverride() {
  const messages = []
  await terminateAfter(
    await startRegistry(),
    await createService('middleware-service', async (payload) => {
      return { totalMessages: messages.length, ...payload }
    }),
    async ([registry, service]) => {

      await service.createSubscription({
        'middleware-channel': async (message) => {
          messages.push(message)
        }
      })

      await publishMessage('middleware-channel', { data: 'test message 1' })
      let beforeOverrideResult = await callService('middleware-service', { call: 'test1' })

      service.before(async (payload, request, response) => {
        payload.before = true
        return payload
      })


      await publishMessage('middleware-channel', { data: 'test message 2' })
      let afterOverrideResult = await callService('middleware-service', { call: 'test2' })

      await assert([messages, beforeOverrideResult, afterOverrideResult],
        ([m, r1, r2]) => m.length === 2,
        ([m, r1, r2]) => m[0].data === 'test message 1',
        ([m, r1, r2]) => m[1].data === 'test message 2',
        ([m, r1, r2]) => r1.totalMessages === 1,
        ([m, r1, r2]) => r1.call === 'test1',
        ([m, r1, r2]) => r1.before === undefined,
        ([m, r1, r2]) => r2.totalMessages === 2,
        ([m, r1, r2]) => r2.call === 'test2',
        ([m, r1, r2]) => r2.before === true
      )
    }
  )
}

export default {
  testBasicSubscription,
  testMultipleSubscriptionsToSameChannel,
  testMultipleChannelSubscriptions,
  testSubscriptionTermination,
  testInvalidHandler,
  testSubscriptionHandlerError,
  testComplexMessagePayloads,
  testSubscriptionPublishResults,
  testConcurrentMessages,
  testSubscriptionStartsClean,
  testSubscriptionCreationOnRegularService,
  testSubscriptionCreationOnMiddlewareService,
  testSubscriptionCreationBeforeMiddlewareOverride
}