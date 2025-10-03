import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'
import pubSubServer from '../../src/micro-services/pub-sub-server.js'
import pubsubService from '../../src/micro-services/pubsub-service.js'
import httpServer from '../../src/http-primitives/http-server.js'
import httpRequest from '../../src/http-primitives/http-request.js'
import { callService, Logger } from '../../src/index.js'

const logger = new Logger({
  // logGroup: 'pubSubTests',
  // includeLogLineNumbers: true,
  // warnLevel: true
})

async function testPubSubServer() {
  await terminateAfter(
    await pubSubServer(10000),
    await httpServer(10001, function subscriber(payload) {
      logger.info(`Got published message [1]: ${JSON.stringify(payload)}`)
    }),
    await httpServer(10002, function subscriber(payload) {
      logger.info(`Got published message [2]: ${JSON.stringify(payload)}`)
    }),
    async () => {
      let start = Date.now()
      // TODO commit/push then reset to before type/location (see if/how it worked)
      await httpRequest('http://localhost:10000', { subscribe: { type: 'test', location: 'http://localhost:10001' }})
      await httpRequest('http://localhost:10000', { subscribe: { type: 'test', location: 'http://localhost:10002' }})
      await httpRequest('http://localhost:10000', { publish: { type: 'test', message: 'TEST [1]' }})
      await httpRequest('http://localhost:10000', { unsubscribe: { type: 'test', location: 'http://localhost:10002' }})
      await httpRequest('http://localhost:10000', { publish: { type: 'test', message: 'TEST [2]' }})
      // TODO assert on req results
      return Date.now() - start + 'ms - for various pubSubServer requests'
    }
  )
}

async function testPubSubBadSubscribe() {
  await terminateAfter(
    await pubSubServer(10000),
    async () => await assertErr(
      () => httpRequest('http://localhost:10000', { subscribe: { type: 'test' }}),
      err => err.message.includes('"type" and "location" are required')
    )
  )
}

async function testPubSubBadPublish() {
  await terminateAfter(
    await pubSubServer(10000),
    async () => await assertErr(
      () => httpRequest('http://localhost:10000', { publish: { message: 'TEST [1]' }}),
      err => err.message.includes('"type" and "message" are required')
    )
  )
}

async function testPubSubBadUnsubscribe() {
  await terminateAfter(
    await pubSubServer(10000),
    async () => await assertErr(
      () => httpRequest('http://localhost:10000', { unsubscribe: { type: 'test', location: 'http://localhost:10002' }}),
      err => err.message.includes('No type "test"')
    )
  )
}

async function testPubSubService() {
  await terminateAfter(
    await startRegistry(),
    await pubsubService(),
    await httpServer(10003, function subscriber(payload) {
      logger.info(`Subscriber 1 received: ${JSON.stringify(payload)}`)
      return { received: true, subscriber: 1 }
    }),
    await httpServer(10004, function subscriber(payload) {
      logger.info(`Subscriber 2 received: ${JSON.stringify(payload)}`)
      return { received: true, subscriber: 2 }
    }),
    async ([registry, pubsub, sub1, sub2]) => {
      // Test subscribe
      let subscribeResult1 = await callService('pubsub', {
        subscribe: { type: 'test-event', location: 'http://localhost:10003' }
      })
      await assert(subscribeResult1,
        r => r.success === true,
        r => r.type === 'test-event',
        r => r.location === 'http://localhost:10003'
      )
      
      let subscribeResult2 = await callService('pubsub', {
        subscribe: { type: 'test-event', location: 'http://localhost:10004' }
      })
      await assert(subscribeResult2,
        r => r.success === true
      )
      
      // Test list subscriptions
      let listResult = await callService('pubsub', {
        list: { type: 'test-event' }
      })
      await assert(listResult,
        r => r.type === 'test-event',
        r => r.subscribers.length === 2,
        r => r.subscribers.includes('http://localhost:10003'),
        r => r.subscribers.includes('http://localhost:10004')
      )
      
      // Test publish
      let publishResult = await callService('pubsub', {
        publish: { type: 'test-event', message: { data: 'Hello subscribers!' } }
      })
      await assert(publishResult,
        r => r.results.length === 2,
        r => r.errors.length === 0,
        r => r.results[0].received === true,
        r => r.results[1].received === true
      )
      
      // Test unsubscribe
      let unsubscribeResult = await callService('pubsub', {
        unsubscribe: { type: 'test-event', location: 'http://localhost:10003' }
      })
      await assert(unsubscribeResult,
        r => r.success === true,
        r => r.type === 'test-event'
      )
      
      // Verify only one subscriber left
      let listAfterUnsub = await callService('pubsub', {
        list: { type: 'test-event' }
      })
      await assert(listAfterUnsub,
        r => r.subscribers.length === 1,
        r => r.subscribers.includes('http://localhost:10004')
      )
      
      // Test clear
      let clearResult = await callService('pubsub', {
        clear: { type: 'test-event' }
      })
      await assert(clearResult,
        r => r.success === true,
        r => r.type === 'test-event'
      )
      
      // Verify subscriptions cleared
      let listAfterClear = await callService('pubsub', {
        list: { type: 'test-event' }
      })
      await assert(listAfterClear,
        r => r.subscribers.length === 0
      )
      
      return publishResult
    }
  )
}

async function testPubSubServiceBadPayload() {
  await terminateAfter(
    await startRegistry(),
    await pubsubService(),
    async () => {
      // Test missing type in subscribe
      await assertErr(
        () => callService('pubsub', { subscribe: { location: 'http://localhost:10003' }}),
        err => err.message.includes('"type" and "location" are required')
      )
      
      // Test missing message in publish
      await assertErr(
        () => callService('pubsub', { publish: { type: 'test' }}),
        err => err.message.includes('"type" and "message" are required')
      )
      
      // Test invalid operation
      await assertErr(
        () => callService('pubsub', { invalid: 'operation' }),
        err => err.message.includes('Missing "publish", "subscribe", "unsubscribe", "list", or "clear" property')
      )
    }
  )
}

export default [
  testPubSubServer,
  testPubSubBadSubscribe,
  testPubSubBadPublish,
  testPubSubBadUnsubscribe,
  testPubSubService,
  testPubSubServiceBadPayload
]
