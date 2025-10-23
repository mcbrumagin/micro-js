import Logger from '../../utils/logger.js'

const logger = new Logger({logGroup: 'service-state'})

/**
 * Service State Management
 * Manages local service cache of registry state
 */

/**
 * Create a new service cache state
 * Similar to registry state but for service-side caching
 */
export function createServiceState() {
  return {
    // service name -> [locations]
    services: {},
    
    // location -> service name (reverse lookup)
    addresses: {}
  }
}

/**
 * Update cache with data from registry
 */
export function updateCache(cache, registryData) {
  // logger.debug(`updateCache: ${JSON.stringify({registryData})}`)
  if (registryData.addresses) {
    cache.addresses = registryData.addresses
  }
  if (registryData.services) {
    cache.services = registryData.services
  }
}

/**
 * Update cache with a single service/location pair
 * Used when registry broadcasts service additions
 */
export function updateCacheEntry(cache, { service, location }) {
  // logger.debug(`updateCacheEntry: ${JSON.stringify({service, location})}`)
  if (!cache.addresses) cache.addresses = {}
  if (!cache.services) cache.services = {}
  
  cache.addresses[location] = service
  
  if (!cache.services[service]) {
    cache.services[service] = []
  }
  
  // Only add if not already present
  if (!cache.services[service].includes(location)) {
    cache.services[service].push(location)
  }
}

/**
 * Remove service from cache
 */
export function removeFromCache(cache, { service, location }) {
  // logger.debug(`removeFromCache: ${JSON.stringify({service, location})}`)
  if (cache.addresses) {
    delete cache.addresses[location]
  }
  
  if (cache.services && cache.services[service]) {
    cache.services[service] = cache.services[service].filter(loc => loc !== location)
    
    // Remove service entry if no locations remain
    if (cache.services[service].length === 0) {
      delete cache.services[service]
    }
  }
}

/**
 * Clear all cache data
 */
export function clearCache(cache) {
  // logger.debug(`clearCache`)
  cache.services = {}
  cache.addresses = {}
}

