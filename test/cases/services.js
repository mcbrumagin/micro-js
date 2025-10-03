import { assert, assertErr, sleep, terminateAfter, startRegistry } from '../core/index.js'

import { createService, callService, Logger, HttpError } from '../../src/index.js'
import httpRequest from '../../src/http-primitives/http-request.js'

const logger = new Logger({
  // logGroup: 'serviceTests',
  includeLogLineNumbers: true,
  // warnLevel: true
})

async function testCreateService() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', function testService(payload) {
      payload.prop3 = 'test'
      return payload
    }),
    async ([registry, server]) => {
      let result = await httpRequest(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`, {
        call: {
          name: 'test',
          payload: { prop1: 'test', prop2: 'test' }
        }
      })
      
      await assert(result,
        r => r.prop1 === 'test',
        r => r.prop2 === 'test', 
        r => r.prop3 === 'test'
      )
      
      return result
    }
  )
}

async function testCallService() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', function testService(payload) {
      return 'TEST SERVICE RESULT'
    }),
    async () => {
      let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
      await assert(result, r => r === 'TEST SERVICE RESULT')
      return result
    }
  )
}


async function testBasicDependentService() {
  await terminateAfter(
    await startRegistry(),
    await createService('test2', async function testService2(payload) {
      return { ...payload, test2: 'called test2' }
    }),
    await createService('test', function testService(payload) {
      return this.call('test2', { ...payload, test: 'called test' }) 
    }),
    async () => {
      let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
      await assert(result,
        r => r.prop1 === 'wow',
        r => r.prop2 === 'it works',
        r => r.test === 'called test',
        r => r.test2 === 'called test2'
      )
      return result
    }
  )
}

async function testMissingService() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
        err => err.message.includes('No service by name "test"')
      )
    }
  )
}


async function testMissingDependentService() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', function testService(payload) {
      return this.call('test2', payload + ' plus bad call') 
    }),
    async () => {
      await assertErr(
        () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
        err => err.message.includes('No service by name "test2" in cache')
      )
    }
  )
}

async function testDependentService() {
  // process.env.MICRO_REGISTRY_URL = 'http://localhost:14000'
  return terminateAfter(
    startRegistry(),
    createService('test', payload => `|TEST| ${payload}`),
    createService('test2', async payload => await callService('test', `test2 payload: ${payload}`) + ' test2 result'),
    createService('test3', async payload => await callService('test2', `test3 payload: ${payload}`) + ' test3 result'),
    createService('test4', async () => await callService('test3', 'test4 payload') + ' test4 result'),
    async () => {
      let result = await callService('test4')
      await assert(result, r => r.includes('|TEST|'))
      await assert(result, r => r.includes('test2 payload'))
      await assert(result, r => r.includes('test2 result'))
      await assert(result, r => r.includes('test3 payload'))
      await assert(result, r => r.includes('test3 result'))
      await assert(result, r => r.includes('test4 payload'))
      await assert(result, r => r.includes('test4 result'))
      return result
    }
  )
}

// callService (instead of using this.call) forces an eager lookup
async function testDependentServiceWithEagerLookup() {
  // process.env.MICRO_REGISTRY_URL = 'http://localhost:10000' // this just gets used in our startRegistry fn
  await terminateAfter(
    await startRegistry(),
    await createService('test2', async payload => await callService('test3', payload)),
    await createService('test', async payload => `TEST SERVICE RESULT... ${payload}`),
    await createService(async function test3(payload) {
      let result = await callService('test', 'HELL')
      return result + ' YEAH BABY' // should be right before " DUDE!"
    }),
    await createService(async function test4(payload) {
      let result = await callService('test2', 'YAY!')
      return result + ', DUDE!' // final result ends with DUDE (1st service call, last append)
    }),
    async () => {
      let result = await callService('test4')
      await assert(result, r => r.includes('TEST SERVICE RESULT...'))
      await assert(result, r => r.includes('HELL YEAH BABY'))
      await assert(result, r => r.includes('DUDE!'))
      return result
    }
  )
}

// redundant?
async function testServiceLookup() {
  await terminateAfter(
    await startRegistry(),
    await createService('lookup1', function test1() { return 'test1' }),
    await createService('lookup2', function test2() { return 'test2' }),
    async ([registry]) => {
      // Test lookup single service
      let service1Location = await httpRequest(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`, {
        lookup: 'lookup1'
      })
      
      await assert(service1Location, l => typeof l === 'string' && l.includes(':'))
      
      // Test lookup all services
      let allServices = await httpRequest(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`, {
        lookup: 'all'
      })
      
      await assert(allServices,
        s => Array.isArray(s.lookup1) && s.lookup1.length > 0,
        s => Array.isArray(s.lookup2) && s.lookup2.length > 0
      )
      
      return { single: service1Location, all: allServices }
    }
  )
}

async function testDependentServiceThrowsError() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', async function testService(payload) {
      return await this.call('test2', payload)
    }),
    await createService('test2', async function testService2(payload) {
      throw new Error('Test error from inside test2 service')
    }),
    async () => {
      await assertErr(
        () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
        err => err.message.includes('Test error from inside test2 service'),
        err => err.stack.includes('in service "test"'),
        err => err.stack.includes('at test2'),
        err => err.status === 500,
        err => err.isServerError,
        err => err.name.includes('HttpServerError')
      )
    }
  )
}

async function testServiceRegistrationFailure() {
  // Test what happens when registry is not available
  let originalEndpoint = process.env.MICRO_REGISTRY_URL
  process.env.MICRO_REGISTRY_URL = 'http://localhost:11000'
  
  try {
    logger.muteWarn()
    await assertErr(
      () => createService('testService', () => 'test'),
      err => err.message.includes('fetch failed')
        || err.message.includes('ECONNREFUSED')
    )
  } finally {
    process.env.MICRO_REGISTRY_URL = originalEndpoint
    logger.unmuteWarn()
  }
}

async function testCallServiceWithInvalidPayload() {
  await terminateAfter(
    await startRegistry(),
    await createService('payloadTest', function payloadTestService(payload) {
      if (!payload || !payload.required) {
        throw new HttpError(400, 'Missing required field')
      }
      return { success: true, received: payload.required }
    }),
    async () => {
      // Test successful call
      let result = await callService('payloadTest', { required: 'value' })
      await assert(result.success, s => s === true)
      
      // Test missing payload
      await assertErr(
        () => callService('payloadTest', {}),
        err => err.message.includes('Missing required field')
      )
    }
  )
}

async function testServicePortConflict() {
  await terminateAfter(
    await startRegistry(),
    await createService('conflict1', function test1() { return 'service1' }),
    await createService('conflict2', function test2() { return 'service2' }),
    async ([ registry, service1, service2 ]) => {
      // Both should be created successfully on different ports
      let result1 = await callService('conflict1')
      let result2 = await callService('conflict2')
      
      await assert(result1, r => r === 'service1')
      await assert(result2, r => r === 'service2')
      
      return { service1: service1.location, service2: service2.location }
    }
  )
}

async function testLoadBalancing() {
  await terminateAfter(
    await startRegistry(),
    await createService('loadTest', function loadTestService1() { return 'instance1' }),
    await createService('loadTest', function loadTestService2() { return 'instance2' }),
    await createService('loadTest', function loadTestService3() { return 'instance3' }),
    async () => {
      let start = Date.now()
      let results = new Set()
      
      // Call service multiple times to test round-robin
      while (results.size < 3 && (Date.now() - start) < 1000) {
        let result = await callService('loadTest')
        results.add(result)
        await sleep(50)
      }
      
      // Should hit all three instances
      await assert(results,
        r => r.size === 3,
        r => r.has('instance1') === true,
        r => r.has('instance2') === true,
        r => r.has('instance3') === true
      )
      
      return Array.from(results)
    }
  )
}


async function testEmptyServiceName() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => createService('', function test() { return 'test' }),
        // err => err.message.includes('Server handler cannot not be an anonymous function') // passes but should it?
        err => err.message.includes('service') || err.message.includes('name')
      )
    }
  )
}

async function testServiceWithSpecialCharacters() {
  await terminateAfter(
    await startRegistry(),
    await createService('test-service', function testDashService() { return 'dash' }),
    await createService('test_service', function testUnderscoreService() { return 'underscore' }),
    async () => {
      // Test service names with special characters
      let result1 = await callService('test-service')
      let result2 = await callService('test_service')
      
      await assert([result1, result2],
        results => results[0] === 'dash',
        results => results[1] === 'underscore'
      )
      
      return { dash: result1, underscore: result2 }
    }
  )
}

async function testLargePayload() {
  await terminateAfter(
    await startRegistry(),
    await createService('largePayload', function largePayloadService(payload) {
      return { received: payload.data.length, echo: payload.data.substring(0, 10) + '...' }
    }),
    async () => {
      let largeData = 'x'.repeat(10000) // 10KB string
      let result = await callService('largePayload', { data: largeData })
      
      await assert(result,
        r => r.received === 10000,
        r => r.echo === 'xxxxxxxxxx...'
      )
      
      return result
    }
  )
}

export default [
  testCreateService,
  testCallService,
  testBasicDependentService,
  testMissingService,
  testMissingDependentService,
  testDependentService,
  testDependentServiceWithEagerLookup,
  testServiceLookup,
  testDependentServiceThrowsError,
  testServiceRegistrationFailure,
  testCallServiceWithInvalidPayload,
  testServicePortConflict,
  testLoadBalancing,
  testEmptyServiceName,
  testServiceWithSpecialCharacters,
  testLargePayload
]
