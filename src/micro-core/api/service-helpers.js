/**
 * Service Helpers
 * Shared utilities for service and subscription service creation
 * Handles common registry operations and HTTP server lifecycle
 */

import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import envConfig from '../shared/env-config.js'
import retry from '../shared/retry-helper.js'
import { buildSetupHeaders, buildRegisterHeaders, buildUnregisterHeaders } from '../shared/micro-headers.js'
import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-service-helpers' })

/**
 * Default configuration for service operations
 */
const DEFAULT_RETRY_CONFIG = {
  tryRegisterLimit: envConfig.get('MICRO_RETRY_LIMIT', 3),
  retryInitialDelay: envConfig.get('MICRO_RETRY_DELAY', 20),
  muteRetryWarnings: envConfig.get('MICRO_MUTE_RETRY_WARNINGS', false)
}

/**
 * Get registry configuration
 * @returns {Object} { registryHost, registryToken, serviceHome }
 */
export function getRegistryConfig() {
  const serviceHost = envConfig.get('MICRO_SERVICE_URL')
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')

  let serviceHome
  if (serviceHost) {
    logger.info(`setting service home for serivceHost ${serviceHost}`)
    serviceHome = serviceHost.replace(/:\d+$/, '')
  } else {
    logger.info(`setting service home for registryHost ${registryHost}`)
    serviceHome = registryHost.replace(/:\d+$/, '')
  }
  
  return { serviceHost, registryHost, registryToken, serviceHome }
}

/**
 * Extract port from location string
 * @param {string} location - Location string (e.g. 'http://localhost:3001')
 * @returns {string} Port number
 */
export function extractPortFromLocation(location) {
  return location.split(':')[2]
}

/**
 * Validate service location format
 * @param {string} location - Service location to validate
 * @param {string} port - Expected port number
 * @throws {Error} If location is invalid
 */
export function validateServiceLocation(location, port) {
  if (!location || !location.startsWith('http')) {
    throw new Error(`Invalid service location: ${location}`)
  }
  if (!port || isNaN(parseInt(port))) {
    throw new Error(`Invalid port in location: ${location}`)
  }
}

/**
 * Validate service name
 * @param {string} name - Service name to validate
 * @throws {Error} If name is invalid
 */
export function validateServiceName(name) {
  if (!name || typeof name !== 'string') {
    throw new Error('Service name must be a non-empty string')
  }
  if (name.includes(' ')) {
    throw new Error('Service name cannot contain spaces')
  }
}

/**
 * Setup service with registry - allocate port
 * @param {string} serviceName - Name of the service
 * @param {string} serviceHome - Service home URL
 * @param {Object} options - Configuration options
 * @returns {Promise<string>} Allocated location (e.g. 'http://localhost:3001')
 */
export async function setupServiceWithRegistry(serviceName, serviceHome, options = {}) {
  const { registryHost, registryToken } = getRegistryConfig()
  const config = { ...DEFAULT_RETRY_CONFIG, ...options }
  
  logger.debug(`setupServiceWithRegistry - ${serviceName}`)
  
  return await retry(
    async () => {
      const location = await httpRequest(registryHost, {
        headers: buildSetupHeaders(serviceName, serviceHome, registryToken)
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
 * @param {string} serviceName - Name of the service
 * @param {string} location - Service location (e.g. 'http://localhost:3001')
 * @param {Object} options - Registration options
 * @returns {Promise<Object>} Registry data (services, addresses)
 */
export async function registerServiceWithRegistry(serviceName, location, options = {}) {
  const { registryHost, registryToken } = getRegistryConfig()
  const { useAuthService } = options
  
  logger.debug(`registerServiceWithRegistry - ${serviceName} at ${location}`)
  
  return await httpRequest(registryHost, {
    headers: buildRegisterHeaders(serviceName, location, useAuthService, registryToken)
  })
}

/**
 * Unregister service from registry
 * @param {string} serviceName - Name of the service
 * @param {string} location - Service location
 * @returns {Promise<void>}
 */
export async function unregisterServiceFromRegistry(serviceName, location) {
  const { registryHost, registryToken } = getRegistryConfig()
  
  logger.debug(`unregisterServiceFromRegistry - ${serviceName} from ${location}`)
  
  return await httpRequest(registryHost, {
    headers: buildUnregisterHeaders(serviceName, location, registryToken)
  })
}

/**
 * Create HTTP server for service
 * @param {number|string} port - Port number
 * @param {Function} handler - Request handler function
 * @param {Object} options - Server options
 * @returns {Promise<Object>} HTTP server instance
 */
export async function createServiceHttpServer(port, handler, options = {}) {
  logger.debug(`createServiceHttpServer - port: ${port}`)
  return await httpServer(port, handler, options)
}

/**
 * Complete service lifecycle: setup, create server, register
 * This orchestrates the common pattern for both regular and subscription services
 * 
 * @param {string} serviceName - Name of the service
 * @param {Function} handler - Request handler function
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Service instance with { name, location, port, server, registryData }
 */
export async function createAndRegisterService(serviceName, handler, options = {}) {
  validateServiceName(serviceName)
  
  const { serviceHome } = getRegistryConfig()
  
  // 1. Setup with registry (allocate port)
  const location = await setupServiceWithRegistry(serviceName, serviceHome, options)
  const port = extractPortFromLocation(location)
  validateServiceLocation(location, port)
  
  // 2. Create HTTP server
  let server
  try {
    server = await createServiceHttpServer(port, handler, {
      streamPayload: options.streamPayload || false
    })
  } catch (err) {
    // Handle port collision - retry with new port
    if (err.message.includes('listen EADDRINUSE')) {
      logger.debug(`Port ${port} in use, retrying...`)
      throw err // Let caller handle retry
    }
    throw err
  }
  
  // 3. Register with registry
  const registryData = await registerServiceWithRegistry(serviceName, location, options)
  
  logger.debug(`createAndRegisterService - ${serviceName} successfully created at ${location}`)
  
  return {
    name: serviceName,
    location,
    port,
    server,
    registryData
  }
}

