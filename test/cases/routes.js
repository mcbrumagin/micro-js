import { assert, assertErr, terminateAfter, startRegistry } from '../core/index.js'
import { createRoute, createService, HttpError, Logger } from '../../src/index.js'

const logger = new Logger({
  // logGroup: 'routesTests',
  // includeLogLineNumbers: true,
  // warnLevel: true
})

async function testBasicRoute() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/hello', async function helloService() {
      return 'Hello World!'
    }),
    async ([registry]) => {
      // Test direct HTTP request to route
      let response = await fetch(`http://localhost:${registry.port || process.env.MICRO_REGISTRY_URL.split(':')[2]}/hello`)
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

async function testRouteControllerWildcard() {
  await terminateAfter(
    await startRegistry(),
    await createRoute('/api/*', async function apiController(payload) {
      return {
        status: 200,
        dataType: 'application/json',
        payload: JSON.stringify({ path: payload.url, message: 'API response' })
      }
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

export default [
  testBasicRoute,
  testRouteWithService,
  testRouteControllerWildcard,
  testRouteMissingService,
  testRouteValidation
]
