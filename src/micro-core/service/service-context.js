/**
 * Service Context Builder
 * Builds execution context for service functions with access to other services
 */

import { callServiceWithCache } from '../call-service.js'

/**
 * Build base context for service function
 * Context includes:
 * - call: function to call other services
 * - (future) service name bindings for better autocomplete
 */
export function buildContext(cache) {
  return {
    // Bind cache to call function
    call: callServiceWithCache.bind(null, cache)
  }
}

/**
 * Build enhanced context with service method stubs
 * Creates named functions for each known service for better IDE autocomplete
 * 
 * @param {Object} cache - Service cache with services map
 * @returns {Object} Context with call() and individual service stubs
 * 
 * @example
 * // With cache.services = { userService: [...], authService: [...] }
 * // Returns context with:
 * // - call(serviceName, payload)
 * // - userService(payload) - stub that calls userService
 * // - authService(payload) - stub that calls authService
 */
export function buildEnhancedContext(cache) {
  const context = buildContext(cache) // include call function
  
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
  
  // Remove old service stubs that no longer exist
  const currentServices = new Set(Object.keys(cache.services || {}))
  for (const key of Object.keys(context)) {
    if (key !== 'call' && !currentServices.has(key)) {
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

