import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'

import {
  createRoute,
  createRoutes,
  createService,
  HttpError,
  Logger,
  HEADERS,
  COMMANDS
} from '../../src/index.js'

const logger = new Logger()

async function testBasicRoute() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/hello', async function helloService() {
      return 'Hello World!'
    }),
    async ([registry]) => {
      // Test direct HTTP request to route - no special headers needed!
      let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/hello`)
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

      let response = await fetch(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}/greet`)
      let result = await response.text()
      
      await assert(result, r => r.includes('Hello World!'))
      await assert(response.status, s => s === 200)
      return result
    }
  )
}

async function testRouteBulkCreate() {
  await terminateAfter(
    await startRegistry(),
    await createService('greetingService', function greetingService(payload) {
      return `Hello ${payload.name || 'World'}!`
    }),
    await createService('greetingService2', function greetingService2(payload) {
      return `Well g'day then, ${payload.name || 'World'}!`
    }),
    async ([registry]) => {
      await createRoutes({
        '/greet': 'greetingService',
        '/greet2': 'greetingService',
        '/greet3': 'greetingService2'
      })

      let baseUrl = `http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`

      let result1 = await (await fetch(`${baseUrl}/greet`)).text()
      let result2 = await (await fetch(`${baseUrl}/greet2`)).text()

      let requestPayloadOptions = {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ name: 'John' })
      }
      let result3 = await (await fetch(`${baseUrl}/greet3`, requestPayloadOptions)).text()
      
      await assert([result1, result2, result3],
        ([r1, r2]) => r1 === r2,
        ([,,r3]) => r3 === `Well g'day then, John!`
      )
    }
  )
}


async function testRouteInlineServiceCreation() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/greet', function greetingService(payload) {
      return `Hello ${payload.name || 'World'}!`
    }),
    async ([registry]) => {
      let baseUrl = `http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}`

      let result = await (await fetch(`${baseUrl}/greet`)).text()
      
      await assert(result, r => r.includes(`Hello World!`))
    }
  )
}

async function testRouteControllerWildcard() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/*', async function apiController(payload, request) {
      return { path: request.url, message: 'API response' }
    }),
    async ([registry]) => {
      let response = await fetch(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}/api/users`)
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
          let response = await fetch(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}/broken`)
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

export default {
  testBasicRoute,
  testRouteWithService,
  testRouteBulkCreate,
  testRouteInlineServiceCreation,
  testRouteControllerWildcard,
  testRouteMissingService,
  testRouteValidation
}
