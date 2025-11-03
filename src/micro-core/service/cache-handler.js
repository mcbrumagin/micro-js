/**
 * Cache Handler
 * Handles cache update messages from registry and delegates to service function
 */

import { updateCacheEntry } from './service-state.js'
import { updateContext } from './service-context.js'
import { Next } from '../../http-primitives/next.js'
import { COMMANDS, parseCommandHeaders } from '../../utils/micro-headers.js'

/**
 * Check if request is a cache update from registry
 * Uses micro headers to identify internal cache update calls
 * 
 * @param {Object} request - HTTP request object with headers
 * @returns {boolean} True if this is a cache update request
 */
export function isCacheUpdateRequest(request) {
  if (!request || !request.headers) {
    return false
  }
  
  const { command } = parseCommandHeaders(request.headers)
  return command === COMMANDS.CACHE_UPDATE
}

/**
 * Check if request is a subscription message from registry
 * Uses micro headers to identify pubsub subscription messages
 * 
 * @param {Object} request - HTTP request object with headers
 * @returns {boolean} True if this is a subscription message
 */
export function isSubscriptionMessage(request) {
  if (!request || !request.headers) {
    return false
  }
  
  const { command } = parseCommandHeaders(request.headers)
  return command === COMMANDS.PUBSUB_PUBLISH
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
    // Check if this is a cache update from registry using micro headers
    if (isCacheUpdateRequest(request)) {
      const { serviceName, serviceLocation } = parseCommandHeaders(request.headers)
      
      // Update local cache
      updateCacheEntry(cache, { service: serviceName, location: serviceLocation })
      
      // Update context to reflect new services
      updateContext(context, cache)
      
      // Return success response
      return {
        status: 'cache_updated',
        service: serviceName,
        location: serviceLocation
      }
    }
    
    // Check if this is a subscription message from registry
    if (isSubscriptionMessage(request)) {
      const { pubsubChannel } = parseCommandHeaders(request.headers)
      
      if (context._subscriptionManager) {
        // Check if subscription manager has handlers for this channel
        const subscriptions = context._subscriptionManager.listSubscriptions()
        if (subscriptions[pubsubChannel]) {
          // Route to subscription manager handlers
          return await context._subscriptionManager.handleSubscriptionMessage(pubsubChannel, payload)
        }
      }
      
      // No subscription manager or no handlers for this channel
      // Pass through to normal service handler (for direct registry subscriptions)
      // The service handler is called directly and should return its result
      return await serviceFn(payload, request, response)
    }
    
    // Not a cache update or subscription - delegate to actual service function with request/response
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
    // Check if this is a cache update from registry using micro headers
    if (isCacheUpdateRequest(request)) {
      // TODO: Validate request headers contain matching token
      // const authHeader = request?.headers?.['x-registry-token']
      // if (registryToken && authHeader !== registryToken) {
      //   throw new Error('Unauthorized cache update attempt')
      // }
      
      const { serviceName, serviceLocation } = parseCommandHeaders(request.headers)
      updateCacheEntry(cache, { service: serviceName, location: serviceLocation })
      updateContext(context, cache)
      
      return {
        status: 'cache_updated',
        service: serviceName,
        location: serviceLocation
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

