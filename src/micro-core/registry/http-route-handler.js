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
  
  if (result.status || result.dataType && result.payload !== undefined) {
    // TODO specific validations?
    return result
  }
  
  let dataType = detectContentType(result, url)
  logger.debug(`detected content type: ${dataType}`)
  return {
    payload: result,
    dataType
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
async function handleDirectRoute(state, routeInfo, url, requestBody, request, response) {
  const { service, dataType } = routeInfo
  
  const result = await proxyServiceCall(state, {
    name: service,
    payload: requestBody || {},
    request,
    response
  })

  logger.debug(`direct route result: ${!!result}`)

  const normalizedResult = normalizeResult(result, url)
  
  response.writeHead(normalizedResult?.status || 200, { 
    'content-type': normalizedResult?.dataType || dataType 
  })
  sendBufferedResponse(response, normalizedResult)
  
  return false // Signal to skip default response
}

/**
 * Handle a controller route (prefix match)
 */
async function handleControllerRoute(state, controllerInfo, url, requestBody, request, response) {
  const { service, dataType } = controllerInfo
  
  // TODO pipe breaks logs here somewhere

  const result = await proxyServiceCall(state, { 
    name: service, 
    // TODO we have url in request... do we need this in payload?
    payload: { url, ...(requestBody || {}) },
    request,
    response
  })

  logger.debug(`controller route result: ${!!result} ... url: ${url}`)

  const normalizedResult = normalizeResult(result, url)
  
  console.log('handleControllerRoute', { normalizedResult, service, dataType })
  if (!response.isEnded) {
    response.writeHead(normalizedResult?.status || 200, { 
      'content-type': normalizedResult?.dataType || dataType 
    })
    sendBufferedResponse(response, normalizedResult)
  }
  else logger.warn('response already ended') // TODO code-smell?
  return false // signal to skip default response
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
export async function resolvePossibleRoute(state, request, response, payload) {
  const { url } = request
  
  let requestBody = null
  if (payload && typeof payload === 'object') {
    requestBody = payload.payload || payload
  }
  
  // Check for direct route match
  const routeInfo = state.routes.get(url)
  if (routeInfo) {
    // TODO ensure url is passed through proxy call to service
    return handleDirectRoute(state, routeInfo, url, requestBody, request, response)
  }
  
  // Check for controller route match
  const controllerInfo = findControllerRoute(state, url)
  if (controllerInfo) {
    logger.debug(`controller route match: ${JSON.stringify({controllerInfo})}`)
    // TODO ensure url is passed through proxy call to service
    return handleControllerRoute(state, controllerInfo, url, requestBody, request, response)
  } else console.log('no route match', { url, routeInfo, controllerInfo })
  
  // Handle trailing slash redirect
  const redirectResult = handleTrailingSlashRedirect(url, response)
  if (redirectResult === false) {
    return false
  }
  
  // No route matched - return routes for debugging
  console.log('no route matched - returning routes for debugging', { routes: Object.fromEntries(state.routes) })
  return { 
    payload: Object.fromEntries(state.routes),
    dataType: 'application/json' 
  }
}

