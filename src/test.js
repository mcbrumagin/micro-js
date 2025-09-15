const httpRequest = require('./http-request.js')
const httpServer = require('./http-server.js')
const pubSubServer = require('./pub-sub-server.js')
const registryServer = require('./registry-server.js')
const createService = require('./create-service.js')
const callService = require('./call-service.js')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function testHttpServer () {
  let server = await httpServer(10000, function test(payload) {
    console.log(`in test httpServer, got payload "${JSON.stringify(payload)}"`)
    return Date.now()
  })
  try {
    let result = await httpRequest('http://localhost:10000', { testPayload: 'testPayload' })
    //console.log('httpRequest result', result)
    return new Date() - Number(result) + 'ms request/response time'
  } finally {
    await server.terminate()
  }
}

async function testPubSubServer() {
  let server = await pubSubServer(10000)
  
  let subServer1 = await httpServer(10001, function subscriber(payload) {
    console.log(`Got published message [1]: ${JSON.stringify(payload)}`)
  })

  let subServer2 = await httpServer(10002, function subscriber(payload) {
    console.log(`Got published message [2]: ${JSON.stringify(payload)}`)
  })
  try {
    let start = Date.now()
    // TODO commit/push then reset to before type/location (see if/how it worked)
    await httpRequest('http://localhost:10000', { subscribe: { type: 'test', location: 'http://localhost:10001' }})
    await httpRequest('http://localhost:10000', { subscribe: { type: 'test', location: 'http://localhost:10002' }})
    await httpRequest('http://localhost:10000', { publish: { type: 'test', message: 'TEST [1]' }})
    await httpRequest('http://localhost:10000', { unsubscribe: { type: 'test', location: 'http://localhost:10002' }})
    await httpRequest('http://localhost:10000', { publish: { type: 'test', message: 'TEST [2]' }})
    // TODO assert on req results
    return Date.now() - start + 'ms - for various pubSubServer requests'
  } finally {
    await subServer1.terminate()
    await subServer2.terminate()
    await server.terminate()
  }
}

async function startRegistry() {
  let port = process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]
  let server = await registryServer(port)
  // console.log('waited for registry server in test helper: ', server)
  console.log('registry server terminate: ', server.terminate)
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
    //console.log(`GOT httpRequest result: ${JSON.stringify(result, null, 2)}`)
    console.log({result})
    return result
  } finally {
    await server.terminate()
    await registry.terminate()
  }
}

async function testCallService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  console.log('START')
  let registry = await startRegistry()
  // there's a race condition in the registry server starting before create service calls to register
  // await sleep(500)
  console.log('CREATE SERVICE TEST')
  let server = await createService('test', function testService(payload) {
    // console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  try {
    console.log('CALL SERVICE TEST')
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    //console.log(`GOT callService result: ${JSON.stringify(result, null, 2)}`)
    return result
  } catch (err) {
    console.log('ERR IN testCallService', err.stack)
    throw err
  } finally {
    await server.terminate()
    await registry.terminate()
    console.log({registry})
  }
}


async function testBasicDependentService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000'
  registry = await startRegistry()
  // await sleep(500)
  console.log({registry})

  server2 = await createService('test2', async function testService(payload) {
    return payload + ' plus test2 call'
  })

  server1 = await createService('test', function testService(payload) {
    return this.call('test2', payload + ' plus test call') 
  })

  try {
    console.log('CALL SERVICE TEST')
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    //console.log(`GOT callService result: ${JSON.stringify(result, null, 2)}`)
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
    console.log(err.stack)
  } finally {
    await server1.terminate()
    await server2.terminate()
    await server3.terminate()
    await server4.terminate()
    await registry.terminate()
    console.log('CLEANED UP SERVERS')
  }
}

// TODO what makes this an eager lookup?
async function testDependentServiceWithEagerLookup() {
  process.env.SERVICE_REGISTRY_ENDPOINT = 'http://localhost:10000' // this just gets used in our startRegistry fn
  let registry, server1, server2, server3, server4
  try {
    registry = await startRegistry()
    server2 = await createService('test2', async payload => await callService('test3', payload))

    // TODO create test logger fn that logs the current line number by pulling from an err stack
    var { service, location } = server2
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    server1 = await createService('test', async payload => `TEST SERVICE RESULT... ${payload}`)
    
    // TODO create test logger fn that logs the current line number by pulling from an err stack
    var { service, location } = server1
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)
    

    // await sleep(5)
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    // TODO assert result

    server3 = await createService(async function test3(payload) {
      let result = await callService('test', 'HELL')
      return result + ' YEAH BABY' // should be right before " DUDE!"
    })

    // TODO create test logger fn that logs the current line number by pulling from an err stack
    var { service, location } = server3
    console.log(`IN TEST CREATED SERVICE ${service} AT LOCATION ${location}`)

    // await sleep(5)
    result = await callService('test2', {})
    // TODO assert result

    server4 = await createService(async function test4(payload) {
      let result = await callService('test2', 'YAY!')
      return result + ', DUDE!' // final result ends with DUDE (1st service call, last append)
    })

    // TODO create test logger fn that logs the current line number by pulling from an err stack
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


async function raceHelper() {
  return sleep(500)
}

// TODO test fail count
// TODO logger w/ console levels
async function test() {
  let testFns = [
    testHttpServer,
    testPubSubServer,
    // raceHelper,
    testCreateService,
    // raceHelper,
    testCallService,
    // raceHelper,
    testBasicDependentService,
    testDependentService,
    testCallService,
    testCallService,
    // // raceHelper,
    testDependentServiceWithEagerLookup,
    // testDependentServiceWithEagerLookup
    // TODO negative test cases (bad port/env/etc)
  ]

  let testSuccess = 0
  let testFail = 0
  let failedCases = []
  testFns = testFns.map(fn => {
    return async () => {
      console.log(`\nRunning ${fn.name}`)
      try {
        let result = await fn()
        console.log(`\n\n+++++ TEST COMPLETED WITH RESULT: ${ typeof result === 'object' ? JSON.stringify(result) : result} +++++\n`)
        testSuccess++
      } catch (err) {
        console.log(`\n\n----- TEST FAILED WITH ERROR: ${err.stack} -----\n`)
        testFail++
        failedCases.push(fn.name)
      }
    }
  })

  for (let test of testFns) await test()

  if (failedCases.length > 0) failedCases.unshift('FAILURE CASES:')
  console.log(`TEST RUN FINISHED...
    TOTAL: ${testSuccess + testFail}
    SUCCESS: ${testSuccess}
    FAIL: ${testFail}
    
    ${failedCases.length > 0 ? `\n${failedCases.join('\n    ')}` : ''}`
  )

  // failedCases.unshift('')
  // console.log(failedCases.join('\n    '))
}

test()
.then(() => process.exit(0))
.catch(err => {
  console.log(err.stack)
  process.exit(1)
})
