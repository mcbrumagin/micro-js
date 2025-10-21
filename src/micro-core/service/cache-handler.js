/**
 * Cache Handler
 * Handles cache update messages from registry and delegates to service function
 */

import { updateCacheEntry } from './service-state.js'
import { updateContext } from './service-context.js'
import { Next } from '../../http-primitives/next.js'

/**
 * Check if payload is a cache update from registry
 * Registry sends { service, location } to broadcast new service registrations
 * 
 * TODO: Add authentication token or header validation for production security
 * For now, we assume this simple structure indicates a registry update
 */
export function isCacheUpdatePayload(payload) {
  return (
    payload &&
    typeof payload === 'object' &&
    typeof payload.service === 'string' &&
    typeof payload.location === 'string' &&
    // Only these two fields should be present for cache updates
    Object.keys(payload).length === 2
  )
}

/**
 * Create a handler function that intercepts cache updates
 * Returns a new handler that:
 * 1. Checks if payload is a cache update
 * 2. If yes, updates cache and returns success
 * 3. If no, delegates to actual service function
 * 
 * The handler forwards request and response objects to the service function,
 * allowing services to directly control HTTP responses (streaming, custom headers, etc.)
 * 
 * @param {Function} serviceFn - The actual service handler function
 * @param {Object} cache - Service cache object
 * @param {Object} context - Service execution context
 * @returns {Function} Wrapped handler
 */
export function createCacheAwareHandler(serviceFn, cache, context) {
  return async function cacheAwareHandler(payload, request, response) {
    // Check if this is a cache update from registry
    // TODO check for micro headers to indicate cache update
    if (isCacheUpdatePayload(payload)) {
      const { service, location } = payload
      
      // Update local cache
      updateCacheEntry(cache, { service, location })
      
      // Update context to reflect new services
      updateContext(context, cache)
      
      // Return success response
      return {
        status: 'cache_updated',
        service,
        location
      }
    }
    
    // Not a cache update - delegate to actual service function with request/response
    const result = await serviceFn(payload, request, response)
    
    // If service returned Next instance, convert to false for http-server
    // This signals that the service has handled the response directly
    if (result instanceof Next) {
      return false
    }
    
    return result
  }
}

/**
 * Create handler with authentication token validation
 * For future use when HTTPS and tokens are implemented
 * 
 * @param {Function} serviceFn - The actual service handler
 * @param {Object} cache - Service cache
 * @param {Object} context - Service context
 * @param {string} registryToken - Token from registry for validation
 * @returns {Function} Wrapped handler with auth
 */
export function createSecureCacheAwareHandler(serviceFn, cache, context, registryToken) {
  return async function secureCacheAwareHandler(payload, request, response) {
    // Validate token if provided
    // TODO check for micro headers to indicate cache update
    if (isCacheUpdatePayload(payload)) {
      // TODO: Validate request headers contain matching token
      // const authHeader = request?.headers?.['x-registry-token']
      // if (registryToken && authHeader !== registryToken) {
      //   throw new Error('Unauthorized cache update attempt')
      // }
      
      const { service, location } = payload
      updateCacheEntry(cache, { service, location })
      updateContext(context, cache)
      
      return {
        status: 'cache_updated',
        service,
        location
      }
    }
    
    // Forward request and response to service function
    const result = await serviceFn(payload, request, response)
    
    // Convert Next instance to false for http-server
    if (result instanceof Next) {
      return false
    }
    
    return result
  }
}

