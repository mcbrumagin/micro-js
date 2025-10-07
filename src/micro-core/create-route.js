
import httpRequest from '../http-primitives/http-request.js'
import createService from './create-service.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'

const logger = new Logger()

export default async function createRoute (path, serviceNameOrFn, dataType) {
  console.log({ path, serviceNameOrFn, dataType })
  let serviceName
  if (!path || !serviceNameOrFn) throw new HttpError(400, 'Route path and service fn or name are required')
  let server
  if (serviceNameOrFn.name) {
    server = await createService(serviceNameOrFn)
    serviceName = serviceNameOrFn.name
  } else serviceName = serviceNameOrFn

  let registryHost = process.env.MICRO_REGISTRY_URL
  await httpRequest(registryHost, {
    register: { type: 'route', service: serviceName, path, dataType }
  })

  logger.trace(`route "${path}" registered at ${registryHost}`)
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
