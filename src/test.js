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
    return 'TEST ' + Math.random()
  })
  try {
    let result = await httpRequest('127.0.0.1:10000', { testPayload: 'testPayload' })
    //console.log('httpRequest result', result)
    return result
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
    await httpRequest('127.0.0.1:10000', { subscribe: '127.0.0.1:10001' })
    await httpRequest('127.0.0.1:10000', { subscribe: '127.0.0.1:10002' })
    await httpRequest('127.0.0.1:10000', { publish: 'TEST [1]' })
    await httpRequest('127.0.0.1:10000', { unsubscribe: '127.0.0.1:10002' })
    await httpRequest('127.0.0.1:10000', { publish: 'TEST [2]' })
  } finally {
    server && await server.terminate()
    subServer1 && await subServer1.terminate()
    subServer2 && await subServer2.terminate()
  }
}

async function startRegistry() {
  let port = process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[1]
  let server = await registryServer(port)
  return server
}

async function testCreateService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = '127.0.0.1:10000'
  let registry = await startRegistry()
  let server = await createService('test', function testService(payload) {
    // console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  try {
    let test = 'test'
    let result = await httpRequest('127.0.0.1:10000', { prop1: test, prop2: test })
    //console.log(`GOT httpRequest result: ${JSON.stringify(result, null, 2)}`)
    return result
  } finally {
    await registry.terminate()
    await server.terminate()
  }
}

async function testCallService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = '127.0.0.1:10000'
  let registry = await startRegistry()
  let server = await createService('test', function testService(payload) {
    // console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  try {
    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
    //console.log(`GOT callService result: ${JSON.stringify(result, null, 2)}`)
    return result
  } finally {
    await registry.terminate()
    await server.terminate()
  }
}


async function testDependentService() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = '127.0.0.1:14000'
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
  } finally {
    server1 && await server1.terminate()
    server2 && await server2.terminate()
    server3 && await server3.terminate()
    server4 && await server4.terminate()
    registry && await registry.terminate()
  }
}

async function testDependentServiceWithEagerLookup() {
  // process.env.SERVICE_REGISTRY_ENDPOINT = '127.0.0.1:15000'
  let registry, server1, server2, server3, server4
  try {
    regsitry = await startRegistry()
    server2 = await createService('test2', async payload => await callService('test3', payload))
    server1 = await createService('test', async payload => 'TEST SERVICE RESULT')

    let result = await callService('test', { prop1: 'wow', prop2: 'it works' })

    server3 = await createService(async function test3(payload) {
      let result = await callService('test', 'YEAH')
      return result + ' YEAH BABY'
    })

    result = await callService('test2', {})

    server4 = await createService(async function test4(payload) {
      let result = await callService('test2', 'YAY!')
      return result + ' DUDE!'
    })

    result = await callService('test4', {})
    return result
  } finally {
    server1 && await server1.terminate()
    server2 && await server2.terminate()
    server3 && await server3.terminate()
    server4 && await server4.terminate()
    registry && await registry.terminate()
  }
}

async function test() {
  let testFns = [
    testHttpServer,
    testPubSubServer,
    testCreateService,
    testCallService,
    testDependentService,
    testDependentServiceWithEagerLookup
    // TODO negative test cases (bad port/env/etc)
  ]

  testFns = testFns.map(fn => {
    return async () => {
      console.log(`\nRunning ${fn.name}`)
      try {
        let result = await fn()
        console.log(`Test completed with result ${result}`)
      } catch (err) {
        console.log(`Test failed with error: ${err.stack}`)
      }
    }
  })

  for (let test of testFns) await test()
}

test()
.then(() => process.exit(0))
.catch(err => {
  console.log(err.stack)
  process.exit(1)
})
