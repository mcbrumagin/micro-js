
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import { buildRouteRegisterHeaders, buildLookupHeaders } from '../utils/micro-headers.js'
import http from 'node:http'

const logger = new Logger()

const falseOnFailure = async fn => {
  try {
    return await fn()
  } catch (err) {
    return false
  }
}

export default async function createRoute (path, serviceNameOrFn, dataType) {
  if (!path || !serviceNameOrFn) {
    throw new HttpError(400, 'Route path and service fn or name are required')
  }

  // TODO use config helper
  let registryHost = process.env.MICRO_REGISTRY_URL
  let serviceName
  let server

  if (serviceNameOrFn instanceof http.Server) {
    server = serviceNameOrFn
    logger.debug('createRoute - server.name:', server.name)
    serviceName = server.name
  } else if (typeof serviceNameOrFn === 'function') {
    // For functions, first check if a service with this function name already exists
    const functionName = serviceNameOrFn.name // TODO VERIFY ANON
    
    // Try to lookup existing service by function name
    const existingLocation = functionName && await falseOnFailure(async () => await httpRequest(registryHost, {
      headers: buildLookupHeaders(functionName)
    }))

    logger.debug('createRoute - existingLocation:', existingLocation)
    logger.debug('createRoute - functionName:', functionName)
    if (existingLocation) {
      // Service already exists, use the existing service name
      serviceName = functionName
      logger.debug(`route "${path}" using existing service "${serviceName}" at "${existingLocation}"`)
    } else {
      // Service doesn't exist, create new service
      server = await createService(serviceNameOrFn)
      serviceName = server.name
      logger.debug(`route "${path}" created new service "${serviceName}"`)
    }
  } else {
    // For strings, assume it's a service name and use it directly
    serviceName = serviceNameOrFn
    // logger.debug('createRoute - serviceName:', serviceName)
    logger.debug(`route "${path}" using service name "${serviceName}"`)
  }

  // Register the route with the registry
  await httpRequest(registryHost, {
    headers: buildRouteRegisterHeaders(serviceName, path, dataType)
  })

  logger.debug(`route "${path}" registered at ${registryHost}`)
  return server
}

export async function createRoutes (routeMap, dataType) {
  let routes = []
  for (let path in routeMap) {
    let serviceNameOrFn = routeMap[path]
    routes.push(await createRoute(path, serviceNameOrFn, dataType))
  }
  return routes
}
