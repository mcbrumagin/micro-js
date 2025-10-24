
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import envConfig from './env-config.js'
import { buildRouteRegisterHeaders, buildLookupHeaders } from '../utils/micro-headers.js'
import http from 'node:http'

const logger = new Logger({ logGroup: 'micro-core' })

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
    serviceName = server.name
  } else if (typeof serviceNameOrFn === 'function') {
    const functionName = serviceNameOrFn.name
    
    const existingLocation = functionName && await falseOnFailure(async () => await httpRequest(registryHost, {
      headers: buildLookupHeaders(functionName)
    }))

    if (existingLocation) {
      serviceName = functionName
      logger.debug('createRoute - using existing service:', serviceName)
    } else {
      server = await createService(serviceNameOrFn)
      serviceName = server.name
      logger.debug('createRoute - created new service:', serviceName)
    }
  } else {
    serviceName = serviceNameOrFn
  }

  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  await httpRequest(registryHost, {
    headers: buildRouteRegisterHeaders(serviceName, path, dataType, 'route', registryToken)
  })

  logger.info(`Route "${path}" → service "${serviceName}"`)
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
