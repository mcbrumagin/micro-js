/**
 * Registry Authentication
 * Validates registry tokens for internal service-to-registry communication
 */

import envConfig from '../env-config.js'
import HttpError from '../../http-primitives/http-error.js'
import { HEADERS } from '../../utils/micro-headers.js'
import Logger from '../../utils/logger.js'

const logger = new Logger()

/**
 * Validate registry token for internal operations
 * @param {Object} request - HTTP request object
 * @throws {HttpError} If token is invalid or missing when token is configured
 */
export function validateRegistryToken(request) {
  const expectedToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  if (!expectedToken) {
    return true
  }
  
  const providedToken = request.headers?.[HEADERS.REGISTRY_TOKEN]
  
  if (!providedToken) {
    logger.debug('validateRegistryToken - missing token from:', request.socket?.remoteAddress)
    throw new HttpError(403, 'Registry token required')
  }
  
  if (providedToken !== expectedToken) {
    logger.debug('validateRegistryToken - invalid token from:', request.socket?.remoteAddress)
    throw new HttpError(403, 'Invalid registry token')
  }
  
  return true
}

/**
 * Validate environment configuration for registry security
 * Prevents registry from starting in production/staging without proper security
 * @throws {Error} If environment is prod/staging without token configured
 */
export function validateRegistryEnvironment() {
  const environment = (envConfig.get('ENVIRONMENT', '') || '').toLowerCase()
  const hasToken = !!envConfig.get('MICRO_REGISTRY_TOKEN')
  
  if (environment.includes('prod') || environment.includes('stag')) {
    if (!hasToken) {
      const error = `FATAL: Cannot start registry in ${environment.toUpperCase()} environment without MICRO_REGISTRY_TOKEN configured. ` +
        'Set MICRO_REGISTRY_TOKEN to a secure random token before starting the registry.'
      logger.error(error)
      throw new Error(error)
    }
  }
  
  if (environment && !environment.includes('dev') && !hasToken) {
    logger.warn(
      `Registry starting in ${environment.toUpperCase()} without MICRO_REGISTRY_TOKEN - ` +
      'consider setting this for better security'
    )
  }
}

