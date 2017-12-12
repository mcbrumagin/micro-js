const httpRequest = require('./http-request.js')
const httpServer = require('./http-server.js')
const pubSubServer = require('./pub-sub-server.js')
const registryServer = require('./registry-server.js')
const createService = require('./create-service.js')
const callService = require('./call-service.js')

async function testHttpServer () {
  await httpServer(11000, function test(payload) {
    console.log(`in test httpServer, got payload "${JSON.stringify(payload)}"`)
    return 'TEST ' + Math.random()
  })

  let result = await httpRequest('localhost:11000', { testPayload: 'testPayload' })
  console.log('httpRequest result', result)
}

async function testPubSubServer() {
  await pubSubServer(11000)

  httpServer(11001, function subscriber(payload) {
    console.log(`Got published message [1]: ${JSON.stringify(payload)}`)
  })

  httpServer(11002, function subscriber(payload) {
    console.log(`Got published message [2]: ${JSON.stringify(payload)}`)
  })

  await httpRequest('localhost:11000', { subscribe: 'localhost:11001' })
  await httpRequest('localhost:11000', { subscribe: 'localhost:11002' })
  await httpRequest('localhost:11000', { publish: 'TEST [1]' })
  await httpRequest('localhost:11000', { unsubscribe: 'localhost:11002' })
  await httpRequest('localhost:11000', { publish: 'TEST [2]' })
}

async function testCreateService() {
  console.log('running testCreateService')

  await createService('test', function testService(payload) {
    console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  let test = 'test'
  let result = await httpRequest('localhost:10000', { prop1: test, prop2: test })
  console.log(`GOT httpRequest result: ${JSON.stringify(result, null, 2)}`)
}


async function testCallService() {
  console.log('running testCallService')

  await createService('test', function testService(payload) {
    console.log(`GOT PAYLOAD: ${JSON.stringify(payload, null, 2)}`)
    return 'TEST SERVICE RESULT'
  })

  let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
  console.log(`GOT callService result: ${JSON.stringify(result, null, 2)}`)
}

async function startRegistry() {
  let port = process.env.SERVICE_REGISTRY_HOST.split(':')[1]
  await registryServer(port)
}

async function testDependentService() {
  await createService('test2', async function testService(payload) {
    let result = await this.call('test3', payload)
    return result
  })
  await createService('test', function testService(payload) {
    return 'TEST SERVICE RESULT'
  })
  let result = await callService('test', { prop1: 'wow', prop2: 'it works' })
  await createService('test3', async function testService(payload) {
    let res = await this.call('test', 'YEAH!')
    return res + ' SWEET!'
  })
  result = await callService('test2', '')
  await createService('test4', async function testService(payload) {
    let res = await this.call('test2', 'YAY!')
    return res + ' DUDE!'
  })
  result = await callService('test4', '')
}

async function testDependentServiceWithEagerLookup() {

  await createService('test2', async payload => await callService('test3', payload))
  await createService('test', async payload => 'TEST SERVICE RESULT')

  let result = await callService('test', { prop1: 'wow', prop2: 'it works' })

  await createService(async function test3(payload) {
    let result = await callService('test', 'YEAH')
    return result + 'WEJADOFGSODFGK'
  })

  result = await callService('test2', '')

  await createService(async function test4(payload) {
    let result = await callService('test20', 'YAY!')
    return result + ' DUDE!'
  })

  result = await callService('test4', '')
  console.log({result})
}

async function test() {
  // await testHttpServer()
  // await testPubSubServer()
  // await testCreateService()
  // await testCallService()
  await startRegistry()
  await testDependentService()
  await testDependentServiceWithEagerLookup()
}

test()
.then(() => process.exit(0))
.catch(err => {
  console.log(err.stack)
  process.exit(1)
})
