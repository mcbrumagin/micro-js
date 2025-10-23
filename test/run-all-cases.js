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

import { HEADERS, COMMANDS } from '../src/utils/micro-headers.js'

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
      let result = await httpRequest('http://localhost:10000', {
        body: { testPayload: 'testPayload' }
      })
      return new Date() - Number(result) + 'ms request/response time'
    }
  )
}

async function testRegistryHealth() {
  await terminateAfter(
    await startRegistry(),
    async ([registry]) => {
      let result = await httpRequest(process.env.MICRO_REGISTRY_URL, {
        headers: { [HEADERS.COMMAND]: COMMANDS.HEALTH }
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

import serviceTests from './cases/create-service-tests.js'
import routesTests from './cases/route-tests.js'
import loggerTests from './cases/logger-tests.js'
import registryModuleTests from './cases/registry-module-tests.js'
import streamingTests from './cases/streaming-tests.js'
import headerCommandTests from './cases/header-command-tests.js'
import errorHandlingTests from './cases/error-handling-tests.js'
import edgeCaseTests from './cases/edge-case-tests.js'
import loadBalancerTests from './cases/load-balancer-tests.js'

import cacheServiceTests from './cases/services/cache-tests.js'
import pubsubTests from './cases/services/pubsub-tests.js'
import staticFileServiceTests from './cases/services/static-file-tests.js'
import fileUploadTests from './cases/services/file-upload-tests.js'
import authTests from './cases/services/auth-tests.js'
import registryTokenTests from './cases/registry-token-tests.js'

// TODO solo support for test suites
// TODO cli support for test runs by name or suite
let testFns = mergeAllTestsSafely(
  testHttpServer,
  testRegistryHealth,
  testMultipleAssertionFailures,
  registryModuleTests,
  serviceTests,
  routesTests,
  loggerTests,
  streamingTests,
  headerCommandTests,
  errorHandlingTests,
  edgeCaseTests,
  loadBalancerTests,
  cacheServiceTests,
  pubsubTests,
  staticFileServiceTests,
  fileUploadTests,
  authTests,
  registryTokenTests
)

// TODO update readme for test object support, merge helper, solo/mute flags
runTests(testFns)
.then(() => process.exit(0))
.catch(err => {
  logger.error(err.stack)
  process.exit(1)
})
