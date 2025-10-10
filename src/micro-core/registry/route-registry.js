/**
 * Route Registry
 * Manages HTTP route registration and lookup
 */

import HttpError from '../../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'

const logger = new Logger()

/**
 * Register a direct route (exact path match)
 */
export function registerDirectRoute(state, { service, path, dataType = 'dynamic' }) {
  state.routes.set(path, { service, dataType })
  logger.debug(`Route "${path}" registered for service "${service}"`)
}

/**
 * Register a controller route (prefix match with wildcard)
 */
export function registerControllerRoute(state, { service, path, dataType = 'dynamic' }) {
  const basePath = path.replace('*', '')
  state.controllerRoutes.set(basePath, { service, dataType })
  logger.debug(`Route controller "${path}" registered for service "${service}"`)
}

/**
 * Register a route (auto-detects direct vs controller)
 */
export function registerRoute(state, { service, path, dataType = 'dynamic' }) {
  if (path.includes('*')) {
    registerControllerRoute(state, { service, path, dataType })
  } else {
    registerDirectRoute(state, { service, path, dataType })
  }
}

/**
 * Find a controller route that matches the URL prefix
 */
export function findControllerRoute(state, url) {
  for (const [basePath, routeInfo] of state.controllerRoutes) {
    const regex = new RegExp(`^${basePath}`, 'i')
    if (regex.test(url)) {
      return routeInfo
    }
  }
  return null
}

/**
 * Get all routes (for listing/debugging)
 */
export function getAllRoutes(state) {
  return {
    routes: Object.fromEntries(state.routes),
    controllerRoutes: Object.fromEntries(state.controllerRoutes)
  }
}

