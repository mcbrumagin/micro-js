/**
 * Command Router
 * Routes incoming registry commands to appropriate handlers
 */

import { publish, subscribe, unsubscribe } from './pubsub-manager.js'
import { 
  allocateServicePort, 
  registerService, 
  unregisterService, 
  findServiceLocation, 
  proxyServiceCall 
} from './service-registry.js'
import { registerRoute } from './route-registry.js'
import { resolvePossibleRoute } from './http-route-handler.js'

import Logger from '../../utils/logger.js'

const logger = new Logger()

/**
 * Get registry API documentation
 * Parses the main handler function to show available commands
 */
function getRegistryApiDocumentation(handlerFn) {
  let message = handlerFn.toString()
  try {
    message = handlerFn.toString()
      .match(/payload\.(.+?)\) /ig)
      ?.join('\n')
      .replace(/payload\./ig, '')
      .replace(/\) /ig, '') || message
  } catch (err) {
    // Return full function string if parsing fails
  }
  return message
}

/**
 * Health check command
 */
function handleHealthCheck() {
  return { status: 'ready', timestamp: Date.now() }
}

/**
 * Setup command - allocate port for new service
 */
function handleSetup(state, payload, defaultStartPort) {
  return allocateServicePort(state, payload.setup, defaultStartPort)
}

/**
 * Register command - register service or route
 */
async function handleRegister(state, payload) {
  const { type = 'service' } = payload.register
  
  if (type === 'service') {
    return registerService(state, payload.register)
  } else if (type === 'route') {
    return registerRoute(state, payload.register)
  } else {
    const HttpError = (await import('../../http-primitives/http-error.js')).default
    throw new HttpError(400, 'Invalid registration type')
  }
}

/**
 * Route incoming commands to their handlers
 */
export async function routeCommand(state, payload, request, response, options = {}) {
  // TODO envConfig
  const { defaultStartPort = 10000, handlerFn } = options

  // Command dispatch
  if (payload.health) {
    return handleHealthCheck()
  }
  
  if (payload.publish) {
    return publish(state, payload.publish)
  }
  
  if (payload.subscribe) {
    return subscribe(state, payload.subscribe)
  }
  
  if (payload.unsubscribe) {
    return unsubscribe(state, payload.unsubscribe)
  }
  
  if (payload.setup) {
    return handleSetup(state, payload, defaultStartPort)
  }
  
  if (payload.register) {
    return handleRegister(state, payload)
  }
  
  if (payload.unregister) {
    return unregisterService(state, payload.unregister)
  }
  
  if (payload.lookup) {
    return findServiceLocation(state, payload.lookup)
  }
  
  if (payload.call) {
    return proxyServiceCall(state, payload.call)
  }
  
  // HTTP route resolution
  if (request.url) {
    // ignore health to keep noise down
    if (request.url !== '/health') {
      logger.debug(`resolving url "${request.url}" w/ payload ${JSON.stringify(payload)}`)
    }
    return resolvePossibleRoute(state, request, response, payload)
  }
  
  // Default: return API documentation
  return getRegistryApiDocumentation(handlerFn || routeCommand)
}

