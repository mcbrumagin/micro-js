/**
 * Load Balancer
 * Handles service instance selection strategies
 */

import HttpError from '../../http-primitives/http-error.js'
import { setToArray } from './registry-state.js'

// Track round-robin state per service
const roundRobinState = new Map()

/**
 * Get all addresses for a service
 */
export function getServiceAddresses(state, serviceName) {
  const service = state.services.get(serviceName)
  
  if (!service || service.size === 0) {
    throw new HttpError(404, `No service by name "${serviceName}"`)
  }
  
  return setToArray(service)
}

/**
 * Select using random strategy
 */
function selectRandom(addresses) {
  const index = Math.floor(Math.random() * addresses.length)
  return addresses[index]
}

/**
 * Select using round-robin strategy
 */
function selectRoundRobin(serviceName, addresses) {
  let index
  
  if (!roundRobinState.has(serviceName)) {
    // First call - use random starting point
    index = Math.floor(Math.random() * addresses.length)
  } else {
    // Subsequent calls - increment
    index = roundRobinState.get(serviceName) + 1
    if (index >= addresses.length) {
      index = 0
    }
  }
  
  roundRobinState.set(serviceName, index)
  return addresses[index]
}

/**
 * Select a service location using the specified strategy
 */
export function selectServiceLocation(state, serviceName, strategy = 'round-robin') {
  const addresses = getServiceAddresses(state, serviceName)
  
  if (strategy === 'random') {
    return selectRandom(addresses)
  }
  
  if (strategy === 'round-robin') {
    return selectRoundRobin(serviceName, addresses)
  }
  
  throw new Error(`Unknown load balancing strategy: ${strategy}`)
}

/**
 * Reset round-robin state (useful for testing)
 */
export function resetRoundRobinState() {
  roundRobinState.clear()
}

