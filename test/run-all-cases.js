import httpRequest from '../src/http-primitives/http-request.js'
import httpServer from '../src/http-primitives/http-server.js'

import {
  Logger,
  overrideConsoleGlobally
} from '../src/index.js'

import {
  assert,
  assertErr,
  MultiAssertError,
  sleep,
  terminateAfter,
  mergeAllTestsSafely,
  startRegistry,
  runTests
} from './core/index.js'

overrideConsoleGlobally({
  includeLogLineNumbers: true
})

const logger = new Logger({
  // logGroup: 'test',
  includeLogLineNumbers: true,
  warnLevel: true
})


// --- Miscellaneous Cases --- //

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

async function testRegistryHealth() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      let result = await httpRequest(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`, {
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

async function testMultipleAssertionFailures() {
  try {
    await assert({status: 'error', code: 500, message: 'Server Error'},
      obj => obj.status === 'success',   // Will fail
      obj => obj.code === 200,           // Will fail  
      obj => obj.message === 'OK',       // Will fail
      obj => obj.timestamp !== undefined // Will fail
    )
  } catch (err) {
    if (err instanceof MultiAssertError) {
      logger.info('Multiple assertion demo - caught errors:', err.message)
      logger.info('Error details:', err.stack.substring(0, 300) + '...')
    } else throw err
  }
}

// --- Test Suites --- //

import serviceTests from './cases/service-tests.js'
import routesTests from './cases/route-tests.js'
import loggerTests from './cases/logger-tests.js'
import pubsubTests from './cases/pubsub-tests.js'
import registryModuleTests from './cases/registry-module-tests.js'

let testFns = mergeAllTestsSafely(
  testHttpServer,
  testRegistryHealth,
  testMultipleAssertionFailures,
  registryModuleTests,
  serviceTests,
  routesTests,
  loggerTests,
  pubsubTests
)

// TODO update readme for test object support, merge helper, solo/mute flags
runTests(testFns)
.then(() => process.exit(0))
.catch(err => {
  logger.error(err.stack)
  process.exit(1)
})
