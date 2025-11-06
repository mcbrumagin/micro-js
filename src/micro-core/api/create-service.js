/**
 * Create Service
 * Main service creation and registration module
 * Refactored into modular components for better maintainability
 */

import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'

import { createServiceState, updateCache, removeFromCache } from '../service/service-state.js'
import { buildContext, buildEnhancedContext, bindServiceFunction } from '../service/service-context.js'
import { createCacheAwareHandler } from '../service/cache-handler.js'
import { validateServiceName, extractPort, validateServiceLocation } from '../service/service-validator.js'
import { createServiceBatch } from '../service/service-batch.js'
import { createPubSubManager } from '../service/pubsub-manager.js'
import { isSubscriptionMessage } from '../service/cache-handler.js'
import {
  createAndRegisterService,
  unregisterServiceFromRegistry
} from './service-helpers.js'

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

  const config = { ...DEFAULT_CONFIG, ...options }
  config.useAuthService = config.useAuthService?.name || config.useAuthService
  
  // TODO test sharedCache override... seems sketchy
  const cache = config.sharedCache || createServiceState()
  
  // Build context without location initially (no subscriptions in regular services)
  const context = buildEnhancedContext(cache, name, null)
  const boundServiceFn = bindServiceFunction(serviceFn, context)
  const handler = createCacheAwareHandler(boundServiceFn, cache, context)

  // override handler name
  Object.defineProperty(handler, 'name', { value: name, writable: false })

  // Setup service infrastructure using shared helpers
  let result
  try {
    result = await createAndRegisterService(name, handler, config)
  } catch (err) {
    if (err.message.includes('listen EADDRINUSE')) {
      // Retry on port collision
      return createService(name, serviceFn, options)
    } else {
      throw err
    }
  }

  const { location, server, registryData } = result
  
  updateCache(cache, registryData)

  logger.info(`Service "${name}" running at ${location}`)
  
  // Add metadata
  server.name = name
  server.service = name
  server.location = location
  server.cache = cache
  server.context = context

  let originalHandler = server.handler
  let pubSubManager = null
  let subscriptionIds = {}

  // TODO this should use addMiddleware instead, after multiple middleware support is added
  server.createSubscription = async function createSubscriptionForService(channelMap) {
    if (!pubSubManager) {
      pubSubManager = createPubSubManager(name, location)
    }

    for (let [channel, handler] of Object.entries(channelMap)) {
      subscriptionIds[channel] = await pubSubManager.subscribe(channel, handler)
    }

    server.handler = async function(payload, request, response) {
      logger.debug(`Handling request for channel: ${JSON.stringify(request.headers, null, 2)}`)
      if (isSubscriptionMessage(request)) {
        logger.debug(`Handling subscription message for channel: ${request.headers['micro-pubsub-channel']}`)
        return await pubSubManager.handleIncomingMessage(request.headers['micro-pubsub-channel'], payload)
      } else {
        return await originalHandler(payload, request, response)
      }
    }

    return subscriptionIds
  }

  server.resetHandler = () => server.handler = originalHandler
  server.addMiddleware = function (middlewareFn) {
    server.handler = async function(payload, request, response) {
      let middlewareResult = await middlewareFn(payload, request, response)
      if (middlewareResult instanceof Next || response.isEnded) {
        return middlewareResult
      } else {
        return await originalHandler(middlewareResult, request, response)
      }
    }
  }

  // override terminate to gracefully unregister
  const httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    removeFromCache(cache, { service: name, location })
    await unregisterServiceFromRegistry(name, location)
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
