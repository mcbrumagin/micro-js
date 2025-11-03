import { assert, assertErr, terminateAfter, startRegistry, sleep } from '../../core/index.js'

import { Logger, publishMessage } from '../../../src/index.js'
import createPubSubService from '../../../src/micro-services/pubsub-service.js'

const logger = new Logger()

/**
 * Test basic publish without any subscribers
 */
async function testPublishWithoutSubscribers() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      // Should not error when publishing to channel with no subscribers
      const result = await pubsub.publish('empty-channel', { data: 'test' })
      
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
 * Test basic subscribe and publish flow
 */
async function testBasicSubscribeAndPublish() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {
      const receivedMessages = []

      // Subscribe to a channel
      const subId = await pubsub.subscribe('test-channel', async (message) => {
        receivedMessages.push(message)
        return 'ack'
      })

      await assert(subId,
        id => typeof id === 'string',
        id => id.includes('sub_test-channel')
      )

      // Give subscription time to register
      await sleep(50)

      // Publish a message
      const publishResult = await pubsub.publish('test-channel', { data: 'Hello!' })
      
      // Give message time to be delivered
      await sleep(50)

      await assert(receivedMessages,
        msgs => msgs.length === 1,
        msgs => msgs[0].data === 'Hello!'
      )

      await assert(publishResult,
        r => r.results && r.results.length === 1,
        r => r.results[0].results && r.results[0].results.length === 1,
        r => r.results[0].results[0] === 'ack'
      )
    }
  )
}

/**
 * Test multiple subscribers on same channel
 */
async function testMultipleSubscribers() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {
      const received1 = []
      const received2 = []
      const received3 = []

      // Subscribe multiple handlers to same channel
      const subId1 = await pubsub.subscribe('broadcast', async (msg) => {
        received1.push(msg)
        return 'sub1-ack'
      })

      const subId2 = await pubsub.subscribe('broadcast', async (msg) => {
        received2.push(msg)
        return 'sub2-ack'
      })

      const subId3 = await pubsub.subscribe('broadcast', async (msg) => {
        received3.push(msg)
        return 'sub3-ack'
      })

      await sleep(50)

      // Publish message - all should receive it
      const result = await pubsub.publish('broadcast', { msg: 'Hello all!' })

      await sleep(50)

      await assert(received1,
        msgs => msgs.length === 1,
        msgs => msgs[0].msg === 'Hello all!'
      )

      await assert(received2,
        msgs => msgs.length === 1,
        msgs => msgs[0].msg === 'Hello all!'
      )

      await assert(received3,
        msgs => msgs.length === 1,
        msgs => msgs[0].msg === 'Hello all!'
      )

      // All 3 subscribers are in same process, so one channel handler returns all results
      await assert(result,
        r => r.results && r.results.length === 1,
        r => r.results[0].results && r.results[0].results.length === 3,
        r => r.results[0].results.includes('sub1-ack'),
        r => r.results[0].results.includes('sub2-ack'),
        r => r.results[0].results.includes('sub3-ack')
      )
    }
  )
}

/**
 * Test unsubscribe functionality
 */
async function testUnsubscribe() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {
      const received1 = []
      const received2 = []

      const subId1 = await pubsub.subscribe('unsub-test', async (msg) => {
        received1.push(msg)
      })

      const subId2 = await pubsub.subscribe('unsub-test', async (msg) => {
        received2.push(msg)
      })

      await sleep(50)

      // Publish first message - both should receive
      await pubsub.publish('unsub-test', { count: 1 })
      await sleep(50)

      await assert(received1, msgs => msgs.length === 1)
      await assert(received2, msgs => msgs.length === 1)

      // Unsubscribe first subscriber
      await pubsub.unsubscribe('unsub-test', subId1)
      await sleep(50)

      // Publish second message - only sub2 should receive
      await pubsub.publish('unsub-test', { count: 2 })
      await sleep(50)

      await assert(received1, 
        msgs => msgs.length === 1, // Still 1 - didn't receive second message
        msgs => msgs[0].count === 1
      )

      await assert(received2,
        msgs => msgs.length === 2, // Received both messages
        msgs => msgs[0].count === 1,
        msgs => msgs[1].count === 2
      )
    }
  )
}

/**
 * Test unsubscribe with invalid channel
 */
async function testUnsubscribeInvalidChannel() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      await assertErr(
        async () => await pubsub.unsubscribe('nonexistent', 'fake-sub-id'),
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
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      const subId = await pubsub.subscribe('test', async () => {})
      await sleep(50)

      await assertErr(
        async () => await pubsub.unsubscribe('test', 'wrong-id'),
        err => err.status === 404,
        err => err.message.includes('not found')
      )
    }
  )
}

/**
 * Test subscribe with non-function handler
 */
async function testSubscribeInvalidHandler() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      await assertErr(
        async () => await pubsub.subscribe('test', 'not a function'),
        err => err.status === 400,
        err => err.message.includes('must be a function')
      )
    }
  )
}

/**
 * Test listSubscriptions functionality
 */
async function testListSubscriptions() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      // Initially empty
      let list = pubsub.listSubscriptions()
      await assert(list, l => Object.keys(l).length === 0)

      // Add some subscriptions
      const sub1 = await pubsub.subscribe('channel1', async () => {})
      const sub2 = await pubsub.subscribe('channel1', async () => {})
      const sub3 = await pubsub.subscribe('channel2', async () => {})

      await sleep(50)

      list = pubsub.listSubscriptions()

      await assert(list,
        l => Object.keys(l).length === 2,
        l => l['channel1'] && l['channel1'].subscriptions.length === 2,
        l => l['channel2'] && l['channel2'].subscriptions.length === 1,
        l => l['channel1'].subscriptions.includes(sub1),
        l => l['channel1'].subscriptions.includes(sub2),
        l => l['channel2'].subscriptions.includes(sub3),
        l => typeof l['channel1'].location === 'string',
        l => typeof l['channel2'].location === 'string'
      )
    }
  )
}

/**
 * Test terminate removes all subscriptions
 */
async function testCleanup() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      const pubsub = await createPubSubService()
      await pubsub.subscribe('chan1', async () => {})
      await pubsub.subscribe('chan1', async () => {})
      await pubsub.subscribe('chan2', async () => {})

      await sleep(50)

      let list = pubsub.listSubscriptions()
      await assert(list, l => Object.keys(l).length === 2)

      // Cleanup all
      await pubsub.terminate()

      list = pubsub.listSubscriptions()
      await assert(list, l => Object.keys(l).length === 0)
    }
  )
}

/**
 * Test multiple channels independently
 */
async function testMultipleChannels() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {
      const channel1Messages = []
      const channel2Messages = []

      await pubsub.subscribe('channel1', async (msg) => {
        channel1Messages.push(msg)
      })

      await pubsub.subscribe('channel2', async (msg) => {
        channel2Messages.push(msg)
      })

      await sleep(50)

      // Publish to different channels
      await pubsub.publish('channel1', { channel: 1 })
      await pubsub.publish('channel2', { channel: 2 })

      await sleep(50)

      await assert(channel1Messages,
        msgs => msgs.length === 1,
        msgs => msgs[0].channel === 1
      )

      await assert(channel2Messages,
        msgs => msgs.length === 1,
        msgs => msgs[0].channel === 2
      )
    }
  )
}

/**
 * Test handler that throws error
 */
async function testHandlerError() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {

      await pubsub.subscribe('error-channel', async () => {
        throw new Error('Handler error')
      })

      await sleep(50)

      // Publish should still complete but capture the error
      const result = await pubsub.publish('error-channel', { test: 'data' })

      await sleep(50)

      // Handler error is captured in the channel handler's error array
      await assert(result,
        r => r.results && r.results.length === 1,
        r => r.results[0].errors && r.results[0].errors.length === 1,
        r => r.results[0].results && r.results[0].results.length === 0
      )
    }
  )
}

/**
 * Test publishMessage standalone function (for CLI usage)
 */
async function testPublishMessageFunction() {
  await terminateAfter(
    await startRegistry(),
    await createPubSubService(),
    async ([registry, pubsub]) => {
      const receivedMessages = []

      // Subscribe to a channel
      await pubsub.subscribe('cli-test', async (message) => {
        receivedMessages.push(message)
        return 'received'
      })

      await sleep(50)

      // Use standalone publishMessage function (like CLI would)
      const result = await publishMessage('cli-test', { from: 'cli', data: 'test' })

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

export default {
  testPublishWithoutSubscribers,
  testBasicSubscribeAndPublish,
  testMultipleSubscribers,
  testUnsubscribe,
  testUnsubscribeInvalidChannel,
  testUnsubscribeInvalidSubId,
  testSubscribeInvalidHandler,
  testListSubscriptions,
  testCleanup,
  testMultipleChannels,
  testHandlerError,
  testPublishMessageFunction
}
