/**
 * Service Registry
 * Manages service registration, lookup, and lifecycle
 */

import httpRequest from '../../http-primitives/http-request.js'
import HttpError from '../../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'
import { serializeServicesMap, setToArray } from './registry-state.js'
import { publish, publishCacheUpdate, subscribe, removeAllSubscriptionsForLocation } from './pubsub-manager.js'
import { selectServiceLocation } from './load-balancer.js'
import { HEADERS } from '../../utils/micro-headers.js'

const logger = new Logger()


// TODO util/helper?
const tryParseJson = text => {
  try {
    return JSON.parse(text)
  } catch (err) {
    return text
  }
}

/**
 * Verify auth token for a service call
 * @param {Object} state - Registry state
 * @param {string} serviceName - Name of the service being called
 * @param {string} authToken - Auth token from request headers
 * @returns {Promise<Object>} Verification result with user context
 */
async function verifyAuthToken(state, serviceName, authToken) {
  // Check if service requires auth
  const authServiceName = state.serviceAuth.get(serviceName)
  if (!authServiceName) {
    return { verified: true } // No auth required
  }
  
  // Check if auth service is registered
  if (!state.services.has(authServiceName)) {
    throw new HttpError(503, `Auth service "${authServiceName}" not found`)
  }
  
  // Missing auth token
  if (!authToken) {
    throw new HttpError(401, 'Authentication token required')
  }
  
  try {
    const authLocation = selectServiceLocation(state, authServiceName, 'round-robin')
    logger.debug(`verifying token with auth service at ${authLocation}`)
    
    const verifyResult = await httpRequest(authLocation, {
      method: 'POST',
      body: { verifyToken: { token: authToken } },
      headers: { 'content-type': 'application/json' }
    })
    
    // Auth service returned error
    if (verifyResult instanceof HttpError) {
      throw verifyResult
    }
    
    // Token verification failed
    if (verifyResult.error || !verifyResult.user) {
      const message = verifyResult.message || 'Invalid or expired token'
      throw new HttpError(401, message)
    }
    
    logger.debug(`token verified for user: ${verifyResult.user}`)
    return { verified: true, user: verifyResult.user }
    
  } catch (error) {
    // Auth service unreachable
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new HttpError(503, `Auth service "${authServiceName}" unavailable`)
    }
    
    // Re-throw known errors
    if (error instanceof HttpError) {
      throw error
    }
    
    // Unknown error
    logger.error('Auth verification error:', error)
    throw new HttpError(500, 'Authentication verification failed')
  }
}

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
export async function registerService(state, { service, location, useAuthService }) {
  logger.debug(`registering service "${service}" for location "${location}"`)
  
  // Add to services map
  if (!state.services.has(service)) {
    state.services.set(service, new Set())
  }
  state.services.get(service).add(location)
  
  // Add to reverse lookup
  state.addresses.set(location, service)
  
  // Store auth service mapping if specified
  if (useAuthService) {
    state.serviceAuth.set(service, useAuthService)
    logger.info(`service "${service}" using auth "${useAuthService}"`)
  }
  
  // Notify other services about the new registration using cache update headers
  await publishCacheUpdate(state, { service, location })
  
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
    // Also remove auth mapping when no instances remain
    state.serviceAuth.delete(service)
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
  if (serviceName === '*') {
    return serializeServicesMap(state.services)
  }
  
  // Find a single service instance
  return selectServiceLocation(state, serviceName, strategy)
}


const validateServiceCall = (state, name) => {
  if (!name) {
    throw new HttpError(400, 'Proxy call requires service "name" property')
  }
  if (!state.services.has(name)) {
    throw new HttpError(404, `No service by name "${name}"`)
  }
}

const setProxyRequestOptions = (request, response) => {
  let options = null
  if (request) {
    options = {}
    options.method = 'POST'
    
    // copy headers, filtering out headers that fetch() doesn't like
    const filteredHeaders = {}
    const skipHeaders = ['host', 'connection', 'content-length']
    
    for (const [key, value] of Object.entries(request.headers || {})) {
      const keyLower = key.toLowerCase()
      
      // Skip problematic headers
      if (skipHeaders.includes(keyLower)) continue
      
      // NEW: Don't forward micro-command headers to services
      // Services don't need to know they were called via registry
      if (keyLower.startsWith('micro-command') || keyLower.startsWith('micro-service-')) continue
      
      filteredHeaders[key] = value
    }
    
    options.headers = filteredHeaders
    options.headers['x-micro-override-method'] = request.method

    // enable streaming mode if we have a response object to pipe to
    options.stream = !!response
  }
  return options
}

const handleStreamingResponse = async (serviceResponse, response) => {
  const contentType = serviceResponse.headers.get('content-type')
  const contentLength = serviceResponse.headers.get('content-length')
  const lastModified = serviceResponse.headers.get('last-modified')
  logger.debug(`streaming response from service: ${contentType}, ${contentLength} bytes, last-modified: ${lastModified}`)
  
  // Copy response headers // TODO copy other headers?
  response.writeHead(serviceResponse.status, {
    'content-type': contentType,
    ...(contentLength && { 'content-length': contentLength }),
    ...(lastModified && { 'last-modified': lastModified })
  })
  
  // stream the response body using Node.js streams
  // convert Web ReadableStream to Node stream and pipe
  const reader = serviceResponse.body.getReader()
  
  try {
    while (true) {
      // TODO timeout and buffer size limit
      const { done, value } = await reader.read()
      if (done) break
      response.write(value)
    }
    response.end()
  } catch (err) {
    logger.error(`Streaming error: ${err.message}`)
    if (!response.writableEnded) {
      response.end()
    }
  }
  
  return false // signal that response was handled
}

/**
 * Stream proxy a call to a service (for large payloads, multipart, etc.)
 * Pipes the request stream directly to the service without buffering
 */
export async function streamProxyServiceCall(state, { name, request, response }) {
  const http = (await import('node:http')).default
  
  validateServiceCall(state, name)

  // Verify auth token if service requires authentication
  const authToken = request.headers?.[HEADERS.AUTH_TOKEN]
  await verifyAuthToken(state, name, authToken)

  // use round-robin for proxy calls
  const location = selectServiceLocation(state, name, 'round-robin')
  const url = new URL(location)

  logger.debug(`streaming proxy request to "${location}"`)

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: request.method,
      headers: {
        ...request.headers,
        host: url.host // Override host header for target service
      }
    }

    const proxyReq = http.request(options, (proxyRes) => {
      // Forward status code and headers to client
      response.writeHead(proxyRes.statusCode, proxyRes.headers)
      
      // Pipe response body directly to client
      proxyRes.pipe(response)
      
      proxyRes.on('end', () => {
        logger.debug('Streaming proxy response complete')
        resolve(false) // false = response handled
      })
      
      proxyRes.on('error', (err) => {
        logger.error('Proxy response error:', err)
        if (!response.writableEnded) {
          response.end()
        }
        reject(err)
      })
    })

    proxyReq.on('error', (err) => {
      logger.error('Proxy request error:', err)
      if (!response.headersSent) {
        response.writeHead(502)
        response.end('Bad Gateway')
      }
      reject(err)
    })

    request.on('error', (err) => {
      logger.error('Request stream error:', err)
      proxyReq.destroy()
      reject(err)
    })

    request.on('end', () => {
      logger.debug('Request stream ended')
    })

    // Pipe request body directly to service (no buffering)
    // Make sure to properly end the proxy request when input ends
    request.pipe(proxyReq, { end: true })
  })
}

/**
 * Proxy a call to a service (with load balancing)
 * Supports transparent streaming when service returns non-JSON content
 */
export async function proxyServiceCall(state, { name, payload = {}, request, response }) {
  
  validateServiceCall(state, name)

  // Verify auth token if service requires authentication
  const authToken = request.headers?.[HEADERS.AUTH_TOKEN]
  await verifyAuthToken(state, name, authToken)

  // use round-robin for proxy calls
  let location = selectServiceLocation(state, name, 'round-robin')

  let options = setProxyRequestOptions(request, response)
  logger.debug(`proxying request to "${location}"${options?.headers ? ` with headers: ${JSON.stringify(options.headers)}` : ''}`)
  
  location = `${location}${request.url}`
  logger.debug('proxyServiceCall - location:', location)
  
  options.body = payload
  const serviceResponse = await httpRequest(location, options)
  
  if (options?.stream && serviceResponse instanceof Response) {
    const isStreamable = !serviceResponse.headers.get('content-type')?.includes('application/json')
    if (isStreamable && serviceResponse.body) {
      logger.debug('proxyServiceCall - streaming response')
      return await handleStreamingResponse(serviceResponse, response)
    }
  }

  // non-streaming mode (backward compatibility)
  return tryParseJson(await serviceResponse.text())
}
