
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import { buildLookupHeaders, buildRouteRegisterHeaders } from '../utils/micro-headers.js'

const logger = new Logger()

const falseOnFailure = async fn => {
  try {
    return await fn()
  } catch (err) {
    return false
  }
}

export async function createRouteNew (path, serviceNameOrFn, dataType) {

  if (!path || !serviceNameOrFn) throw new HttpError(
    400, 'Route path and service fn or name are required'
  )

  // TOOD use config helper
  let registryHost = process.env.MICRO_REGISTRY_URL

  // check if service exists
  let location = await falseOnFailure(() => httpRequest(registryHost, {
    headers: buildLookupHeaders(serviceNameOrFn?.name || serviceNameOrFn)
  }))

  logger.debug('location:', location)
  
  // if service is already registered, skip create
  let server
  if (!location && typeof serviceNameOrFn === 'function') {
    server = await createService(serviceNameOrFn)
    serviceNameOrFn = server.name
  } else logger.debug(`route "${path}" already registered at "${location}"`)
  
  // add the route for lookup by the registry
  await httpRequest(registryHost, {
    headers: buildRouteRegisterHeaders(serviceNameOrFn?.name, path, dataType)
  })

  logger.debug(`route "${path}" added to registry at "${registryHost}"`)
  return server || location
}

export default async function createRoute (path, serviceNameOrFn, dataType) {
  let serviceName
  if (!path || !serviceNameOrFn) throw new HttpError(400, 'Route path and service fn or name are required')
  let server
  if (typeof serviceNameOrFn === 'function') {
    server = await createService(serviceNameOrFn)
    serviceName = server.name
    console.warn('createRoute: server.name', { serviceName })
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
