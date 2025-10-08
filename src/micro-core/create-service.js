/**
 * Create Service
 * Main service creation and registration module
 * Refactored into modular components for better maintainability
 */

import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import Logger from '../utils/logger.js'
import envConfig from './env-config.js'
import retry from '../utils/retry-helper.js'

import { createServiceState, updateCache, removeFromCache } from './service/service-state.js'
import { buildContext, buildEnhancedContext, bindServiceFunction } from './service/service-context.js'
import { createCacheAwareHandler } from './service/cache-handler.js'
import {
  getRegistryHost,
  determineServiceHome,
  extractPort,
  validateServiceLocation,
  validateServiceName
} from './service/service-validator.js'
import { createServiceBatch } from './service/service-batch.js'

const logger = new Logger()

/**
 * Configuration for service setup
 */
const DEFAULT_CONFIG = {
  tryRegisterLimit: envConfig.get('MICRO_RETRY_LIMIT', 3),
  retryInitialDelay: envConfig.get('MICRO_RETRY_DELAY', 20),
  muteRetryWarnings: envConfig.get('MICRO_MUTE_RETRY_WARNINGS', false),
  sharedCache: null // Optional pre-created cache for batch operations
}

/**
 * Setup service with registry (allocate port)
 * @private
 */
async function setupServiceWithRegistry(name, serviceHome, registryHost, config) {
  return await retry(
    async () => {
      const location = await httpRequest(registryHost, {
        setup: {
          service: name,
          home: serviceHome // Renamed from 'domain' for clarity
        }
      })
      return location
    },
    {
      maxAttempts: config.tryRegisterLimit,
      initialDelay: config.retryInitialDelay,
      muteWarnings: config.muteRetryWarnings
    }
  )
}

/**
 * Register service with registry
 * @private
 */
async function registerServiceWithRegistry(name, location, registryHost) {
  return await httpRequest(registryHost, {
    register: {
      service: name,
      location
    }
  })
}

/**
 * Unregister service from registry
 * @private
 */
async function unregisterServiceFromRegistry(name, location, registryHost) {
  return await httpRequest(registryHost, {
    unregister: {
      service: name,
      location
    }
  })
}

/**
 * Create and start a microservice
 * 
 * @param {string|Function} name - Service name or named function
 * @param {Function} [serviceFn] - Service handler function
 * @param {Object} [options] - Service configuration options
 * @returns {Promise<Object>} HTTP server instance with service metadata
 * 
 * @example
 * // With separate name and function
 * const server = await createService('userService', async function(payload) {
 *   return { user: 'data' }
 * })
 * 
 * @example
 * // With named function
 * const server = await createService(async function userService(payload) {
 *   return { user: 'data' }
 * })
 */
export default async function createService(name, serviceFn, options = {}) {
  if (
    !(typeof name === 'string' && name && typeof serviceFn === 'function') &&
    !(typeof name === 'function' && typeof name.name === 'string' && name.name)
  ) {
    throw new Error(
      'Please provide a named function, or a service name and its function separately'
    )
  }

  // handle named function case (serviceFn, options)
  if (typeof name === 'function' && name.name) {
    // TODO test options overrides
    options = options && Object.keys(options).length === 0 ? serviceFn : options
    serviceFn = name
    name = serviceFn.name
  }

  validateServiceName(name)

  const registryHost = getRegistryHost()
  const serviceHome = determineServiceHome(registryHost)

  const config = { ...DEFAULT_CONFIG, ...options }
  // get allocated runtime port, if not hardcoded
  const location = await setupServiceWithRegistry(name, serviceHome, registryHost, config)
  const port = extractPort(location)
  validateServiceLocation(location, port)

  // TODO test sharedCache override... seems sketchy
  const cache = config.sharedCache || createServiceState()
  const context = buildEnhancedContext(cache)
  const boundServiceFn = bindServiceFunction(serviceFn, context)
  const handler = createCacheAwareHandler(boundServiceFn, cache, context)

  // override handler name
  Object.defineProperty(handler, 'name', { value: name, writable: false })

  let server
  try {
    server = await httpServer(port, handler)
  } catch (err) {
    if (err.message.includes('listen EADDRINUSE')) { // port already in use
      // TODO if hardcoded port, warn and exit
      // retry service creation (registry will assign different port)
      return createService(name, serviceFn, options) // TODO different retry limit?
    } else {
      throw err
    }
  }

  // gets initial cache from registration
  const registryData = await registerServiceWithRegistry(name, location, registryHost)
  updateCache(cache, registryData)

  logger.trace(`service "${name}" registered at ${registryHost}`)

  // add service metadata
  server.service = name
  server.location = location

  // override terminate to gracefully unregister
  const httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    removeFromCache(cache, { service: name, location })
    await unregisterServiceFromRegistry(name, location, registryHost)
    await httpServerTerminate()
  }

  return server
}

/**
 * Create multiple services concurrently
 * Optimized to share cache state among all services for better performance
 * 
 * Benefits:
 * - All services share the same cache, updated when any service registers
 * - Validates all services upfront before creating any
 * - More efficient than individual createService calls
 * 
 * @param {...Function} fns - Named service functions
 * @returns {Promise<Array<Object>>} Array of server instances
 * 
 * @example
 * const [server1, server2] = await createServices(
 *   async function userService(payload) { ... },
 *   async function authService(payload) { ... }
 * )
 */
export function createServices(...fns) {
  fns.unshift(fns.pop()) // rearrange for spread
  let [options, ...serviceFns] = fns
  if (typeof options === 'function') {
    serviceFns.push(options) // not an options object
    options = {}
  }

  // TODO bulk register and cache creation
  return createServiceBatch(serviceFns, createService, options)
}
