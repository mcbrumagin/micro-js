/**
 * Subscription Tests
 * Tests for standalone createSubscription functionality
 */

import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../core/index.js'

import {
  createSubscription,
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
      
      const subscription = await createSubscription('test-channel', async (message) => {
        messages.push(message)
        return { received: true }
      })
      
      // Give subscription time to register
      await sleep(50)
      
      // Publish a message
      await publishMessage('test-channel', { data: 'test message 1' })
      await sleep(50)
      
      await assert(messages,
        m => m.length === 1,
        m => m[0].data === 'test message 1'
      )
      
      // Publish another message
      await publishMessage('test-channel', { data: 'test message 2' })
      await sleep(50)
      
      await assert(messages,
        m => m.length === 2,
        m => m[1].data === 'test message 2'
      )
      
      // Verify subscription object structure
      await assert(subscription,
        s => typeof s.terminate === 'function',
        s => typeof s.channel === 'string',
        s => s.channel === 'test-channel',
        s => typeof s.location === 'string',
        s => typeof s.serviceName === 'string',
        s => s.serviceName.startsWith('subscription_test-channel_')
      )
      
      await subscription.terminate()
    }
  )
}

/**
 * Test multiple subscriptions to the same channel
 */
async function testMultipleSubscriptionsToSameChannel() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const messages1 = []
      const messages2 = []
      
      const subscription1 = await createSubscription('shared-channel', async (message) => {
        messages1.push(message)
      })
      
      const subscription2 = await createSubscription('shared-channel', async (message) => {
        messages2.push(message)
      })
      
      await sleep(50)
      
      // Publish a message - both should receive it
      await publishMessage('shared-channel', { data: 'broadcast' })
      await sleep(50)
      
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
 * Test subscription to multiple different channels
 */
async function testMultipleChannelSubscriptions() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const channelAMessages = []
      const channelBMessages = []
      
      const subA = await createSubscription('channel-a', async (message) => {
        channelAMessages.push(message)
      })
      
      const subB = await createSubscription('channel-b', async (message) => {
        channelBMessages.push(message)
      })
      
      await sleep(50)
      
      // Publish to different channels
      await publishMessage('channel-a', { source: 'A' })
      await publishMessage('channel-b', { source: 'B' })
      await sleep(50)
      
      await assert([channelAMessages, channelBMessages],
        ([a, b]) => a.length === 1,
        ([a, b]) => b.length === 1,
        ([a, b]) => a[0].source === 'A',
        ([a, b]) => b[0].source === 'B'
      )
      
      await subA.terminate()
      await subB.terminate()
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
      
      const subscription = await createSubscription('term-channel', async (message) => {
        messages.push(message)
      })
      
      await sleep(50)
      
      // Send first message
      await publishMessage('term-channel', { id: 1 })
      await sleep(50)
      
      await assert(messages, m => m.length === 1)
      
      // Terminate subscription
      await subscription.terminate()
      await sleep(50)
      
      // Send second message - should NOT be received
      await publishMessage('term-channel', { id: 2 })
      await sleep(50)
      
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
        () => createSubscription('test-channel', 'not-a-function'),
        err => err.message.includes('handler must be a function')
      )
      
      await assertErr(
        () => createSubscription('test-channel', null),
        err => err.message.includes('handler must be a function')
      )
      
      await assertErr(
        () => createSubscription('test-channel', undefined),
        err => err.message.includes('handler must be a function')
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
    await createSubscription('error-channel', async (message) => {
      if (message.shouldError) {
        throw new Error('Intentional handler error')
      }
      return { success: true }
    }),
    async ([registry, subscription]) => {
      await sleep(50)
      
      // Publish message that causes handler error
      const result = await publishMessage('error-channel', { shouldError: true })
      
      // Check that error is captured in errors array
      // TODO do we want an errors array? seems bad
      await assert(result,
        r => r.errors && r.errors.length > 0,
        r => r.errors[0].status === 500
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
    await createSubscription('complex-channel', async (message) => {
      messages.push(message)
    }),
    async ([registry, subscription]) => {
      await sleep(50)
      
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
      
      await sleep(50)
      
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
 * Test subscription request/response pattern
 */
async function testSubscriptionRequestResponse() {
  await terminateAfter(
    await startRegistry(),
    await createSubscription('rpc-channel', async (message, request, response) => {
      // Handler can access request and response objects
      await assert([message, request, response],
        ([msg, req, res]) => msg !== undefined,
        ([msg, req, res]) => req !== undefined,
        ([msg, req, res]) => res !== undefined
      )
      
      return { echo: message, processed: true }
    }),
    async ([registry, subscription]) => {
      await sleep(50)
      
      // Publish returns results from all handlers
      const result = await publishMessage('rpc-channel', { test: 'data' })
      
      await assert(result,
        r => r.results.length === 1,
        r => r.results[0].echo.test === 'data',
        r => r.results[0].processed === true
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
    await createSubscription('concurrent-channel', async (message) => {
      await sleep(10) // Simulate async processing
      messages.push(message.id)
    }),
    async ([registry, subscription]) => {
      await sleep(50)
      
      // Send multiple messages concurrently
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(publishMessage('concurrent-channel', { id: i }))
      }
      
      await Promise.all(promises)
      await sleep(100) // Wait for all handlers to complete
      
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
      await sleep(50)
      
      const subscription = await createSubscription('clean-channel', async (message) => {
        messages.push(message)
      })
      
      await sleep(50)
      
      // Should not receive the message sent before subscription
      await assert(messages, m => m.length === 0)
      
      // But should receive new messages
      await publishMessage('clean-channel', { id: 1 })
      await sleep(50)
      
      await assert(messages,
        m => m.length === 1,
        m => m[0].id === 1
      )
      
      await subscription.terminate()
      await sleep(50) // Give time for cleanup
    }
  )
}

/**
 * Test multiple terminate calls are safe
 */
async function testMultipleTerminateCalls() {
  await terminateAfter(
    await startRegistry(),
    await createSubscription('multi-term-channel', async (message) => {
      return { received: true }
    }),
    async ([registry, subscription]) => {
      await sleep(50)
      
      // Multiple terminate calls should not error
      await subscription.terminate()
      await sleep(20)
      await subscription.terminate()
      await sleep(20)
      await subscription.terminate()
      
      // No assertion needed - just shouldn't throw
      await assert(true, t => t === true)
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
  testSubscriptionRequestResponse,
  testConcurrentMessages,
  testSubscriptionStartsClean,
  testMultipleTerminateCalls
}

