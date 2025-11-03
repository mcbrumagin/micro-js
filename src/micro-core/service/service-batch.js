/**
 * Service Batch Creation
 * Optimized creation of multiple services with shared cache
 */

import httpRequest from '../http-primitives/http-request.js'
import { createServiceState, updateCache } from './service-state.js'
import { getRegistryHost } from './service-validator.js'

/**
 * Pre-fetch registry state for batch service creation
 * This reduces N registry calls to 1 for initial cache population
 */
async function prefetchRegistryState(registryHost) {
  try {
    // We can use the lookup command without parameters to get full state
    // Or make a health check and parse the response
    // For now, we'll let individual services populate their own cache
    // This is a placeholder for future optimization
    return null
  } catch (err) {
    // If prefetch fails, services will fetch individually
    return null
  }
}

/**
 * Create shared cache for multiple services
 * All services in the batch will share this cache for better performance
 */
export function createSharedCache() {
  return createServiceState()
}

/**
 * Validate all service functions before creation
 * Ensures all are named functions
 */
export function validateServiceBatch(fns) {
  const names = new Set()
  
  for (const fn of fns) {
    if (typeof fn !== 'function') {
      throw new Error('All arguments to createServices must be functions')
    }
    
    if (!fn.name) {
      throw new Error(
        'All service functions must be named. ' +
        'Use: async function serviceName() { ... }'
      )
    }
    
    if (names.has(fn.name)) {
      throw new Error(`Duplicate service name: ${fn.name}`)
    }
    
    names.add(fn.name)
  }
  
  return Array.from(names)
}

/**
 * Create multiple services with optimization
 * - Validates all services upfront
 * - Pre-fetches registry state once
 * - All services share the same cache
 * 
 * This is more efficient than creating services individually
 * when you know all services will run on the same host
 */
export async function createServiceBatch(fns, createServiceFn, options) {
  const serviceNames = validateServiceBatch(fns)
  const registryHost = getRegistryHost()
  const sharedCache = createSharedCache()

  // TODO pre-fetch registry state
  const registryState = await prefetchRegistryState(registryHost)
  if (registryState) {
    updateCache(sharedCache, registryState)
  }
  
  // create all services concurrently with shared cache
  // pass shared cache as an option to each service
  const servers = await Promise.all(
    fns.map(fn => createServiceFn(fn, { sharedCache }))
  )
  
  // force-update context after all services have registered
  // ensures all services have access to each other via this.<serviceName>()
  for (const server of servers) {
    if (server.context && server.cache) {
      const { updateContext } = await import('./service-context.js')
      updateContext(server.context, server.cache)
    }
  }
  
  return servers
}

