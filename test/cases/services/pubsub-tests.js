/**
 * PubSub Tests - Service Context Edition
 * Tests for context.subscribe() and context.publish() within services
 */

import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../../core/index.js'
import { createService, publishMessage } from '../../../src/index.js'

/**
 * Test basic subscribe within a service using context
 */
async function testServiceContextSubscribe() {
  const receivedMessages = []
  
  await terminateAfter(
    await startRegistry(),
    await createService('subscriber-service', async function() {
      await this.subscribe('test-channel', async (message) => {
        receivedMessages.push(message)
        return 'ack'
      })
      return { subscribed: true }
    }),
    async ([registry, service]) => {
      // Call service to set up subscription
      await service.context.call('subscriber-service', {})
      await sleep(50)
      
      // Publish to the channel
      await publishMessage('test-channel', { data: 'hello from test' })
      await sleep(50)
      
      // Verify message was received
      await assert(receivedMessages,
        m => m.length === 1,
        m => m[0].data === 'hello from test'
      )
    }
  )
}

/**
 * Test publish from within a service using context
 */
async function testServiceContextPublish() {
  const receivedMessages = []
  
  await terminateAfter(
    await startRegistry(),
    await createService('publisher-service', async function(payload) {
      // Publish using context
      return await this.publish('pub-channel', payload)
    }),
    await createService('subscriber-service', async function() {
      await this.subscribe('pub-channel', async (message) => {
        receivedMessages.push(message)
      })
    }),
    async ([registry, publisher, subscriber]) => {
      // Set up subscription by calling subscriber
      await subscriber.context.call('subscriber-service', {})
      await sleep(50)
      
      // Call publisher service to publish a message
      const result = await publisher.context.call('publisher-service', { 
        event: 'user-created',
        userId: 123
      })
      
      await sleep(50)
      
      await assert(receivedMessages,
        m => m.length === 1,
        m => m[0].event === 'user-created',
        m => m[0].userId === 123
      )
      
      await assert(result,
        r => r.results && Array.isArray(r.results),
        r => r.errors && Array.isArray(r.errors)
      )
    }
  )
}

/**
 * Test multiple services subscribing to the same channel
 */
async function testMultipleServiceSubscribers() {
  const messages1 = []
  const messages2 = []
  
  await terminateAfter(
    await startRegistry(),
    await createService('service1', async function() {
      await this.subscribe('shared-channel', async (msg) => {
        messages1.push(msg)
      })
    }),
    await createService('service2', async function() {
      await this.subscribe('shared-channel', async (msg) => {
        messages2.push(msg)
      })
    }),
    async ([registry, s1, s2]) => {
      // Call services to set up subscriptions
      await s1.context.call('service1', {})
      await s2.context.call('service2', {})
      await sleep(50)
      
      // Publish once
      await publishMessage('shared-channel', { broadcast: 'test' })
      await sleep(50)
      
      // Both should receive
      await assert([messages1, messages2],
        ([m1, m2]) => m1.length === 1,
        ([m1, m2]) => m2.length === 1,
        ([m1, m2]) => m1[0].broadcast === 'test',
        ([m1, m2]) => m2[0].broadcast === 'test'
      )
    }
  )
}

/**
 * Test unsubscribe from within service context
 */
async function testServiceContextUnsubscribe() {
  const messages = []
  let savedSubId = null
  
  await terminateAfter(
    await startRegistry(),
    await createService('unsub-service', async function(payload) {
      if (payload.action === 'subscribe') {
        savedSubId = await this.subscribe('unsub-channel', async (msg) => {
          messages.push(msg)
        })
        return { subId: savedSubId }
      }
      
      if (payload.action === 'unsubscribe') {
        await this.unsubscribe('unsub-channel', savedSubId)
        return { unsubscribed: true }
      }
    }),
    async ([registry, service]) => {
      // Subscribe
      await service.context.call('unsub-service', { action: 'subscribe' })
      await sleep(50)
      
      // Send message - should be received
      await publishMessage('unsub-channel', { id: 1 })
      await sleep(50)
      await assert(messages, m => m.length === 1)
      
      // Unsubscribe
      await service.context.call('unsub-service', { action: 'unsubscribe' })
      await sleep(50)
      
      // Send another message - should NOT be received
      await publishMessage('unsub-channel', { id: 2 })
      await sleep(50)
      await assert(messages, m => m.length === 1) // Still 1
    }
  )
}

/**
 * Test unsubscribe with invalid channel
 */
async function testUnsubscribeInvalidChannel() {
  await terminateAfter(
    await startRegistry(),
    await createService('error-service', async function() {
      // Try to unsubscribe from non-existent channel
      return await this.unsubscribe('nonexistent', 'fake-sub-id')
    }),
    async ([registry, service]) => {
      await assertErr(
        () => service.context.call('error-service', {}),
        err => err.status === 404,
        err => err.message.includes('No subscriptions found')
      )
    }
  )
}

/**
 * Test unsubscribe with invalid subscription ID
 */
async function testUnsubscribeInvalidSubId() {
  let savedSubId = null
  
  await terminateAfter(
    await startRegistry(),
    await createService('invalid-sub-service', async function(payload) {
      if (payload.action === 'subscribe') {
        savedSubId = await this.subscribe('test', async () => {})
        return { subId: savedSubId }
      }
      
      if (payload.action === 'unsubscribe') {
        return await this.unsubscribe('test', 'wrong-id')
      }
    }),
    async ([registry, service]) => {
      // Subscribe first
      await service.context.call('invalid-sub-service', { action: 'subscribe' })
      await sleep(50)
      
      // Try to unsubscribe with wrong ID
      await assertErr(
        () => service.context.call('invalid-sub-service', { action: 'unsubscribe' }),
        err => err.status === 404,
        err => err.message.includes('not found')
      )
    }
  )
}

/**
 * Test publish to channel with no subscribers (should not error)
 */
async function testPublishWithoutSubscribers() {
  await terminateAfter(
    await startRegistry(),
    await createService('empty-pub-service', async function(payload) {
      return await this.publish('empty-channel', payload)
    }),
    async ([registry, service]) => {
      const result = await service.context.call('empty-pub-service', { data: 'test' })
      
      await assert(result,
        r => r.results && Array.isArray(r.results),
        r => r.results.length === 0,
        r => r.errors && Array.isArray(r.errors),
        r => r.errors.length === 0
      )
    }
  )
}

/**
 * Test service subscribing to multiple channels
 */
async function testMultipleChannelsInService() {
  const channel1Messages = []
  const channel2Messages = []
  
  await terminateAfter(
    await startRegistry(),
    await createService('multi-channel-service', async function() {
      await this.subscribe('channel-a', async (msg) => {
        channel1Messages.push(msg)
      })
      
      await this.subscribe('channel-b', async (msg) => {
        channel2Messages.push(msg)
      })
    }),
    async ([registry, service]) => {
      // Call service to set up subscriptions
      await service.context.call('multi-channel-service', {})
      await sleep(50)
      
      // Publish to different channels
      await publishMessage('channel-a', { source: 'A' })
      await publishMessage('channel-b', { source: 'B' })
      await sleep(50)
      
      await assert([channel1Messages, channel2Messages],
        ([a, b]) => a.length === 1,
        ([a, b]) => b.length === 1,
        ([a, b]) => a[0].source === 'A',
        ([a, b]) => b[0].source === 'B'
      )
    }
  )
}

/**
 * Test handler errors are captured
 */
async function testHandlerErrorInService() {
  await terminateAfter(
    await startRegistry(),
    await createService('error-handler-service', async function() {
      await this.subscribe('error-channel', async (message) => {
        if (message.shouldError) {
          throw new Error('Intentional error')
        }
        return 'ok'
      })
    }),
    async ([registry, service]) => {
      // Call service to set up subscription
      await service.context.call('error-handler-service', {})
      await sleep(50)
      
      // Publish message that causes error
      const result = await publishMessage('error-channel', { shouldError: true })
      
      // Errors should be captured in the results array
      await assert(result,
        r => r.results && r.results.length > 0,
        r => r.results[0].errors && r.results[0].errors.length > 0
      )
    }
  )
}

/**
 * Test standalone publishMessage works with service subscriptions
 */
async function testPublishMessageWithServiceSubscription() {
  const receivedMessages = []
  
  await terminateAfter(
    await startRegistry(),
    await createService('standalone-test-service', async function() {
      await this.subscribe('standalone-channel', async (message) => {
        receivedMessages.push(message)
        return 'received'
      })
    }),
    async ([registry, service]) => {
      // Call service to set up subscription
      await service.context.call('standalone-test-service', {})
      await sleep(50)
      
      // Use standalone publishMessage (like CLI would)
      const result = await publishMessage('standalone-channel', { from: 'cli', data: 'test' })
      await sleep(50)
      
      await assert(receivedMessages,
        msgs => msgs.length === 1,
        msgs => msgs[0].from === 'cli',
        msgs => msgs[0].data === 'test'
      )
      
      await assert(result,
        r => r.results && r.results.length === 1,
        r => r.results[0].results && r.results[0].results.length === 1,
        r => r.results[0].results[0] === 'received'
      )
    }
  )
}

/**
 * Test service cleanup removes subscriptions
 */
async function testServiceTerminateCleanup() {
  const messages = []
  
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      // Create service with subscription
      const service = await createService('cleanup-service', async function() {
        await this.subscribe('cleanup-channel', async (msg) => {
          messages.push(msg)
        })
      })
      
      // Call service to set up subscription
      await service.context.call('cleanup-service', {})
      await sleep(50)
      
      // Publish - should be received
      await publishMessage('cleanup-channel', { id: 1 })
      await sleep(50)
      await assert(messages, m => m.length === 1)
      
      // Terminate service
      await service.terminate()
      await sleep(50)
      
      // Publish again - should NOT be received
      await publishMessage('cleanup-channel', { id: 2 })
      await sleep(50)
      await assert(messages, m => m.length === 1) // Still 1
    }
  )
}

export default {
  testServiceContextSubscribe,
  testServiceContextPublish,
  testMultipleServiceSubscribers,
  testServiceContextUnsubscribe,
  testUnsubscribeInvalidChannel,
  testUnsubscribeInvalidSubId,
  testPublishWithoutSubscribers,
  testMultipleChannelsInService,
  testHandlerErrorInService,
  testPublishMessageWithServiceSubscription,
  testServiceTerminateCleanup
}
