/**
 * Micro Headers
 * Constants and utilities for header-based command routing
 * 
 * Phase 1-Light: Essential headers only for streaming support
 */

/**
 * Header name constants
 */
export const HEADERS = {
  // Command routing
  COMMAND: 'micro-command',
  
  // Service operations
  SERVICE_NAME: 'micro-service-name',
  SERVICE_LOCATION: 'micro-service-location',
  USE_AUTH_SERVICE: 'micro-use-auth-service',
  SERVICE_HOME: 'micro-service-home',
  
  // Authentication
  AUTH_TOKEN: 'micro-auth-token',           // User auth token for service calls
  REGISTRY_TOKEN: 'micro-registry-token',   // Internal registry/service token
  
  // TODO VERIFY
  // Route operations (for registration only - routes use request.url for routing)
  ROUTE_DATATYPE: 'micro-route-datatype',
  ROUTE_TYPE: 'micro-route-type',  // 'route' or 'controller'
  ROUTE_PATH: 'micro-route-path',  // Only used during route registration
  
  // Pub/sub operations
  PUBSUB_CHANNEL: 'micro-pubsub-channel'
}

/**
 * Command types (values for micro-command header)
 */
export const COMMANDS = {
  // Shared
  HEALTH: 'health',

  // Registry
  SERVICE_SETUP: 'service-setup',
  SERVICE_REGISTER: 'service-register',
  SERVICE_UNREGISTER: 'service-unregister',
  SERVICE_LOOKUP: 'service-lookup',
  SERVICE_CALL: 'service-call',
  ROUTE_REGISTER: 'route-register',
  PUBSUB_PUBLISH: 'pubsub-publish',
  PUBSUB_SUBSCRIBE: 'pubsub-subscribe',
  PUBSUB_UNSUBSCRIBE: 'pubsub-unsubscribe',

  // Authentication
  AUTH_LOGIN: 'auth-login',
  AUTH_REFRESH: 'auth-refresh',

  // Service
  CACHE_UPDATE: 'cache-update'
}

/**
 * Build headers for service setup
 */
export function buildSetupHeaders(serviceName, serviceHome) {
  return {
    [HEADERS.COMMAND]: COMMANDS.SERVICE_SETUP,
    [HEADERS.SERVICE_NAME]: serviceName,
    [HEADERS.SERVICE_HOME]: serviceHome
  }
}

/**
 * Build headers for service registration
 */
export function buildRegisterHeaders(serviceName, location, useAuthService) {
  return {
    [HEADERS.COMMAND]: COMMANDS.SERVICE_REGISTER,
    [HEADERS.SERVICE_NAME]: serviceName,
    [HEADERS.SERVICE_LOCATION]: location,
    ...(useAuthService && { [HEADERS.USE_AUTH_SERVICE]: useAuthService })
  }
}

/**
 * Build headers for service unregistration
 */
export function buildUnregisterHeaders(serviceName, location) {
  return {
    [HEADERS.COMMAND]: COMMANDS.SERVICE_UNREGISTER,
    [HEADERS.SERVICE_NAME]: serviceName,
    [HEADERS.SERVICE_LOCATION]: location
  }
}

/**
 * Build headers for service lookup
 */
export function buildLookupHeaders(serviceName) {
  return {
    [HEADERS.COMMAND]: COMMANDS.SERVICE_LOOKUP,
    [HEADERS.SERVICE_NAME]: serviceName
  }
}

/**
 * Build headers for service calls
 */
export function buildCallHeaders(serviceName, authToken = null) {
  return {
    [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
    [HEADERS.SERVICE_NAME]: serviceName,
    ...(authToken && { [HEADERS.AUTH_TOKEN]: authToken })
  }
}

/**
 * Build headers for route registration
 */
export function buildRouteRegisterHeaders(serviceName, routePath, dataType, routeType = 'route') {
  return {
    [HEADERS.COMMAND]: COMMANDS.ROUTE_REGISTER,
    [HEADERS.SERVICE_NAME]: serviceName,
    [HEADERS.ROUTE_PATH]: routePath,
    [HEADERS.ROUTE_DATATYPE]: dataType || 'application/json',
    [HEADERS.ROUTE_TYPE]: routeType
  }
}

/**
 * Build headers for pub/sub publish
 */
export function buildPublishHeaders(channel) {
  return {
    [HEADERS.COMMAND]: COMMANDS.PUBSUB_PUBLISH,
    [HEADERS.PUBSUB_CHANNEL]: channel
  }
}

/**
 * Build headers for pub/sub subscribe
 */
export function buildSubscribeHeaders(channel, location) {
  return {
    [HEADERS.COMMAND]: COMMANDS.PUBSUB_SUBSCRIBE,
    [HEADERS.PUBSUB_CHANNEL]: channel,
    [HEADERS.SERVICE_LOCATION]: location
  }
}

/**
 * Build headers for pub/sub unsubscribe
 */
export function buildUnsubscribeHeaders(channel, location) {
  return {
    [HEADERS.COMMAND]: COMMANDS.PUBSUB_UNSUBSCRIBE,
    [HEADERS.PUBSUB_CHANNEL]: channel,
    [HEADERS.SERVICE_LOCATION]: location
  }
}

/**
 * Build headers for cache update notifications
 */
export function buildCacheUpdateHeaders(serviceName, location) {
  return {
    [HEADERS.COMMAND]: COMMANDS.CACHE_UPDATE,
    [HEADERS.SERVICE_NAME]: serviceName,
    [HEADERS.SERVICE_LOCATION]: location
  }
}

/**
 * Build headers for auth login
 */
export function buildAuthLoginHeaders() {
  return {
    [HEADERS.COMMAND]: COMMANDS.AUTH_LOGIN
  }
}

/**
 * Build headers for auth refresh
 */
export function buildAuthRefreshHeaders() {
  return {
    [HEADERS.COMMAND]: COMMANDS.AUTH_REFRESH
  }
}

/**
 * Parse command headers from request
 * Returns an object with parsed header values
 */
export function parseCommandHeaders(headers) {
  return {
    command: headers[HEADERS.COMMAND],
    serviceName: headers[HEADERS.SERVICE_NAME],
    serviceLocation: headers[HEADERS.SERVICE_LOCATION],
    useAuthService: headers[HEADERS.USE_AUTH_SERVICE],
    serviceHome: headers[HEADERS.SERVICE_HOME],
    routePath: headers[HEADERS.ROUTE_PATH],
    routeDataType: headers[HEADERS.ROUTE_DATATYPE],
    routeType: headers[HEADERS.ROUTE_TYPE],
    pubsubChannel: headers[HEADERS.PUBSUB_CHANNEL]
  }
}

/**
 * Check if request uses header-based commands
 */
export function isHeaderBasedCommand(headers) {
  return !!(headers && headers[HEADERS.COMMAND])
}

/**
 * Commands that should NOT JSON parse the body
 * These commands need to preserve raw body data
 */
export const STREAM_COMMANDS = new Set([
  COMMANDS.SERVICE_CALL
])

/**
 * Check if command should skip JSON parsing
 */
export function shouldSkipJsonParsing(command) {
  return STREAM_COMMANDS.has(command)
}

