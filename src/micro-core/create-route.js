
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import envConfig from './env-config.js'
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
    const functionName = serviceNameOrFn.name // TODO VERIFY ANON
    
    const existingLocation = functionName && await falseOnFailure(async () => await httpRequest(registryHost, {
      headers: buildLookupHeaders(functionName)
    }))

    logger.debug('createRoute - existingLocation:', existingLocation)
    logger.debug('createRoute - functionName:', functionName)
    if (existingLocation) {
      serviceName = functionName
      logger.debug(`route "${path}" using existing service "${serviceName}" at "${existingLocation}"`)
    } else {
      server = await createService(serviceNameOrFn)
      serviceName = server.name
      logger.debug(`route "${path}" created new service "${serviceName}"`)
    }
  } else {
    serviceName = serviceNameOrFn
    logger.debug(`route "${path}" using service name "${serviceName}"`)
  }

  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  await httpRequest(registryHost, {
    headers: buildRouteRegisterHeaders(serviceName, path, dataType, 'route', registryToken)
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
