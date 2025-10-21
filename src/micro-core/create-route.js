
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import { buildRouteRegisterHeaders } from '../utils/micro-headers.js'

const logger = new Logger()

export default async function createRoute (path, serviceNameOrFn, dataType) {
  let serviceName
  if (!path || !serviceNameOrFn) throw new HttpError(400, 'Route path and service fn or name are required')
  let server
  if (typeof serviceNameOrFn === 'function') {
    server = await createService(serviceNameOrFn)
    serviceName = server.name
  } else serviceName = serviceNameOrFn

  let registryHost = process.env.MICRO_REGISTRY_URL
  
  // Use header-based command
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
