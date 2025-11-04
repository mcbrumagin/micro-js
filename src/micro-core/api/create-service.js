/**
 * Create Service
 * Main service creation and registration module
 * Refactored into modular components for better maintainability
 */

import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'
import retry from '../shared/retry-helper.js'
import { buildSetupHeaders, buildRegisterHeaders, buildUnregisterHeaders } from '../shared/micro-headers.js'

import { createServiceState, updateCache, removeFromCache } from '../service/service-state.js'
import { buildContext, buildEnhancedContext, bindServiceFunction } from '../service/service-context.js'
import { createCacheAwareHandler } from '../service/cache-handler.js'
import {
  getRegistryHost,
  determineServiceHome,
  extractPort,
  validateServiceLocation,
  validateServiceName
} from '../service/service-validator.js'
import { createServiceBatch } from '../service/service-batch.js'

import crypto from 'crypto'

const logger = new Logger({ logGroup: 'micro-api' })

/**
 * Configuration for service setup
 */
const DEFAULT_CONFIG = {
  tryRegisterLimit: envConfig.get('MICRO_RETRY_LIMIT', 3),
  retryInitialDelay: envConfig.get('MICRO_RETRY_DELAY', 20),
  muteRetryWarnings: envConfig.get('MICRO_MUTE_RETRY_WARNINGS', false),
  sharedCache: null, // Optional pre-created cache for batch operations
  streamPayload: false // If true, don't buffer request body - pass raw stream to handler
}

/**
 * Setup service with registry (allocate port)
 * @private
 */
async function setupServiceWithRegistry(name, serviceHome, registryHost, config) {
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  return await retry(
    async () => {
      const location = await httpRequest(registryHost, {
        headers: buildSetupHeaders(name, serviceHome, registryToken)
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
async function registerServiceWithRegistry(name, location, registryHost, useAuthService) {
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  return await httpRequest(registryHost, {
    headers: buildRegisterHeaders(name, location, useAuthService, registryToken)
  })
}

/**
 * Unregister service from registry
 * @private
 */
async function unregisterServiceFromRegistry(name, location, registryHost) {
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  return await httpRequest(registryHost, {
    headers: buildUnregisterHeaders(name, location, registryToken)
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
    !(typeof name === 'function')
  ) {
    throw new Error(
      'Please provide a function, or a service name and its function separately'
    )
  }

  if (typeof name === 'function') {
    options = options && Object.keys(options).length === 0 ? serviceFn : options
    serviceFn = name
    name = serviceFn.name || `Anon$${crypto.randomBytes(4).toString('hex')}`
    if (name.includes('Anon$')) logger.debug('createService - generated name:', name)
  }

  validateServiceName(name)

  const registryHost = getRegistryHost()
  const serviceHome = determineServiceHome(registryHost)

  const config = { ...DEFAULT_CONFIG, ...options }
  config.useAuthService = config.useAuthService?.name || config.useAuthService
  
  // get allocated runtime port, if not hardcoded
  const location = await setupServiceWithRegistry(name, serviceHome, registryHost, config)
  const port = extractPort(location)
  validateServiceLocation(location, port)

  // TODO test sharedCache override... seems sketchy
  const cache = config.sharedCache || createServiceState()
  
  // Build context with location for subscription support
  const context = buildEnhancedContext(cache, name, location)
  const boundServiceFn = bindServiceFunction(serviceFn, context)
  const handler = createCacheAwareHandler(boundServiceFn, cache, context)

  // override handler name
  Object.defineProperty(handler, 'name', { value: name, writable: false })

  let server
  try {
    server = await httpServer(port, handler, { streamPayload: config.streamPayload })
    server.name = name
  } catch (err) {
    if (err.message.includes('listen EADDRINUSE')) {
      return createService(name, serviceFn, options)
    } else {
      throw err
    }
  }

  const registryData = await registerServiceWithRegistry(name, location, registryHost, config.useAuthService)
  updateCache(cache, registryData)

  logger.info(`Service "${name}" running at ${location}`)
  logger.debug('createService - registryHost:', registryHost)
  server.service = name
  server.location = location
  
  // for binding service stubs to context
  server.cache = cache
  server.context = context

  // override terminate to gracefully unregister and cleanup subscriptions
  const httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    // Cleanup subscriptions first
    if (context._pubSubManager) {
      await context._pubSubManager.cleanup()
    }
    
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
    serviceFns.push(options) // just another service
    options = {}
  }

  return createServiceBatch(serviceFns, createService, options)
}
