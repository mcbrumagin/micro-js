/**
 * Service Registry
 * Manages service registration, lookup, and lifecycle
 */

import httpRequest from '../../http-primitives/http-request.js'
import HttpError from '../../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'
import { serializeServicesMap, setToArray } from './registry-state.js'
import { publish, subscribe, removeAllSubscriptionsForLocation } from './pubsub-manager.js'
import { selectServiceLocation } from './load-balancer.js'

const logger = new Logger()

/**
 * Allocate a port for a new service instance
 */
export function allocateServicePort(state, { service, domain }, defaultStartPort = 10000) {
  logger.trace(`Allocating port for service "${service}" at domain "${domain}"`)
  
  if (!state.domainPorts.has(domain)) {
    state.domainPorts.set(domain, defaultStartPort)
  }
  
  const port = state.domainPorts.get(domain)
  state.domainPorts.set(domain, port + 1)
  
  const location = `${domain}:${port}`
  return location
}

/**
 * Register a service instance
 */
export async function registerService(state, { service, location }) {
  logger.trace(`Registering service "${service}" for location "${location}"`)
  
  // Add to services map
  if (!state.services.has(service)) {
    state.services.set(service, new Set())
  }
  state.services.get(service).add(location)
  
  // Add to reverse lookup
  state.addresses.set(location, service)
  
  // Notify other services about the new registration
  await publish(state, { type: 'register', message: { service, location } })
  
  // Subscribe the new service to registration events
  subscribe(state, { type: 'register', location })
  
  // Return current registry state
  return {
    services: serializeServicesMap(state.services),
    addresses: Object.fromEntries(state.addresses)
  }
}

/**
 * Unregister a service instance
 */
export function unregisterService(state, { service, location }) {
  logger.trace(`Unregistering service "${service}" for location "${location}"`)
  
  // Remove from reverse lookup
  state.addresses.delete(location)
  
  // Remove from services map
  const serviceInstances = state.services.get(service)
  if (!serviceInstances) {
    throw new HttpError(404, `No service by name "${service}"`)
  }
  
  serviceInstances.delete(location)
  
  // Clean up empty service entries
  if (serviceInstances.size === 0) {
    state.services.delete(service)
  }
  
  // Clean up all subscriptions for this location
  removeAllSubscriptionsForLocation(state, location)
}

/**
 * Find a service location (with optional strategy)
 * Returns a single location or all services
 */
export function findServiceLocation(state, serviceName, strategy = 'random') {
  logger.trace(`Looking up service "${serviceName}"`)
  
  // Special case: return all services
  if (serviceName === 'all') {
    return serializeServicesMap(state.services)
  }
  
  // Find a single service instance
  return selectServiceLocation(state, serviceName, strategy)
}

/**
 * Proxy a call to a service (with load balancing)
 */
export async function proxyServiceCall(state, { name, payload = {} }) {
  if (!name) {
    const err = new HttpError(400, 'Proxy call requires service "name" property')
    err.details = { name, payload }
    throw err
  }
  
  if (!state.services.has(name)) {
    const err = new HttpError(404, `No service by name "${name}"`)
    err.details = { name, payload }
    throw err
  }
  
  // Use round-robin for proxy calls
  const location = selectServiceLocation(state, name, 'round-robin')
  const result = await httpRequest(location, payload)
  
  return result
}

