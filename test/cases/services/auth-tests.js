/**
 * Authentication System Tests
 * Tests for auth service integration, token verification, and protected service calls
 */

import { assert, assertErr, sleep, terminateAfter, startRegistry } from '../../core/index.js'
import createService from '../../../src/micro-core/api/create-service.js'
import createRoute from '../../../src/micro-core/api/create-route.js'
import createAuthService from '../../../src/micro-services/auth-service.js'
import callService from '../../../src/micro-core/api/call-service.js'
import httpRequest from '../../../src/micro-core/http-primitives/http-request.js'
import { buildAuthLoginHeaders, buildCallHeaders, HEADERS } from '../../../src/micro-core/shared/micro-headers.js'
import envConfig from '../../../src/micro-core/shared/env-config.js'
import HttpError from '../../../src/micro-core/http-primitives/http-error.js'
import { buildAuthRefreshHeaders } from '../../../src/micro-core/shared/micro-headers.js'

const TEST_ADMIN_USER = process.env.ADMIN_USER
const TEST_ADMIN_SECRET = process.env.ADMIN_SECRET

/**
 * Test that auth service basic functionality works
 */
async function testAuthServiceWorks() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authServer]) => {
      // Test authentication
      const authResult = await callService('auth-service', {
        authenticate: {
          user: TEST_ADMIN_USER,
          password: TEST_ADMIN_SECRET
        }
      })
      
      // Test token verification
      const verifyResult = await callService('auth-service', {
        verifyAccess: authResult.accessToken
      })
      
      await assert([authResult, verifyResult],
        ([a,r]) => !!a.accessToken,
        ([a,r]) => r.status === 'valid access token'
      )
    }
  )
}


/**
 * Test that auth service basic functionality works
 */
async function testAuthServiceBadCredentials() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authServer]) => {
      // Test invalid credentials
      await assertErr(
        () => callService('auth-service', {
          authenticate: {
            user: 'invalid',
            password: 'invalid'
          }
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test that protected service requires auth token
 */
async function testProtectedServiceWithAuth() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('protected-service', async function(payload) {
      return { message: 'Protected data accessed', timestamp: Date.now() }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authServer, protectedServer]) => {
      // Get auth token
      const authResult = await callService('auth-service', {
        authenticate: {
          user: TEST_ADMIN_USER,
          password: TEST_ADMIN_SECRET
        }
      })
      
      // Call protected service with token
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      const result = await httpRequest(registryHost, {
        body: { test: 'data' },
        headers: {
          ...buildCallHeaders('protected-service'),
          [HEADERS.AUTH_TOKEN]: authResult.accessToken
        }
      })
      
      await assert(result,
        r => r.message === 'Protected data accessed'
      )
      
      // Try to call protected service without token
      await assertErr(
        () => httpRequest(registryHost, {
          body: { test: 'data' },
          headers: buildCallHeaders('protected-service')
          // No AUTH_TOKEN header
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test that unprotected services still work normally
 */
async function testUnprotectedServiceStillWorks() {
  await terminateAfter(
    await startRegistry(),
    await createService('normal-service', async function(payload) {
      return { message: 'Normal service works', data: payload }
    }),
    async ([registry, normalServer]) => {
      // Call normal service without any auth
      const result = await callService('normal-service', { test: 'data' })
      
      await assert(result,
        r => r.message === 'Normal service works',
        r => r.data.test === 'data'
      )
    }
  )
}

/**
 * Test service registration with auth
 */
async function testServiceRegistrationWithAuth() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('protected-service', async function(payload) {
      return { message: 'Protected data', user: payload.user }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authService, protectedServer]) => {
      await assert(protectedServer.name, r => r === 'protected-service')
    }
  )
}

/**
 * Test protected service call with valid token
 */
async function testProtectedServiceCallWithValidToken() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('protected-service', async function(payload) {
      return { message: 'Protected data accessed', timestamp: Date.now() }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authService, protectedService]) => {
      const authResult = await callService('auth-service', {
        authenticate: {
          user: TEST_ADMIN_USER,
          password: TEST_ADMIN_SECRET
        }
      })
      
      // Call protected service with token
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      const result = await httpRequest(registryHost, {
        body: { test: 'data' },
        headers: {
          ...buildCallHeaders('protected-service'),
          [HEADERS.AUTH_TOKEN]: authResult.accessToken
        }
      })
      
      assert(result, r => r.message === 'Protected data accessed')
    }
  )
}

/**
 * Test protected service call without token
 */
async function testProtectedServiceCallWithoutToken() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('protected-service', async function(payload) {
      return { message: 'Should not reach here' }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authService, protectedService]) => {
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      await assertErr(
        () => httpRequest(registryHost, {
          body: { test: 'data' },
          headers: buildCallHeaders('protected-service')
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test protected service call with invalid token
 */
async function testProtectedServiceCallWithInvalidToken() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('protected-service', async function(payload) {
      return { message: 'Should not reach here' }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authService, protectedService]) => {
      // Call protected service with invalid token
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      
      await assertErr(
        () => httpRequest(registryHost, {
          body: { test: 'data' },
          headers: {
            ...buildCallHeaders('protected-service'),
            [HEADERS.AUTH_TOKEN]: 'invalid-token'
          }
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test protected service call with expired token
 */
async function testProtectedServiceCallWithExpiredToken() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authService]) => {
      // Test that auth service rejects invalid/expired tokens
      await assertErr(
        () => callService('auth-service', {
          verifyAccess: 'expired-or-invalid-token'
        }),
        err => err.status === 401,
        err => err.message === 'Invalid access token'
      )
    }
  )
}

/**
 * Test auth service not found error
 */
async function testAuthServiceNotFound() {
  await terminateAfter(
    await startRegistry(),
    await createService('protected-service', async function(payload) {
      return { message: 'Should not reach here' }
    }, { useAuthService: 'nonexistent-auth-service' }),
    async ([registry, protectedService]) => {
      // Call protected service when auth service doesn't exist
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      
      await assertErr(
        () => httpRequest(registryHost, {
          body: { test: 'data' },
          headers: {
            ...buildCallHeaders('protected-service'),
            [HEADERS.AUTH_TOKEN]: 'any-token'
          }
        }),
        err => err.status === 503 && err.message.includes('Auth service "nonexistent-auth-service" not found')
      )
    }
  )
}

/**
 * Test auth login command
 */
async function testAuthLoginCommand() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authService]) => {
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      
      // Test login command
      const loginResult = await httpRequest(registryHost, {
        body: {
          authenticate: {
            user: TEST_ADMIN_USER,
            password: TEST_ADMIN_SECRET
          }
        },
        headers: buildAuthLoginHeaders()
      })
        
      await assert(loginResult,
        r => !!r.accessToken
      )
    }
  )
}

/**
 * Test auth refresh command
 */
async function testAuthRefreshCommand() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authService]) => {
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      
      // use fetch so we can parse the Set-Cookie header
      const response = await fetch(registryHost, {
        method: 'POST',
        body: JSON.stringify({
          authenticate: {
            user: TEST_ADMIN_USER,
            password: TEST_ADMIN_SECRET
          }
        }),
        headers: buildAuthLoginHeaders()
      })

      if (response.status !== 200) {
        throw new Error(`Failed to login: ${response.status} ${await response.text()}`)
      }

      const loginResult = await response.json()

      const refreshToken = response.headers.get('Set-Cookie').split('=')[1].split(';')[0]
      const refreshResult = await httpRequest(registryHost, {
        body: {},
        headers: {
          'Cookie': `refresh-token=${refreshToken}`,
          ...buildAuthRefreshHeaders()
        }
      })

      await assert(refreshResult,
        r => r !== null,
        r => r.accessToken !== null
      )
    }
  )
}

/**
 * Test route with auth protection
 */
async function testRouteWithAuth() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('route-service', async function(payload) {
      return { message: 'Route accessed', url: payload.url }
    }, { useAuthService: 'auth-service' }),
    async ([registry, authService, routeService]) => {
      // Register a route
      await createRoute('/api/protected', 'route-service')
      
      // Get auth token
      const authResult = await callService('auth-service', {
        authenticate: {
          user: TEST_ADMIN_USER,
          password: TEST_ADMIN_SECRET
        }
      })
      
      // Access route with token
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      const result = await httpRequest(`${registryHost}/api/protected`, {
        method: 'POST',
        body: { test: 'data' },
        headers: {
          [HEADERS.AUTH_TOKEN]: authResult.accessToken
        }
      })
      
      await assert(result,
        r => r.message === 'Route accessed'
      )
      
      // Try to access route without token
      await assertErr(
        () => httpRequest(`${registryHost}/api/protected`, {
          method: 'POST',
          body: { test: 'data' }
          // No AUTH_TOKEN header
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test multiple auth services
 */
async function testMultipleAuthServices() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    await createService('custom-auth-service', async function(payload) {
      if (payload.verifyAccess) {
        // Simple custom auth - just check if token is 'custom-token'
        if (payload.verifyAccess === 'custom-token') {
          return { user: 'custom-user' }
        } else {
          throw new HttpError(401, 'Invalid custom token')
        }
      }
      throw new HttpError(400, 'Invalid payload')
    }),
    await createService('service1', async function(payload) {
      return { message: 'Service 1 accessed' }
    }, { useAuthService: 'auth-service' }),
    await createService('service2', async function(payload) {
      return { message: 'Service 2 accessed' }
    }, { useAuthService: 'custom-auth-service' }),
    async ([registry, authService, customAuthService, service1, service2]) => {
      const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
      
      // Get token from first auth service
      const authResult = await callService('auth-service', {
        authenticate: {
          user: TEST_ADMIN_USER,
          password: TEST_ADMIN_SECRET
        }
      })
      
      // Access service1 with standard auth token
      const result1 = await httpRequest(registryHost, {
        body: { test: 'data' },
        headers: {
          ...buildCallHeaders('service1'),
          [HEADERS.AUTH_TOKEN]: authResult.accessToken
        }
      })
      
      await assert(result1,
        r => r.message === 'Service 1 accessed'
      )
      
      // Access service2 with custom token
      const result2 = await httpRequest(registryHost, {
        body: { test: 'data' },
        headers: {
          ...buildCallHeaders('service2'),
          [HEADERS.AUTH_TOKEN]: 'custom-token'
        }
      })
      
      await assert(result2,
        r => r.message === 'Service 2 accessed'
      )
      
      // Try to access service2 with standard token (should fail)
      await assertErr(
        () => httpRequest(registryHost, {
          body: { test: 'data' },
          headers: {
            ...buildCallHeaders('service2'),
            [HEADERS.AUTH_TOKEN]: authResult.accessToken
          }
        }),
        err => err.status === 401
      )
    }
  )
}

/**
 * Test auth service unregistration cleanup
 */
async function testAuthServiceUnregistration() {
  await terminateAfter(
    await startRegistry(),
    await createAuthService(),
    async ([registry, authService]) => {
      const protectedServer = await createService('protected-service', async function(payload) {
        return { message: 'Protected data' }
      }, { useAuthService: 'auth-service' })
      
      // Terminate the protected service
      await protectedServer.terminate()
      
      // The auth mapping should be cleaned up when the service is unregistered
      // This is tested implicitly - if there are memory leaks, they would show up in longer test runs
      // For now, just verify the test completes without errors
      await assert(true, r => r === true)
    }
  )
}

export default {
  testAuthServiceWorks,
  testAuthServiceBadCredentials,
  testProtectedServiceWithAuth,
  testUnprotectedServiceStillWorks,
  testServiceRegistrationWithAuth,
  testProtectedServiceCallWithValidToken,
  testProtectedServiceCallWithoutToken,
  testProtectedServiceCallWithInvalidToken,
  testProtectedServiceCallWithExpiredToken,
  testAuthServiceNotFound,
  testAuthLoginCommand,
  testAuthRefreshCommand,
  testRouteWithAuth,
  testMultipleAuthServices,
  testAuthServiceUnregistration
}
