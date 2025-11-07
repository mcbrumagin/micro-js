import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import envConfig from '../shared/env-config.js'
import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-api' })

/**
 * Validate and normalize a URL path
 * @param {string} path - The path to validate
 * @returns {string} - Normalized path
 */
function validatePath(path) {
  if (!path || typeof path !== 'string') {
    throw new HttpError(400, 'Route path is required and must be a string')
  }
  
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path
  }
  
  // Basic URL validation - check for invalid characters
  const invalidChars = /[<>{}|\\^`\s]/
  if (invalidChars.test(path)) {
    throw new HttpError(400, 'Route path contains invalid characters')
  }
  
  return path
}

/**
 * Build URL with query parameters
 * @param {string} basePath - Base path
 * @param {Object} params - Query parameters
 * @returns {string} - Full URL with query string
 */
function buildUrlWithParams(basePath, params) {
  if (!params || Object.keys(params).length === 0) {
    return basePath
  }
  
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      searchParams.append(key, String(value))
    }
  }
  
  const queryString = searchParams.toString()
  return queryString ? `${basePath}?${queryString}` : basePath
}

/**
 * Call a registered route like a normal HTTP endpoint
 * Provides framework convenience while functioning like a standard HTTP client
 * 
 * @param {string} path - Route path (e.g., '/api/users', '/health')
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method (GET, POST, PUT, DELETE, etc.) [default: 'GET']
 * @param {*} options.body - Request body (will be JSON stringified if object)
 * @param {Object} options.headers - Additional headers
 * @param {Object} options.params - Query parameters to append to URL
 * @param {string} options.contentType - Content-Type header [default: 'application/json']
 * @param {string} options.authToken - Auth token for protected routes
 * @returns {Promise<*>} Response data
 * 
 * @example
 * // Simple GET request
 * const users = await callRoute('/api/users')
 * 
 * // GET with query parameters
 * const filtered = await callRoute('/api/users', { 
 *   params: { role: 'admin', active: true } 
 * })
 * 
 * // POST with body
 * const newUser = await callRoute('/api/users', { 
 *   method: 'POST', 
 *   body: { name: 'John', email: 'john@example.com' } 
 * })
 * 
 * // Protected route with auth
 * const profile = await callRoute('/api/profile', { 
 *   authToken: 'user-token-123' 
 * })
 */
export default async function callRoute(path, {
  method = 'GET',
  body = null,
  headers = {},
  params = null,
  contentType = 'application/json',
  authToken = null
} = {}) {
  // Validate and normalize the path
  const normalizedPath = validatePath(path)
  
  // Build full URL with query parameters
  const pathWithParams = buildUrlWithParams(normalizedPath, params)
  
  // Get registry URL
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const fullUrl = `${registryHost}${pathWithParams}`
  
  logger.debug('callRoute - method:', method, 'path:', pathWithParams)
  
  // Build request headers
  const requestHeaders = {
    ...headers,
    'content-type': contentType
  }
  
  // Add auth token if provided
  if (authToken) {
    requestHeaders['micro-auth-token'] = authToken
  }
  
  // Make request
  const result = await httpRequest(fullUrl, {
    method,
    body,
    headers: requestHeaders
  })
  
  return result
}

