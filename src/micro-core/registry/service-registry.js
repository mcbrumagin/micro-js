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
export function allocateServicePort(state, { service, domain, home }, defaultStartPort = 10000) {
  // Accept both 'home' and 'domain' for backwards compatibility
  let serviceHome = home || domain
  logger.debug(`allocating port for service "${service}" at domain "${serviceHome}"`)
  
  // if serviceHome has a port already, use it
  let port = serviceHome.split(':')[2]
  if (port) {
    serviceHome = serviceHome.split(':').slice(0, 2).join(':')
    state.domainPorts.set(serviceHome, port)
  }
  
  if (!state.domainPorts.has(serviceHome)) {
    state.domainPorts.set(serviceHome, defaultStartPort)
  }
  
  if (!port) {
    port = state.domainPorts.get(serviceHome)
    state.domainPorts.set(serviceHome, port + 1)
  }
  
  const location = `${serviceHome}:${port}`
  logger.debug(`allocated "${location}" for service "${service}"`)
  
  return location
}

/**
 * Register a service instance
 */
export async function registerService(state, { service, location }) {
  logger.debug(`registering service "${service}" for location "${location}"`)
  
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
  logger.debug(`unregistering service "${service}" for location "${location}"`)
  
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
  logger.debug(`looking up service "${serviceName}"`)
  
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
export async function proxyServiceCall(state, { name, payload = {}, request, response }) {
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

  let options
  // moderately transparent proxying of request
  if (request) {
    options = { method: 'POST', headers: request.headers }
    options.headers['x-micro-override-method'] = request.method
  }

  logger.debug(`proxying request to "${location}"${options ? ` with options ${JSON.stringify(options)}` : ''}`)
  // logger.debug(`payload: ${JSON.stringify(payload)}`)
  return await httpRequest(location, payload, options)
}

