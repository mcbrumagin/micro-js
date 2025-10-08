/**
 * Service State Management
 * Manages local cache of service registry state
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
  console.log('updateCache', cache, registryData)
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
  console.log('updateCacheEntry', cache, { service, location })
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
  cache.services = {}
  cache.addresses = {}
}

