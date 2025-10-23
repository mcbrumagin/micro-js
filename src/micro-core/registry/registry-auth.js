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
  
  // If no token is configured, skip validation
  if (!expectedToken) {
    return true
  }
  
  const providedToken = request.headers?.[HEADERS.REGISTRY_TOKEN]
  
  // If token is configured, it must be provided
  if (!providedToken) {
    logger.warn('Registry token validation failed: missing token', {
      remoteAddress: request.socket?.remoteAddress
    })
    throw new HttpError(403, 'Registry token required')
  }
  
  // Token must match
  if (providedToken !== expectedToken) {
    logger.warn('Registry token validation failed: invalid token', {
      remoteAddress: request.socket?.remoteAddress
    })
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
  
  // Check for production or staging environments
  if (environment.includes('prod') || environment.includes('stag')) {
    if (!hasToken) {
      const error = `FATAL: Cannot start registry in ${environment.toUpperCase()} environment without MICRO_REGISTRY_TOKEN configured. ` +
        'Set MICRO_REGISTRY_TOKEN to a secure random token before starting the registry.'
      logger.error(error)
      throw new Error(error)
    }
  }
  
  // Warn for non-dev environments without token
  if (environment && !environment.includes('dev') && !hasToken) {
    logger.warn(
      `WARNING: Registry starting in ${environment.toUpperCase()} environment without MICRO_REGISTRY_TOKEN. ` +
      'This is not recommended for non-development environments. ' +
      'Consider setting MICRO_REGISTRY_TOKEN for better security.'
    )
  }
}

