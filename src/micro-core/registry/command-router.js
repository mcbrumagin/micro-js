/**
 * Command Router
 * Routes incoming registry commands to appropriate handlers
 * 
 * Supports both header-based and legacy payload-based routing
 */

import { publish, subscribe, unsubscribe } from './pubsub-manager.js'
import { 
  allocateServicePort, 
  registerService, 
  unregisterService, 
  findServiceLocation, 
  proxyServiceCall 
} from './service-registry.js'
import { registerRoute, findControllerRoute } from './route-registry.js'
import { resolvePossibleRoute } from './http-route-handler.js'
import { COMMANDS, parseCommandHeaders, isHeaderBasedCommand } from '../../utils/micro-headers.js'

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
 * Supports both header-based and legacy payload-based
 */
async function handleRegister(state, payload, headers = {}) {
  const { command, serviceName, serviceLocation, routePath, routeDataType, routeType } = parseCommandHeaders(headers)
  
  // Header-based registration
  if (command === COMMANDS.SERVICE_REGISTER) {
    return registerService(state, { 
      service: serviceName, 
      location: serviceLocation 
    })
  } else if (command === COMMANDS.ROUTE_REGISTER) {
    return registerRoute(state, { 
      service: serviceName, 
      path: routePath, 
      dataType: routeDataType,
      type: routeType
    })
  }
  
  // Legacy payload-based registration
  const { type = 'service' } = payload.register || {}
  
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
 * PRIORITY 1: HTTP routes (URL-based)
 * PRIORITY 2: Command headers (micro-command)
 */
export async function routeCommand(state, payload, request, response, options = {}) {
  const { defaultStartPort = 10000, handlerFn } = options
  const headers = request.headers || {}
  
  // PRIORITY 1: Check for HTTP routes first (most specific - based on URL path)
  // Routes should work without any special headers
  if (request.url && request.url !== '/' && request.url !== '/health') {
    const routeMatch = state.routes.get(request.url)
    const controllerMatch = !routeMatch && findControllerRoute(state, request.url)
    
    if (routeMatch || controllerMatch) {
      logger.debug(`route matched for ${request.url}`)
      return resolvePossibleRoute(state, request, response, payload)
    }
  }
  
  // PRIORITY 2: Command-based routing (for service operations, pubsub, etc.)
  if (isHeaderBasedCommand(headers)) {
    return routeCommandByHeaders(state, payload, request, response, options)
  }
  
  // No route or command matched - return API documentation
  return getRegistryApiDocumentation(handlerFn || routeCommand)
}

/**
 * Header-based command routing (NEW)
 */
async function routeCommandByHeaders(state, payload, request, response, options) {
  const { defaultStartPort = 10000 } = options
  const headers = request.headers || {}
  const { command, serviceName, serviceLocation, serviceHome, pubsubChannel } = parseCommandHeaders(headers)
  
  logger.debug(`header-based command: ${command}`)
  
  switch (command) {
    case COMMANDS.HEALTH:
      return handleHealthCheck()
    
    case COMMANDS.SERVICE_SETUP:
      return allocateServicePort(state, { 
        service: serviceName, 
        home: serviceHome 
      }, defaultStartPort)
    
    case COMMANDS.SERVICE_REGISTER:
    case COMMANDS.ROUTE_REGISTER:
      return handleRegister(state, payload, headers)
    
    case COMMANDS.SERVICE_UNREGISTER:
      return unregisterService(state, { 
        service: serviceName, 
        location: serviceLocation 
      })
    
    case COMMANDS.SERVICE_LOOKUP:
      return findServiceLocation(state, serviceName)
    
    case COMMANDS.SERVICE_CALL:
      // Pass request/response to enable streaming
      return proxyServiceCall(state, { 
        name: serviceName, 
        payload, 
        request, 
        response 
      })
    
    case COMMANDS.PUBSUB_PUBLISH:
      return publish(state, { 
        type: pubsubChannel, 
        message: payload 
      })
    
    case COMMANDS.PUBSUB_SUBSCRIBE:
      return subscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    case COMMANDS.PUBSUB_UNSUBSCRIBE:
      return unsubscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    default:
      // TODO remove? should be unneeded/redundant?
      // If no recognized command, check for HTTP route
      if (request.url) {
        return resolvePossibleRoute(state, request, response, payload)
      }
      
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, `Unknown command: ${command}`)
  }
}
