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

import Logger from '../../utils/logger.js'

const logger = new Logger()

/**
 * Get registry API documentation
 * Returns information about available commands and required headers
 */
async function getRegistryApiDocumentation() {
  // TODO lookup version, links, etc from package.json
  // update package.json to include useful metadata
  // TODO check if micro is installed as a module, global command,
  //   or running directly in the dev environment

  try {
    if (!process.env.ENVIRONMENT?.toLowerCase().includes('dev')) {
      if (process.env.ENVIRONMENT?.toLowerCase().includes('prod')) {
        // TODO should this error be even less revealing?
        return new HttpError(404, 'Documentation disabled in production environment')
      } else return {
        // if not prod or dev, return a generic documentation link
        documentation: 'https://github.com/mcbrumagin/micro-js'
      }
    } else {
      // TODO make sure this works when it is installed as a module
      // for dev, return detailed documentation
      const packageJson = await import(process.cwd() + '/package.json', { with: { type: 'json' } })
      return {
        name: packageJson.default.name,
        version: packageJson.default.version,
        description: packageJson.default.description,
        documentation: packageJson.default.homepage,
        
        // TODO generate examples dynamically using header helper functions
        commands: {
          health: {
            header: 'micro-command: health',
            description: 'Check registry health status',
            requiredHeaders: ['micro-command'],
            example: {
              headers: { 'micro-command': 'health' }
            }
          },
          
          'service-setup': {
            header: 'micro-command: service-setup',
            description: 'Allocate a port for a new service',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-home'],
            example: {
              headers: {
                'micro-command': 'service-setup',
                'micro-service-name': 'myService',
                'micro-service-home': 'http://localhost'
              }
            }
          },
          
          'service-register': {
            header: 'micro-command: service-register',
            description: 'Register a service instance',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-location'],
            example: {
              headers: {
                'micro-command': 'service-register',
                'micro-service-name': 'myService',
                'micro-service-location': 'http://localhost:10001'
              }
            }
          },
          
          'service-unregister': {
            header: 'micro-command: service-unregister',
            description: 'Unregister a service instance',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-location']
          },
          
          'service-lookup': {
            header: 'micro-command: service-lookup',
            description: 'Find the location of a service',
            requiredHeaders: ['micro-command', 'micro-service-name']
          },
          
          'service-call': {
            header: 'micro-command: service-call',
            description: 'Call a registered service',
            requiredHeaders: ['micro-command', 'micro-service-name'],
            note: 'Request body is forwarded to the service'
          },
          
          'route-register': {
            header: 'micro-command: route-register',
            description: 'Register an HTTP route',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-route-path'],
            optionalHeaders: ['micro-route-datatype', 'micro-route-type']
          },
          
          'pubsub-publish': {
            header: 'micro-command: pubsub-publish',
            description: 'Publish a message to a channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel'],
            note: 'Message body is sent to all subscribers'
          },
          
          'pubsub-subscribe': {
            header: 'micro-command: pubsub-subscribe',
            description: 'Subscribe to a pub/sub channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel', 'micro-service-location']
          },
          
          'pubsub-unsubscribe': {
            header: 'micro-command: pubsub-unsubscribe',
            description: 'Unsubscribe from a pub/sub channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel', 'micro-service-location']
          }
        },
        
        routes: {
          description: 'HTTP routes take priority over command headers',
          note: 'Access registered routes directly via their URL path (e.g., /api/users)'
        },
        
        usage: {
          curl: 'curl -H "micro-command: health" http://localhost:9000',
          fetch: 'fetch("http://localhost:9000", { headers: { "micro-command": "health" } })'
        }
      }
    }
  } catch (error) {
    // TODO remove try/catch after dev/installed/global edge-cases are covered
    if (!process.env.ENVIRONMENT?.toLowerCase().includes('prod')) {
      console.error('Error getting registry API documentation:', error)
      throw new HttpError(404, 'Documentation disabled in development environment')
    } else {
      console.error('Error getting registry API documentation:', error)
      throw new HttpError(500, 'Error getting registry API documentation')
    }
  }
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
      location: serviceLocation 
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
  return getRegistryApiDocumentation()
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
        // Use streaming proxy - pipes request directly without buffering (for file uploads)
        logger.debug(`Using streaming proxy for multipart content: ${serviceName}`)
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
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'PUBSUB_PUBLISH requires micro-pubsub-channel header')
      }
      return publish(state, { 
        type: pubsubChannel, 
        message: payload 
      })
    
    case COMMANDS.PUBSUB_SUBSCRIBE:
      if (!pubsubChannel) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'PUBSUB_SUBSCRIBE requires micro-pubsub-channel header')
      }
      if (!serviceLocation) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'PUBSUB_SUBSCRIBE requires micro-service-location header')
      }
      return subscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    case COMMANDS.PUBSUB_UNSUBSCRIBE:
      if (!pubsubChannel) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'PUBSUB_UNSUBSCRIBE requires micro-pubsub-channel header')
      }
      if (!serviceLocation) {
        const HttpError = (await import('../../http-primitives/http-error.js')).default
        throw new HttpError(400, 'PUBSUB_UNSUBSCRIBE requires micro-service-location header')
      }
      return unsubscribe(state, { 
        type: pubsubChannel, 
        location: serviceLocation 
      })
    
    default:
      const HttpError = (await import('../../http-primitives/http-error.js')).default
      throw new HttpError(400, `Unknown command: ${command}`)
  }
}
