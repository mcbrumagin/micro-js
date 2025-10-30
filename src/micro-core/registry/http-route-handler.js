/**
 * HTTP Route Handler
 * Handles HTTP routing for registered routes and controller routes
 */

import { Buffer } from 'node:buffer'
import Logger from '../../utils/logger.js'
import { findControllerRoute } from './route-registry.js'
import { proxyServiceCall, streamProxyServiceCall } from './service-registry.js'
import { detectContentType } from './content-type-detector.js'
import { Next } from '../../http-primitives/next.js'

const logger = new Logger({ logGroup: 'micro-registry' })

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
  logger.debug(`normalizeResult - detected content type: ${dataType}`)
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
      logger.debugErr('sendBufferedResponse - buffer conversion error:', err)
      // TODO throw? remove? code-smell
    }
  }
  response.end(result && result.payload || result)
}

/**
 * Handle a direct route (exact path match)
 */
async function handleDirectRoute(state, routeInfo, url, requestBody, request, response) {
  const { service, dataType } = routeInfo

  // TODO create helper function to handle streaming and buffered proxy calls

  const contentType = request.headers['content-type'] || ''
  const useStreaming = contentType.includes('multipart/')
  
  let result
  if (useStreaming) {
    logger.debug('directRoute - streaming proxy for:', service)
    result = await streamProxyServiceCall(state, { 
      name: service, 
      request, 
      response 
    })
  } else {
    // Use buffered proxy - backward compatible for JSON/text payloads
    result = await proxyServiceCall(state, { 
      name: service, 
      payload: requestBody || {}, 
      request, 
      response 
    })
  }
  // TODO done() instead of next()? preventDefault()?
  if (result instanceof Next || result === false /* TODO remove */) {
    return result
  }

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
  
  // TODO create helper function to handle streaming and buffered proxy calls

  const contentType = request.headers['content-type'] || ''
  const useStreaming = contentType.includes('multipart/')

  let result
  if (useStreaming) {
    result = await streamProxyServiceCall(state, { 
      name: service, 
      request, 
      response 
    })
  } else {
    result = await proxyServiceCall(state, { 
      name: service, 
      payload: { url, ...(requestBody || {}) }, 
      request, 
      response 
    })
  }
  // TODO done() instead of next()? preventDefault()?
  if (result instanceof Next || result === false /* TODO remove */) {
    return result
  }

  const normalizedResult = normalizeResult(result, url)
  
  // console.log('response.end.toString()', response.end.toString())
  if (!response.isEnded) {
    response.writeHead(normalizedResult?.status || 200, { 
      'content-type': normalizedResult?.dataType || dataType 
    })
    sendBufferedResponse(response, normalizedResult)
  }
  
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
  logger.debug('resolvePossibleRoute - url:', url)
  
  let requestBody = null
  if (payload && typeof payload === 'object') {
    requestBody = payload.payload || payload
  }
  
  const routeInfo = state.routes.get(url)
  if (routeInfo) {
    return handleDirectRoute(state, routeInfo, url, requestBody, request, response)
  }
  
  const controllerInfo = findControllerRoute(state, url)
  if (controllerInfo) {
    logger.debug('controller match:', controllerInfo.pattern)
    return handleControllerRoute(state, controllerInfo, url, requestBody, request, response)
  }
  
  // Handle trailing slash redirect
  const redirectResult = handleTrailingSlashRedirect(url, response)
  if (redirectResult === false) {
    return false
  }

  logger.debug('no route matched')
  if (process.env.ENVIRONMENT?.toLowerCase().includes('dev')) {
    logger.debug('returning routes for debugging', { routes: Object.fromEntries(state.routes) })
    return { 
      payload: Object.fromEntries(state.routes),
      dataType: 'application/json' 
    }
  } else throw new HttpError(404, 'No route')
}
