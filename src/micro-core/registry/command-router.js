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
  proxyServiceCall,
  streamProxyServiceCall
} from './service-registry.js'
import { registerRoute, findControllerRoute } from './route-registry.js'
import { resolvePossibleRoute } from './http-route-handler.js'
import { COMMANDS, parseCommandHeaders, isHeaderBasedCommand } from '../../utils/micro-headers.js'
import getRegistryApiDocumentation from './documentation.js'
import HttpError from '../../http-primitives/http-error.js'
import { validateRegistryToken } from './registry-auth.js'

import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-registry' })

/**
 * Commands that require registry token validation
 */
const PROTECTED_COMMANDS = new Set([
  COMMANDS.SERVICE_SETUP,
  COMMANDS.SERVICE_REGISTER,
  COMMANDS.SERVICE_UNREGISTER,
  COMMANDS.ROUTE_REGISTER,
  COMMANDS.PUBSUB_PUBLISH,
  COMMANDS.PUBSUB_SUBSCRIBE,
  COMMANDS.PUBSUB_UNSUBSCRIBE
])

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
  const { command, serviceName, serviceLocation, useAuthService, routePath, routeDataType, routeType } = parseCommandHeaders(headers)
  
  // Header-based registration
  if (command === COMMANDS.SERVICE_REGISTER) {
    if (!serviceName) {
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, 'SERVICE_REGISTER requires micro-service-name header')
    }
    if (!serviceLocation) {
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, 'SERVICE_REGISTER requires micro-service-location header')
    }
    return registerService(state, { 
      service: serviceName,
      location: serviceLocation,
      useAuthService: useAuthService
    })
  } else if (command === COMMANDS.ROUTE_REGISTER) {
    if (!serviceName) {
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, 'ROUTE_REGISTER requires micro-service-name header')
    }
    if (!routePath) {
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, 'ROUTE_REGISTER requires micro-route-path header')
    }
    return registerRoute(state, { 
      service: serviceName, 
      path: routePath, 
      dataType: routeDataType,
      type: routeType
    })
  }
}

/**
 * Route incoming commands to their handlers
 * PRIORITY 1: Command headers (micro-command)
 * PRIORITY 2: HTTP routes (URL-based)
 */
export async function routeCommand(state, payload, request, response, options = {}) {
  const { defaultStartPort = 10000, handlerFn } = options
  const headers = request.headers || {}
  
  // PRIORITY 1: Command-based routing (for service operations, pubsub, etc.)
  const isHeaderCommand = isHeaderBasedCommand(headers)
  if (isHeaderCommand) {
    return routeCommandByHeaders(state, payload, request, response, options)
  }
  
  // PRIORITY 2: Check for HTTP routes (most specific - based on URL path)
  // Routes should work without any special headers
  if (request.url) { //&& request.url !== '/health' /* TODO VERIFY */) {
    const routeMatch = state.routes.get(request.url)
    const controllerMatch = !routeMatch && findControllerRoute(state, request.url)
    
    if (routeMatch || controllerMatch) {
      return resolvePossibleRoute(state, request, response, payload)
    }
  }
  
  // No route or command matched - return API documentation
  return getRegistryApiDocumentation()
}

/**
 * Header-based command routing
 */
async function routeCommandByHeaders(state, payload, request, response, options) {
  const { defaultStartPort = 10000 } = options
  const headers = request.headers || {}
  const { command, serviceName, serviceLocation, serviceHome, pubsubChannel } = parseCommandHeaders(headers)
  
  logger.debug('command:', command)

  if (PROTECTED_COMMANDS.has(command)) {
    validateRegistryToken(request)
  }
  
  switch (command) {
    case COMMANDS.HEALTH:
      return handleHealthCheck()
    
    case COMMANDS.SERVICE_SETUP:
      if (!serviceName) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'SERVICE_SETUP requires micro-service-name header')
      }
      if (!serviceHome) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'SERVICE_SETUP requires micro-service-home header')
      }
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
      // Detect if we should use streaming proxy (for multipart uploads, large files, etc.)
      const contentType = request.headers['content-type'] || ''
      const useStreaming = contentType.includes('multipart/')
      
      if (useStreaming) {
        logger.debug('SERVICE_CALL - useStreaming:', true, 'service:', serviceName)
        return streamProxyServiceCall(state, { 
          name: serviceName, 
          request, 
          response 
        })
      } else {
        // Use buffered proxy - backward compatible for JSON/text payloads
        return proxyServiceCall(state, { 
          name: serviceName, 
          payload, 
          request, 
          response 
        })
      }
    
    case COMMANDS.PUBSUB_PUBLISH:
      if (!pubsubChannel) {
        throw new HttpError(400, 'PUBSUB_PUBLISH requires micro-pubsub-channel header')
      }
      return publish(state, { 
        type: pubsubChannel, 
        message: payload 
      })
    
    case COMMANDS.PUBSUB_SUBSCRIBE:
      if (!pubsubChannel) {
        throw new HttpError(400, 'PUBSUB_SUBSCRIBE requires micro-pubsub-channel header')
      }
      if (!serviceLocation) {
        throw new HttpError(400, 'PUBSUB_SUBSCRIBE requires micro-service-location header')
      }
      return subscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    case COMMANDS.PUBSUB_UNSUBSCRIBE:
      if (!pubsubChannel) {
        throw new HttpError(400, 'PUBSUB_UNSUBSCRIBE requires micro-pubsub-channel header')
      }
      if (!serviceLocation) {
        throw new HttpError(400, 'PUBSUB_UNSUBSCRIBE requires micro-service-location header')
      }
      return unsubscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    case COMMANDS.AUTH_LOGIN:
    case COMMANDS.AUTH_REFRESH:
      // Default to 'auth-service' if no specific auth service is configured
      const authServiceName = 'auth-service'
      if (!state.services.has(authServiceName)) {
        throw new HttpError(503, `Auth service "${authServiceName}" not found`)
      }
      
      // Proxy the auth request to the auth service
      return proxyServiceCall(state, { 
        name: authServiceName, 
        payload, 
        request, 
        response 
      })
    
    default:
      throw new HttpError(400, `Unknown command`)
  }
}
