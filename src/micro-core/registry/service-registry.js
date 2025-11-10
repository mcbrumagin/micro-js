/**
 * Service Registry
 * Manages service registration, lookup, and lifecycle
 */

import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'
import { serializeServicesMap, setToArray } from './registry-state.js'
import { publish, publishCacheUpdate, subscribe, removeAllSubscriptionsForLocation } from './pubsub-manager.js'
import { selectServiceLocation } from './load-balancer.js'
import { HEADERS } from '../shared/micro-headers.js'
import net from 'node:net'

const logger = new Logger({ logGroup: 'micro-registry' })


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
    logger.debug('verifyAuthToken - authService:', authServiceName)
    
    const verifyResult = await httpRequest(authLocation, {
      method: 'POST',
      body: { verifyAccess: authToken },
      headers: { 'content-type': 'application/json' }
    })
    
    // Auth service returned error
    if (verifyResult instanceof HttpError) {
      throw verifyResult
    }
    
    // Token verification failed
    // verifyResult.status
    if (verifyResult.error) {// TODO // || !verifyResult.user) {
      const message = verifyResult.message || 'Invalid or expired token'
      throw new HttpError(401, message)
    }
    
    logger.debug('verifyAuthToken - user:', verifyResult.user)
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
    
    logger.debugErr('Auth verification error:', error)
    throw new HttpError(500, 'Authentication verification failed')
  }
}

// TODO logger support for Map, etc
function printState(state) {
  for (let prop in state) {
    let map = state[prop]
    logger.debug(`map[${prop}]`)
    for (let [key, val] of map.entries()) {
      logger.debug(`  ${key}: ${val}`)
    }
  }
}

/**
 * Allocate a port for a new service instance
 */
export function allocateServicePort(state, { service, domain, home }, defaultStartPort = 10000) {
  // Accept both 'home' and 'domain' for backwards compatibility
  let serviceHome = home || domain
  logger.debug('allocateServicePort - service:', service)
  
  /**
   * TODO need bug analysis and fix for dynamic ports
   * when running multiple services at localhost:4000-4018
   * orchestrating second service run (using 127.0.0.1:3998 to simulate a different host)
   * the registry leaves some 
   * 
    micro-registry | map[domainPorts]
    micro-registry |   http://localhost: 4019 <--- normal initial registry home + services run
    micro-registry |   http://127.0.0.1:3998: 4001 <--- problem state, will cause more errors for next service
    micro-registry |   http://127.0.0.1:4000: 4020 <--- this service home doesn't make sense though either

    ---another example with 127.0.0.1:3999---
    micro-registry | map[domainPorts]
    micro-registry |   http://localhost: 4019
    micro-registry |   http://127.0.0.1:3999: 4002
    micro-registry |   http://127.0.0.1:4000: 4020
    micro-registry |   http://127.0.0.1:4001: 4021

    --- another example with 127.0.0.1:3999 but running the script immediately after main ---
    --- this is ironically better as far as setup failures, but the state in the registry is hideous ---
    micro-registry | map[domainPorts]
    micro-registry |   http://localhost: 4019
    micro-registry |   http://127.0.0.1:3999: 4002
    micro-registry |   http://127.0.0.1:4000: 4003
    micro-registry |   http://127.0.0.1:4001: 4004
    micro-registry |   http://localhost:4002: 4007
    micro-registry |   http://localhost:4003: 4006
    micro-registry |   http://localhost:4005: 4008
    micro-registry |   http://localhost:4006: 4009
    micro-registry |   http://localhost:4007: 4010
    micro-registry |   http://localhost:4008: 4011
    micro-registry |   http://localhost:4009: 4012
    micro-registry |   http://localhost:4010: 4013
    micro-registry |   http://localhost:4011: 4014
    micro-registry |   http://localhost:4012: 4015
    micro-registry |   http://localhost:4013: 4016
    micro-registry |   http://localhost:4014: 4017
    micro-registry |   http://localhost:4015: 4018
    micro-registry |   http://localhost:4016: 4019
    micro-registry |   http://localhost:4017: 4020
    micro-registry |   http://localhost:4018: 4021

    ---------------------------------------------------------------------------------
    WE CAN EITHER PATCH THIS DIRECTLY OR IMPLEMENT A MORE EXPLICIT PORT BLACKLIST
    blacklisted ports could be purged or individually cleared using registry commands
    additionally, we could have a ping for service home addresses to obtain a real ip to store
    then this particular port conflict will be avoided as it will resolve to the same domain
    however, for two external service stacks sharing the same network, the issue will persist
    without a blacklist or domaintPorts fix
    it may also be beneficial to create a map of external service homes/real-ips?

    this also may become a non-issue by migrating to a node-handler system
    an initial createService call checks if the registry is on the same system
    if not, it creates a node (compute, container, etc) handler service
    the node handler serves system health, acts as the middleman for cache updates, etc
    a node handler could essentially be a registry replica
    but then we need to determine how that works (raft?)
    seems like too much too soon idk
    ---------------------------------------------------------------------------------
   *
   */

  // if serviceHome has a port already, use it
  let port = Number(serviceHome.split(':')[2])
  
  if (port) {
    // if the port is already in use for the domain, increment
    //   until we get a free one to return from setup call

    let nextPort = state.domainPorts.get(serviceHome)
    if (nextPort) {
      port = nextPort
    }

    // save the full home (with port) so we can increment off it separately
    state.domainPorts.set(serviceHome, port + 1)

  }
  
  if (!state.domainPorts.has(serviceHome)) {
    state.domainPorts.set(serviceHome, defaultStartPort)
  }
  
  if (!port) {
    port = state.domainPorts.get(serviceHome)
    state.domainPorts.set(serviceHome, port + 1)
  }
  
  serviceHome = serviceHome.split(':').slice(0, 2).join(':')
  if (serviceHome.includes('http,')) console.warn('BAD') && process.exit(1)
  const location = `${serviceHome}:${port}`
  logger.debug('allocateServicePort - location:', location)
  
  // console.log('state:', printState(state))

  return location
}

/**
 * Register a service instance
 */
export async function registerService(state, { service, location, useAuthService }) {
  logger.debug(`registerService - service "${service}" registering for ${location}`)
  
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
    logger.info(`Configured "${service}" to use auth: "${useAuthService}"`)
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
  logger.info(`Service "${service}" unregistered from ${location}`)
  
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
  logger.debug('findServiceLocation - service:', serviceName)
  
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

const parseForwardedHeader = (forwarded) => {
  let result = {}
  if (forwarded) {
    const parts = forwarded.split(';')
    for (const part of parts) {
      const [key, value] = part.split('=')
      if (value.startsWith('[') && value.endsWith(']')) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  }
  return result
}

const writeForwardedHeaders = (request, headers) => {
  // prefer forwarded header over x-forwarded headers
  let forwardedDetails = parseForwardedHeader(request.headers['forwarded'])
  
  let senderAddress = forwardedDetails?.for || request.headers['x-forwarded-for']

  let isAlreadyForwarded = !!forwardedDetails?.for

  if (!senderAddress) {
    let { remoteAddress, remotePort } = request.socket
    senderAddress = remoteAddress
    if (!net.isIPv4(senderAddress)) senderAddress = `[${senderAddress}]`
    senderAddress += remotePort ? `:${remotePort}` : ''
  }

  // begin building modern forwarded header
  let forwarded = `for="${senderAddress}"`

  let serverAddress = request.socket.address()
  let { address, family, port} = serverAddress

  if (family === 'IPv6') address = `[${address}]:${port}`
  else address = `${address}:${port}`

  // TODO verify this is correctly formatted in each case... this would be a good spot for unit tests
  let by = forwarded.by || request.headers['x-forwarded-by']
  if (by) by += `,${address}` // append additional proxy if there is one already
  else by = address

  forwarded += `;by="${by}"`
  headers['X-Forwarded-By'] = by // including x-forwarded headers for backwards compatibility

  let host = forwardedDetails.host || request.headers.host
  if (host) { // the original host requested by the client
    forwarded += `;host=${host}`
    headers['X-Forwarded-Host'] = host
  }

  let proto = forwardedDetails.proto || request.headers['x-forwarded-proto']
  if (proto) { // the original protocol requested by the client
    forwarded += `;proto=${proto}`
    headers['X-Forwarded-Proto'] = proto
  }

  logger.debug('writing forwarded header - forwarded:', forwarded)
  headers['Forwarded'] = forwarded
}

const setProxyRequestOptions = (request, response) => {
  let options = null
  if (request) {
    options = {}
    options.method = 'POST'
    
    // copy headers, filtering out headers that fetch() doesn't like
    const filteredHeaders = {}
    const skipHeaders = ['host', 'connection', 'content-length']
    
    // logger.info('request header "forwarded":', request.headers['forwarded'])
    for (const [key, value] of Object.entries(request.headers || {})) {
      // logger.info('request header:', key, value)
      const keyLower = key.toLowerCase()
      
      // Skip problematic headers
      if (skipHeaders.includes(keyLower)) continue
      
      // NEW: Don't forward micro-command headers to services
      // Services don't need to know they were called via registry
      if (keyLower.startsWith('micro-command') || keyLower.startsWith('micro-service-')) continue
      
      filteredHeaders[key] = value
    }
    
    options.headers = filteredHeaders
    writeForwardedHeaders(request, options.headers)
    // options.headers['x-micro-override-method'] = request.method

    // enable streaming mode if we have a response object to pipe to
    options.stream = !!response
  }
  return options
}

const handleStreamingResponse = async (serviceResponse, response) => {
  const contentType = serviceResponse.headers.get('content-type')
  const contentLength = serviceResponse.headers.get('content-length')
  const lastModified = serviceResponse.headers.get('last-modified')
  logger.debug('handleStreamingResponse - bytes:', contentLength)
  
  // copy response headers // TODO copy other headers?
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
    logger.debugErr('Streaming error:', err)
    if (!response.writableEnded) {
      response.end()
    }
  }
  
  return false // signal that response was handled
}

const headerWhitelist = [
  'accept',
  'accept-language',
  'connection',
  'content-type',
  'origin',
  'referer',
  'forwarded',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'user-agent',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',

  // Range request headers for streaming media
  'range',
  'if-range',
  'accept-ranges',

  // TODO verify relevant micro-headers are forwarded
  'cookie', // TODO only for auth services
  'micro-command',
  'micro-service-name',
  'micro-auth-token',
  'micro-registry-token'
]

const filterForUsefulHeaders = (headers) => {
  const filteredHeaders = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!headerWhitelist.includes(key.toLowerCase())) continue
    filteredHeaders[key] = value
  }
  return filteredHeaders
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
  const endpoint = request.url
  const url = new URL(location + (endpoint ? endpoint : ''))

  logger.debug('streamProxyServiceCall - location:', location)

  const headers = filterForUsefulHeaders(request.headers)
  writeForwardedHeaders(request, headers) // TODO functional approach?
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: request.method,
      headers: {
        ...headers,
        host: url.host // Override host header for target service
      }
    }

    // logger.debug('streamProxyServiceCall - options:', options)

    const proxyReq = http.request(options, (proxyRes) => {
      // Forward status code and headers to client
      response.writeHead(proxyRes.statusCode, proxyRes.headers)
      
      // Pipe response body directly to client
      proxyRes.pipe(response)
      
      proxyRes.on('end', () => {
        logger.debug('streamProxyServiceCall - complete')
        resolve(false)
      })
      
      proxyRes.on('error', (err) => {
        logger.debugErr('Proxy response error:', err)
        if (!response.writableEnded) {
          response.end()
        }
        // Don't reject if response already ended - just resolve to prevent unhandled rejection
        if (response.writableEnded) {
          resolve(false)
        } else {
          reject(err)
        }
      })
    })

    proxyReq.on('error', (err) => {
      logger.debugErr('Proxy request error:', err)
      if (!response.headersSent) {
        response.writeHead(502)
        response.end('Bad Gateway')
        reject(err)
      } else {
        // Response already started - log error but don't reject to avoid unhandled rejection
        logger.error('Proxy request error after response started:', err)
        if (!response.writableEnded) {
          response.end()
        }
        resolve(false)
      }
    })

    request.on('error', (err) => {
      logger.debugErr('Request stream error:', err)
      proxyReq.destroy()
      if (!response.headersSent) {
        reject(err)
      } else {
        // Response already started - log but don't reject
        logger.error('Request stream error after response started:', err)
        resolve(false)
      }
    })

    request.on('end', () => {
      logger.debug('streamProxyServiceCall - request stream ended')
    })

    // Pipe request body directly to service (no buffering)
    // Make sure to properly end the proxy request when input ends
    request.pipe(proxyReq, { end: true })
  }).catch(err => {
    // Additional safety: catch any unhandled rejections in the promise chain
    logger.debugErr('Caught unhandled error in streamProxyServiceCall:', err)
    if (!response.headersSent && !response.writableEnded) {
      try {
        response.writeHead(500, { 'content-type': 'text/plain' })
        response.end(err.message || 'Internal Server Error')
      } catch (writeErr) {
        logger.error('Failed to send error response:', writeErr)
      }
    }
    // Return false to indicate response was handled
    return false
  })
}
