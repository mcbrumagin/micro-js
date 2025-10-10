/**
 * Registry State Management
 * Manages all registry state including services, routes, and subscriptions
 */

export function createRegistryState() {
  return {
    // Service name -> Set<location>
    services: new Map(),
    
    // Location -> service name (reverse lookup)
    addresses: new Map(),
    
    // Path -> { service, dataType }
    routes: new Map(),
    
    // Base path -> { service, dataType } (for wildcard routes)
    controllerRoutes: new Map(),
    
    // Domain -> next available port number
    domainPorts: new Map(),
    
    // Subscription type -> Set<location>
    subscriptions: new Map()
  }
}

/**
 * Reset all state to initial values
 */
export function resetState(state) {
  state.services.clear()
  state.addresses.clear()
  state.routes.clear()
  state.controllerRoutes.clear()
  state.domainPorts.clear()
  state.subscriptions.clear()
}

/**
 * Convert Set to Array (replaces global Set.prototype.map pollution)
 */
export function setToArray(set, mapFn = item => item) {
  return Array.from(set, mapFn)
}

/**
 * Serialize services Map to plain object for API responses
 */
export function serializeServicesMap(servicesMap) {
  const result = {}
  for (const [serviceName, locations] of servicesMap) {
    result[serviceName] = setToArray(locations)
  }
  return result
}

