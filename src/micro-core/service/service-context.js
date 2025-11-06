/**
 * Service Context Builder
 * Builds execution context for service functions with access to other services
 */

import { callServiceWithCache } from '../api/call-service.js'
import publishMessage from '../api/publish-message.js'

/**
 * Build base context for service function
 * Context includes:
 * - call: function to call other services
 * - publish: publish messages to global event channels (for side effects)
 * 
 * Note: subscribe/unsubscribe removed - use createSubscriptionService instead
 * 
 * @param {Object} cache - Service cache
 * @param {string} serviceName - Name of the service
 * @returns {Object} Context object
 */
export function buildContext(cache, serviceName = 'anonymous') {
  return {
    // Service-to-service RPC
    call: callServiceWithCache.bind(null, cache),
    
    // Publish to event channels (for triggering side effects)
    publish: publishMessage
  }
}

/**
 * Build enhanced context with service method stubs
 * Creates named functions for each known service for better IDE autocomplete
 * 
 * @param {Object} cache - Service cache with services map
 * @param {string} serviceName - Name of the service
 * @returns {Object} Context with call(), publish(), and individual service stubs
 * 
 * @example
 * // With cache.services = { userService: [...], authService: [...] }
 * // Returns context with:
 * // - call(serviceName, payload)
 * // - publish(channel, message)
 * // - userService(payload) - stub that calls userService
 * // - authService(payload) - stub that calls authService
 */
export function buildEnhancedContext(cache, serviceName = 'anonymous') {
  const context = buildContext(cache, serviceName) // include call, publish
  
  // add service-specific stubs for better autocomplete
  if (cache.services) {
    for (const serviceName of Object.keys(cache.services)) {
      // create a stub function for this service
      // allows: context.userService(payload) instead of context.call('userService', payload)
      context[serviceName] = function serviceStub(payload) {
        return callServiceWithCache(cache, serviceName, payload)
      }
      
      // override function name
      Object.defineProperty(context[serviceName], 'name', {
        value: serviceName,
        writable: false
      })
    }
  }
  
  return context
}

/**
 * Update context when cache changes
 * Useful for hot-reloading service references
 * 
 * @param {Object} context - Existing context object
 * @param {Object} cache - Updated cache
 */
export function updateContext(context, cache) {
  // Update the call function binding
  context.call = callServiceWithCache.bind(null, cache)
  
  // Keep track of protected keys (built-in methods)
  const protectedKeys = new Set(['call', 'publish'])
  
  // Remove old service stubs that no longer exist
  const currentServices = new Set(Object.keys(cache.services || {}))
  for (const key of Object.keys(context)) {
    if (!protectedKeys.has(key) && !currentServices.has(key)) {
      delete context[key]
    }
  }
  
  // add/update service stubs
  if (cache.services) {
    for (const serviceName of Object.keys(cache.services)) {
      context[serviceName] = function serviceStub(payload) {
        return callServiceWithCache(cache, serviceName, payload)
      }
      
      Object.defineProperty(context[serviceName], 'name', {
        value: serviceName,
        writable: false
      })
    }
  }
}

/**
 * Bind service function to context
 * Returns a new function with context bound as `this`
 */
export function bindServiceFunction(serviceFn, context) {
  return serviceFn.bind(context)
}

/**
 * Create a local service stub for testing or local-only services
 * These bypass the HTTP layer entirely
 */
export function createLocalContext(serviceMap = {}) {
  return {
    call: async function localCall(serviceName, payload) {
      const service = serviceMap[serviceName]
      if (!service) {
        throw new Error(`Local service "${serviceName}" not found`)
      }
      return await service(payload)
    },
    ...serviceMap
  }
}

