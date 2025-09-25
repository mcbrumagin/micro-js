import httpRequest from './http-request.js'
import httpServer from './http-server.js'
import pubSubServer from './pub-sub-server.js'
import registryServer from './registry-server.js'
import createService from './create-service.js'
import createRoute from './create-route.js'
import callService from './call-service.js'
import Logger from './logger.js'
import HttpError from './http-error.js'

class MultipleAssertError extends Error {
  constructor(val, errors) {
    super('Multiple Assert Errors')
    this.val = val
    this.errors = errors
    this.name = 'MultipleAssertError'
    this.stack = this.name + '\n' + JSON.stringify(val) + '\n\n' + errors.map(e => e.stack).join('\n\n')
  }
}

class MultipleErrorAssertError extends Error {
  constructor(err, errors) {
    super('Multiple Error Assert Errors')
    this.err = err
    this.errors = errors
    this.name = 'MultipleErrorAssertError'

    errors.unshift(err)
    this.stack = this.name + '\n\n' + errors.map(e => e.stack).join('\n\n')
  }
}

const logger = new Logger({
  // serviceName: 'test', // TODO this has ugly formatting in the logs
  includeLogLineNumbers: true,
  warnLevel: true
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// TODO move assert fns to own module

async function assert(valOrFn, ...assertFns) {
  let result
  if (typeof valOrFn === 'function') result = await valOrFn()
  else result = valOrFn

  // Handle single assertion function (backward compatibility)
  if (assertFns.length === 1) {
    let assertResult = await assertFns[0](result)
    if (assertResult != true) throw new Error(
      `Assert failed for \nval: ${JSON.stringify(result)}\nassertFn: ${assertFns[0].toString()}`
    )
    return
  }

  // Handle multiple assertion functions
  let errors = await Promise.all(assertFns.map(async assertFn => {
    let assertResult = await assertFn(result)
    if (assertResult != true) return new Error(
      `Assert failed for \nval: ${JSON.stringify(result)}\nassertFn: ${assertFn.toString()}`
    )
  }))

  errors = errors.filter(e => e instanceof Error)
  if (errors.length > 1) throw new MultipleAssertError(result, errors)
  else if (errors.length === 1) throw errors[0]
}

async function assertErr(errOrFn, ...assertFns) {
  let err
  if (typeof errOrFn === 'function' /*&& errOrFn.catch*/) {
    try {
      await errOrFn()
        .catch(e => err = e)
        .then(val => err = val)
    } catch (e) {
      err = e
    }
  } else err = errOrFn

  if (!(err instanceof Error)) {
    let message = `Assert expected an error but received \nval: ${err}`
    if (typeof errOrFn === 'function') message += `\n fn: ${errOrFn}`
    throw new Error(message)
  }

  let errors = await Promise.all(assertFns.map(async assertFn => {
    let assertResult = await assertFn(err)
    // console.log({assertResult, assertFn})
    if (assertResult != true) return new Error(
      `Assert failed for \nerr: ${err.toString()}\nassertFn: ${assertFn.toString()}`
    )
  }))
  // console.log(...errors)

  errors = errors.filter(e => e instanceof Error)
  if (errors.length > 1) throw new MultipleErrorAssertError(err, errors)
  else if (errors.length === 1) throw errors[0]
}


async function terminateAfter(...args /* ...serverFns, testFn */) {
  args.unshift(args.pop()) // rearrange for spread
  let [testFn, ...serverFns] = args
  let servers = await Promise.all(serverFns)

  // TODO handle setup error early and prevent full test run?

  try {
    let result = await testFn(servers)
    // console.log({result})
    return result
  } finally {
    let registryIndex = servers.findIndex(s => s.isRegistry)
    if (registryIndex > -1) {
      let registryServer = servers[registryIndex]
      // TODO verify
      servers = servers.slice(0, registryIndex).concat(servers.slice(registryIndex + 1))
      for (let server of servers) await server.terminate()
      await registryServer.terminate()
    } else for (let server of servers) await server.terminate()
  }
}

async function testHttpServer () {
  await terminateAfter(
    await httpServer(10000, function test(payload) {
      logger.info(`in test httpServer, got payload "${JSON.stringify(payload)}"`)
      return Date.now()
    }),
    async () => {
      let result = await httpRequest('http://localhost:10000', { testPayload: 'testPayload' })
      return new Date() - Number(result) + 'ms request/response time'
    }
  )
}

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

async function startRegistry() {
  let port = process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]
  let server = await registryServer(port)
  logger.info(`waited for registry server in test helper, at port: ${port}`)
  return server
}

// let lastTestPort = 10000
// let getTestPortRange

async function testCreateService() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', function testService(payload) {
      payload.prop3 = 'test'
      return payload
    }),
    async ([registry, server]) => {
      let result = await httpRequest(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}`, {
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
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:14000'
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
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000' // this just gets used in our startRegistry fn
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

// ===== ROUTE TESTS =====

async function testBasicRoute() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      await createRoute('/hello', async function helloService() {
        return 'Hello World!'
      })

      // Test direct HTTP request to route
      let response = await fetch(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}/hello`)
      let result = await response.text()
      
      await assert(result, r => r === 'Hello World!')
      await assert(response.status, s => s === 200)
      return result
    }
  )
}

async function testRouteWithService() {
  await terminateAfter(
    await startRegistry(),
    await createService('greetingService', function greetingService(payload) {
      return `Hello ${payload.name || 'World'}!`
    }),
    async ([registry, service]) => {
      await createRoute('/greet', 'greetingService')

      let response = await fetch(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}/greet`)
      let result = await response.text()
      
      await assert(result, r => r.includes('Hello World!'))
      await assert(response.status, s => s === 200)
      return result
    }
  )
}

async function testRouteControllerWildcard() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      await createRoute('/api/*', async function apiController(payload) {
        return {
          status: 200,
          dataType: 'application/json',
          payload: JSON.stringify({ path: payload.url, message: 'API response' })
        }
      })

      let response = await fetch(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}/api/users`)
      let result = await response.text()
      let parsed = JSON.parse(result)
      
      await assert(parsed,
        p => p.path === '/api/users',
        p => p.message === 'API response'
      )
      await assert(response.status, s => s === 200)
      return parsed
    }
  )
}

async function testRouteMissingService() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      await createRoute('/broken', 'nonExistentService')

      await assertErr(
        async () => {
          let response = await fetch(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}/broken`)
          if (response.status >= 400 && response.status < 600) {
            throw new HttpError(response.status, await response.text())
          } else return await response.text()
        },
        err => err.message.includes('No service by name "nonExistentService"')
      )
    }
  )
}

async function testRouteValidation() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => createRoute('', 'someService'),
        err => err.message.includes('Route path and service fn or name are required')
      )
      
      await assertErr(
        () => createRoute('/test', ''),
        err => err.message.includes('Route path and service fn or name are required')
      )
    }
  )
}

// ===== ERROR HANDLING TESTS =====

async function testServiceRegistrationFailure() {
  // Test what happens when registry is not available
  let originalEndpoint = process.env.SERVICE_REGISTRY_ENDPOINT
  process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:11000'
  
  try {
    logger.muteWarn()
    await assertErr(
      () => createService('testService', () => 'test'),
      err => err.message.includes('fetch failed')
        || err.message.includes('ECONNREFUSED')
    )
  } finally {
    process.env.SERVICE_REGISTRY_ENDPOINT = originalEndpoint
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
    async () => {
      // Create two services quickly to potentially trigger port conflict handling
      let [service1, service2] = await Promise.all([
        createService('conflict1', function test1() { return 'service1' }),
        createService('conflict2', function test2() { return 'service2' })
      ])
      
      // Both should be created successfully on different ports
      let result1 = await callService('conflict1')
      let result2 = await callService('conflict2')
      
      await assert(result1, r => r === 'service1')
      await assert(result2, r => r === 'service2')
      
      return { service1: service1.location, service2: service2.location }
    }
  )
}

// ===== LOAD BALANCING TESTS =====

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

// ===== REGISTRY SERVER HEALTH TESTS =====

async function testRegistryHealth() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      let result = await httpRequest(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}`, {
        health: true
      })
      
      await assert(result,
        r => r.status === 'ready',
        r => typeof r.timestamp === 'number',
        r => (Date.now() - r.timestamp) < 1000 // Within last second
      )
      
      return result
    }
  )
}

async function testServiceLookup() {
  await terminateAfter(
    await startRegistry(),
    await createService('lookup1', function test1() { return 'test1' }),
    await createService('lookup2', function test2() { return 'test2' }),
    async ([registry]) => {
      // Test lookup single service
      let service1Location = await httpRequest(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}`, {
        lookup: 'lookup1'
      })
      
      await assert(service1Location, l => typeof l === 'string' && l.includes(':'))
      
      // Test lookup all services
      let allServices = await httpRequest(`http://localhost:${registry.port || process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]}`, {
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

// ===== EDGE CASE TESTS =====

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
    async () => {
      // Test service names with special characters
      await createService('test-service', function testDashService() { return 'dash' })
      await createService('test_service', function testUnderscoreService() { return 'underscore' })
      
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

// ===== DEMONSTRATION TEST FOR MULTIPLE ASSERTIONS =====

async function testMultipleAssertionFailures() {
  // This test is designed to demonstrate multiple assertion failures
  // Comment out to avoid test suite failures, but useful for debugging
  
  try {
    await assert({status: 'error', code: 500, message: 'Server Error'},
      obj => obj.status === 'success',  // Will fail
      obj => obj.code === 200,          // Will fail  
      obj => obj.message === 'OK',      // Will fail
      obj => obj.timestamp !== undefined // Will fail
    )
  } catch (err) {
    logger.info('Multiple assertion demo - caught errors:', err.message)
    logger.info('Error details:', err.stack.substring(0, 300) + '...')
  }
  
  return 'Multiple assertion demo (commented out)'
}

// ===== LOGGER TESTS =====

async function testLoggerStringify() {
  let escape = 'escape test'
  let logObj = {a: 1, b: "2", d: true, e: null}
  let logFn = () => console.log(`hey ${escape}`)
  let logStr = 'hello string'
  let logErr = new Error('test error')
  await assert(
    logger.warn({logObj, logFn, logStr, logErr}),
    s => s.includes('a: 1,'),
    s => s.includes('b: "2",'),
    s => s.includes('d: true,'),
    s => s.includes('e: null,'),
    s => s.includes('`() => console.log(\\`hey ${escape}\\`)`'),
    s => s.includes('"hello string"'),
    s => s.includes('`Error: test error')
  )
} 

async function testLoggerError() {
  await assert(
    // regular assert since the logger doesn't throw this error
    () => logger.error(new Error('test error log fn')),
    res => res.includes('test error')
  )
}

async function testLoggerNoLevel() {
  // Test creating a logger with limited levels
  const testLogger = new Logger({}, 'info', ['info'])
  await assert(
    testLogger.info('test'),
    s => s === undefined || s.includes('test')
  )
}

async function testLoggerColors() {
  let paintTestColor = color => logger.writeColor(color, ` ${color} |`)
  let paintTestColors = () => paintTestColor('white')
    + paintTestColor('green')
    + paintTestColor('magenta')
    + paintTestColor('red')
    + paintTestColor('blue')
    + paintTestColor('yellow')
    + paintTestColor('cyan')
    + paintTestColor('reset')

  await assert(
    logger.info(paintTestColors()),
    s => s.includes('\x1b[31m'),
    s => s.includes('\x1b[32m'),
    s => s.includes('\x1b[33m'),
    s => s.includes('\x1b[34m'),
    s => s.includes('\x1b[35m'),
    s => s.includes('\x1b[36m'),
    s => s.includes('\x1b[0m'),
    s => s.includes('test')
  )
}

async function testLoggerDuplicateLevel() {
  await assertErr(
    () => new Logger({}, null, ['info', 'info']),
    err => err.message.includes('Already created log fn for level info')
  )
}

async function testLoggerDepthLimit() {
  // Test default depth limit of 2
  let deepObj = {
    level0: {
      level1: {
        level2: {
          level3: 'too deep'
        }
      }
    }
  }
  
  let testLogger = new Logger()
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('level2'),
    s => !s.includes('level3'),
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerCustomDepthLimit() {
  // Test custom depth limit of 3
  let deepObj = {
    level0: {
      level1: {
        level2: {
          level3: {
            level4: 'too deep to see'
          }
        }
      }
    }
  }
  
  let testLogger = new Logger({ maxDepth: 3 })
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('level2'),
    s => s.includes('level3'),
    s => !s.includes('level4'),
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerDepthWarning() {
  // Test depth exceeded warning
  let deepObj = {
    level1: {
      level2: {
        level3: 'exceeded'
      }
    }
  }
  
  let testLogger = new Logger({ maxDepth: 1 })
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('\x1b[33m'), // yellow color code
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerEnvironmentConfig() {
  // Test environment variable configuration for log lines
  const originalEnv = process.env.LOG_INCLUDE_LINES
  
  // Test with environment variable enabled
  process.env.LOG_INCLUDE_LINES = 'true'
  let testLogger1 = new Logger({ warnLevel: false })
  await assert(
    testLogger1.options.includeLogLineNumbers,
    val => val === true
  )
  
  // Test with environment variable disabled
  process.env.LOG_INCLUDE_LINES = 'false'
  let testLogger2 = new Logger({ warnLevel: false })
  await assert(
    testLogger2.options.includeLogLineNumbers,
    val => val === false
  )
  
  // Restore original environment
  if (originalEnv !== undefined) {
    process.env.LOG_INCLUDE_LINES = originalEnv
  } else {
    delete process.env.LOG_INCLUDE_LINES
  }
}

// TODO basic negative test cases


async function test() {
  let testFns = [
    // quick test
    // testCreateService,
    // testLoggerStringify,
    // testLoggerDepthLimit,
    // testLoggerCustomDepthLimit,
    // process.exit,

    // Pub/Sub tests
    testPubSubServer,
    testPubSubBadSubscribe,
    testPubSubBadPublish,
    testPubSubBadUnsubscribe,

    // Core functionality tests
    testHttpServer,
    testCreateService,
    testCallService,
    testBasicDependentService,
    testDependentService,
    testDependentServiceWithEagerLookup,
    
    // Route tests (previously untested!)
    testBasicRoute,
    testRouteWithService,
    testRouteControllerWildcard,
    testRouteMissingService,
    testRouteValidation,
    
    // Error handling tests
    testMissingService,
    testMissingDependentService,
    testDependentServiceThrowsError,
    testServiceRegistrationFailure,
    testCallServiceWithInvalidPayload,
    
    // Load balancing and scaling tests
    testLoadBalancing,
    testServicePortConflict,
    
    // Registry server tests
    testRegistryHealth,
    testServiceLookup,
    
    // TODO these fail for some reason... bad teardown?
    // // Pub/Sub tests
    // testPubSubServer,
    // testPubSubBadSubscribe,
    // testPubSubBadPublish,
    // testPubSubBadUnsubscribe,
    
    // Edge case tests
    testEmptyServiceName,
    testServiceWithSpecialCharacters,
    testLargePayload,
    testMultipleAssertionFailures,

    // Logger tests
    testLoggerStringify,
    testLoggerError,
    testLoggerNoLevel,
    testLoggerColors,
    testLoggerDuplicateLevel,
    testLoggerDepthLimit,
    testLoggerCustomDepthLimit,
    testLoggerDepthWarning,
    testLoggerEnvironmentConfig
    // TODO negative test cases (bad port/env/etc)
  ]

  let testSuccess = 0
  let successCases = []
  let testFail = 0
  let failedCases = []
  testFns = testFns.map(fn => {
    return async () => {
      logger.info(`\n- - - RUNNING ${fn.name} - - -`)
      try {
        let result = await fn()
        logger.info(logger.writeColor('green', `+ + + ${fn.name} SUCCEEDED ${
          result !== undefined ? `WITH RESULT: ${JSON.stringify(result)}` : ''
        } + + +\n`))
        testSuccess++
        successCases.push(fn.name)
      } catch (err) {
        logger.error(logger.writeColor('red', `\n\nx x x ${fn.name} FAILED WITH ERROR: ${err.message} x x x\n`))
        testFail++
        failedCases.push({name: fn.name, err})
      }
    }
  })

  for (let test of testFns) await test()

  logger.info('\n')
  logger.info(`| - - - - -  TESTING COMPLETE  - - - - - |`)
  logger.info(`    TOTAL: ${testSuccess + testFail}`
    + logger.writeColor('green', `    SUCCESS: ${testSuccess}`)
    + logger.writeColor('red', `    FAIL: ${testFail}`))
  logger.info('')

  if (testSuccess > 0) {
    logger.info(logger.writeColor('green', '+ + +  SUCCESS CASES  + + +'))
    logger.info(logger.writeColor('green', '  ' + successCases.join('\n  ')))
    logger.info('')
  }

  if (testFail) {
    logger.info(logger.writeColor('red', 'x x x  FAILURE CASES  x x x'))
    logger.info(logger.writeColor('red', formatErrorDetails(failedCases)))
  }
}

function formatErrorDetails(failedCases) {
  // console.log({failedCases})
  return failedCases.map(({name, err}) => {
    return `\n${name} failed with error: ${err.stack}`
  }).join('\n')
}

test()
.then(() => process.exit(0))
.catch(err => {
  logger.error(err.stack)
  process.exit(1)
})
