const httpRequest = require('./http-request.js')
const httpServer = require('./http-server.js')
const pubSubServer = require('./pub-sub-server.js')
const registryServer = require('./registry-server.js')
const createService = require('./create-service.js')
const callService = require('./call-service.js')
const Logger = require('./logger.js')
const HttpError = require('./http-error.js')

const logger = new Logger({
  // serviceName: 'test',
  overrideConsoleLog: true,
  // includeLogLineNumbers: true
})

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// TODO move assert fns to own module

async function assert(valOrFn, assertFn) {
  let result
  if (typeof valOrFn === 'function') result = await valOrFn()
  else result = valOrFn

  let assertResult = await assertFn(result)
  if (assertResult != true) throw new Error(
    `Assert failed for \nval: ${result}\nassertFn: ${assertFn.toString()}`
  )
}

async function assertErr(errOrFn, assertFn) {
  let err
  if (typeof errOrFn === 'function') await errOrFn().catch(e => err = e)
  else err = errOrFn

  if (!(err instanceof Error)) {
    let message = `Assert expected an error but received \nval: ${err}`
    if (typeof errOrFn === 'function') message += `\n fn: ${errOrFn}`
    throw new Error(message)
  }

  let assertResult = await assertFn(err)
  if (assertResult != true) throw new Error(
    `Assert failed for \nerr: ${err}\nassertFn: ${assertFn.toString()}`
  )
}


async function terminateAfter(...args /* ...serverFns, testFn */) {
  args.unshift(args.pop()) // rearrange for spread
  let [testFn, ...serverFns] = args
  let servers = await Promise.all(serverFns)

  // TODO handle setup error early and prevent full test run?

  try {
    await testFn(servers)
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
      console.log(`in test httpServer, got payload "${JSON.stringify(payload)}"`)
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
      console.log(`Got published message [1]: ${JSON.stringify(payload)}`)
    }),
    await httpServer(10002, function subscriber(payload) {
      console.log(`Got published message [2]: ${JSON.stringify(payload)}`)
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
  console.log(`waited for registry server in test helper, at port: ${port}`)
  return server
}

// let lastTestPort = 10000
// let getTestPortRange

async function testCreateService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  let registry = await startRegistry()
  let name = 'test'
  let server = await createService(name, function testService(payload) {
    // console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    payload.prop3 = 'test'
    return payload
  })

  try {
    let result = await httpRequest('http://localhost:10000', {
      call: {
        name,
        payload: { prop1: 'test', prop2: 'test' }
      }
    })
    console.log(`GOT httpRequest result: ${JSON.stringify(result, null, 2)}`)
    return result
  } finally {
    await server.terminate()
    await registry.terminate()
  }
}

async function testCallService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  let registry = await startRegistry()
  let server = await createService('test', function testService(payload) {
    console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  try {
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    return result
  } catch (err) {
    console.log('ERR IN testCallService', err.stack)
    throw err
  } finally {
    await server.terminate()
    await registry.terminate()
  }
}


async function testBasicDependentService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  registry = await startRegistry()

  server2 = await createService('test2', async function testService(payload) {
    return { ...payload, test2: 'called test2' }
  })

  server1 = await createService('test', function testService(payload) {
    return this.call('test2', { ...payload, test: 'called test' }) 
  })

  try {
    console.log('CALL SERVICE TEST')
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    console.log(`GOT callService result: ${JSON.stringify(result, null, 2)}`)
    return result
  } catch (err) {
    console.log('ERR IN testCallService', err.stack)
    throw err
  } finally {
    await server1.terminate()
    await server2.terminate()
    await registry.terminate()
  }
}

async function testMissingService() {
  let registry = await startRegistry()
  try {
    await assertErr(
      () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
      err => err.message.includes('No service by name "test"')
    )
  } finally {
    await registry.terminate()
  }
}


async function testMissingDependentService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  registry = await startRegistry()

  server1 = await createService('test', function testService(payload) {
    return this.call('test2', payload + ' plus bad call') 
  })

  try {
    await assertErr(
      () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
      err => err.message.includes('No service by name "test2" in cache')
    )
  } finally {
    await server1.terminate()
    await registry.terminate()
  }
}

async function testDependentService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:14000'
  let registry, server1, server2, server3, server4
  try {
    registry = await startRegistry()
    server2 = await createService('test2', async function testService(payload) {
      let result = await this.call('test3', payload)
      return result
    })

    server1 = await createService('test', function testService(payload) {
      return 'TEST SERVICE RESULT'
    })

    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    server3 = await createService('test3', async function testService(payload) {
      let res = await this.call('test', 'YEAH!')
      return res + ' SWEET!'
    })
    result = await callService('test2', {})
    server4 = await createService('test4', async function testService(payload) {
      let res = await this.call('test2', 'YAY!')
      return res + ' DUDE!'
    })
    result = await callService('test4', {})
    return result
  } catch (err) {
    console.log('ERR IN testDependentService', err.stack)
  } finally {
    // TODO termination helper for multiple services, always do registry last
    await server1.terminate()
    await server2.terminate()
    await server3.terminate()
    await server4.terminate()
    await registry.terminate()
  }
}

// TODO what makes this an eager lookup?
async function testDependentServiceWithEagerLookup() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000' // this just gets used in our startRegistry fn
  let registry, server1, server2, server3, server4
  try {
    registry = await startRegistry()
    server2 = await createService('test2', async payload => await callService('test3', payload))

    var { service, location } = server2
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    server1 = await createService('test', async payload => `TEST SERVICE RESULT... ${payload}`)
    
    var { service, location } = server1
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    // TODO assert result

    server3 = await createService(async function test3(payload) {
      let result = await callService('test', 'HELL')
      return result + ' YEAH BABY' // should be right before " DUDE!"
    })

    var { service, location } = server3
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    result = await callService('test2', {})
    // TODO assert result

    server4 = await createService(async function test4(payload) {
      let result = await callService('test2', 'YAY!')
      return result + ', DUDE!' // final result ends with DUDE (1st service call, last append)
    })

    var { service, location } = server4
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    result = await callService('test4')
    return result
  } finally {
    await server1.terminate()
    await server2.terminate()
    await server3.terminate()
    await server4.terminate()
    await registry.terminate()
  }
}

async function testDependentServiceThrowsError() {
  await terminateAfter(
    await startRegistry(),
    await createService('test', async function testService(payload) {
      throw new Error('Test error from inside service fn')
    }),
    async () => {
      await assertErr(
        () => callService('test', { prop1: 'wow', prop2: 'it fails' }),
        err => err.message.includes('Test error from inside service fn')
      )
    }
  )
}

// TODO basic negative test cases


async function test() {
  let testFns = [
    testHttpServer,
    testPubSubServer,
    testPubSubBadSubscribe,
    testPubSubBadPublish,
    testPubSubBadUnsubscribe,
    testCreateService,
    testCallService,
    testBasicDependentService,
    testDependentService,
    testDependentServiceWithEagerLookup,
    testMissingService,
    testMissingDependentService,
    testDependentServiceThrowsError,
    // TODO negative test cases (bad port/env/etc)
  ]

  let testSuccess = 0
  let successCases = []
  let testFail = 0
  let failedCases = []
  testFns = testFns.map(fn => {
    return async () => {
      console.log(`\n- - - RUNNING ${fn.name} - - -`)
      try {
        let result = await fn()
        console.info(logger.writeColor('green', `+ + + ${fn.name} SUCCEEDED ${
          result !== undefined ? `WITH RESULT: ${JSON.stringify(result)}` : ''
        } + + +\n`))
        testSuccess++
        successCases.push(fn.name)
      } catch (err) {
        console.error(logger.writeColor('red', `\n\nx x x ${fn.name} FAILED WITH ERROR: ${err.message} x x x\n`))
        testFail++
        failedCases.push({name: fn.name, err})
      }
    }
  })

  for (let test of testFns) await test()

  console.info('\n')
  console.info(`| - - - - -  TESTING COMPLETE  - - - - - |`)
  console.info(`    TOTAL: ${testSuccess + testFail}`
    + logger.writeColor('green', `    SUCCESS: ${testSuccess}`)
    + logger.writeColor('red', `    FAIL: ${testFail}`))
  console.info('')

  if (testSuccess > 0) {
    console.info(logger.writeColor('green', '+ + +  SUCCESS CASES  + + +'))
    console.info(logger.writeColor('green', '  ' + successCases.join('\n  ')))
    console.info('')
  }

  if (testFail) {
    console.info(logger.writeColor('red', 'x x x  FAILURE CASES  x x x'))
    console.info(logger.writeColor('red', formatErrorDetails(failedCases)))
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
  console.log(err.stack)
  process.exit(1)
})
