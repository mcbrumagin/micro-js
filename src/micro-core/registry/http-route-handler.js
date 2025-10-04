/**
 * HTTP Route Handler
 * Handles HTTP routing for registered routes and controller routes
 */

import { Buffer } from 'node:buffer'
import Logger from '../../utils/logger.js'
import { findControllerRoute } from './route-registry.js'
import { proxyServiceCall } from './service-registry.js'
import { detectContentType } from './content-type-detector.js'

const logger = new Logger()

/**
 * Wrap result in standard format if needed
 */
function normalizeResult(result, url) {
  if (!result) return result
  
  // Already in standard format
  if (result.dataType && result.payload !== undefined) {
    return result
  }
  
  // Wrap raw result
  return {
    payload: result,
    dataType: detectContentType(result, url)
  }
}

/**
 * Send a buffered response to the client
 */
function sendBufferedResponse(response, result) {
  if (result && result.payload) {
    try {
      result.payload = result.payload ? Buffer.from(result.payload) : ''
    } catch (err) {
      logger.warn(err.stack)
    }
  }
  response.end(result && result.payload || result)
}

/**
 * Handle a direct route (exact path match)
 */
async function handleDirectRoute(state, routeInfo, url, response) {
  const { service, dataType } = routeInfo
  
  const result = await proxyServiceCall(state, { name: service, payload: {} })
  const normalizedResult = normalizeResult(result, url)
  
  response.writeHead(200, { 
    'content-type': normalizedResult?.dataType || dataType 
  })
  sendBufferedResponse(response, normalizedResult)
  
  return false // Signal to skip default response
}

/**
 * Handle a controller route (prefix match)
 */
async function handleControllerRoute(state, controllerInfo, url, response) {
  const { service, dataType } = controllerInfo
  
  const result = await proxyServiceCall(state, { 
    name: service, 
    payload: { url } 
  })
  const normalizedResult = normalizeResult(result, url)
  
  response.writeHead(200, { 
    'content-type': normalizedResult?.dataType || dataType 
  })
  sendBufferedResponse(response, normalizedResult)
  
  return false // Signal to skip default response
}

/**
 * Handle trailing slash redirect
 */
function handleTrailingSlashRedirect(url, response) {
  if (url && !url.endsWith('/')) {
    response.writeHead(301, { 'Location': url + '/' })
    response.end()
    return false // Signal to skip default response
  }
  return null // Continue to default response
}

/**
 * Resolve a possible HTTP route
 * Returns false if response was sent, or route data if no match
 */
export async function resolvePossibleRoute(state, request, response) {
  const { url } = request
  
  // Check for direct route match
  const routeInfo = state.routes.get(url)
  if (routeInfo) {
    return handleDirectRoute(state, routeInfo, url, response)
  }
  
  // Check for controller route match
  const controllerInfo = findControllerRoute(state, url)
  if (controllerInfo) {
    return handleControllerRoute(state, controllerInfo, url, response)
  }
  
  // Handle trailing slash redirect
  const redirectResult = handleTrailingSlashRedirect(url, response)
  if (redirectResult === false) {
    return false
  }
  
  // No route matched - return routes for debugging
  return { 
    payload: Object.fromEntries(state.routes),
    dataType: 'application/json' 
  }
}

