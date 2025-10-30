/**
 * Load Balancer
 * Handles service instance selection strategies
 */

import HttpError from '../../http-primitives/http-error.js'
import { setToArray } from './registry-state.js'
import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-registry' })

// Track round-robin state per service
const roundRobinState = new Map()

/**
 * Get all addresses for a service
 */
export function getServiceAddresses(state, serviceName) {
  const service = state.services.get(serviceName)
  
  if (!service || service.size === 0) {
    logger.debug('getServiceAddresses - not found:', serviceName)
    throw new HttpError(404, `No service by name "${serviceName}"`)
  }
  
  logger.debug('getServiceAddresses - instances:', service.size)
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
  logger.debug('selectRoundRobin - index:', index, 'of', addresses.length)
  return addresses[index]
}

/**
 * TODO implement least connections strategy
 */
function selectLeastConnections(addresses) {
  return addresses.sort((a, b) => a.connections - b.connections)[0]
}

/**
 * TODO implement least response time strategy
 */
function selectLeastResponseTime(addresses) {
  return addresses.sort((a, b) => a.responseTime - b.responseTime)[0]
}

/**
 * TODO implement least response time with low connection preference
 */
function selectLeastResponseTimeWithLowConnectionPreference(addresses) {
  return addresses.sort((a, b) => a.responseTime - b.responseTime + (a.connections - b.connections))[0]
}

/**
 * TODO implement least memory usage strategy
 */
function selectLeastMemoryUsage(addresses) {
  return addresses.sort((a, b) => a.memoryUsage - b.memoryUsage)[0]
}

/**
 * TODO implement least CPU usage strategy
 */
function selectLeastCpuUsage(addresses) {
  return addresses.sort((a, b) => a.cpuUsage - b.cpuUsage)[0]
}

/**
 * TODO implement least disk usage strategy
 */
function selectLeastDiskUsage(addresses) {
  return addresses.sort((a, b) => a.diskUsage - b.diskUsage)[0]
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

