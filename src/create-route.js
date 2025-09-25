
import httpRequest from './http-request.js'
import createService from './create-service.js'
import HttpError from './http-error.js'
import Logger from './logger.js'

const logger = new Logger()

export default async function createRoute (path, serviceNameOrFn, dataType) {
  let serviceName
  if (!path || !serviceNameOrFn) throw new HttpError(400, 'Route path and service fn or name are required')
  if (serviceNameOrFn.name) {
    await createService(serviceNameOrFn)
    serviceName = serviceNameOrFn.name
  } else serviceName = serviceNameOrFn

  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  // console.log({ registryHost, path, service, dataType })
  await httpRequest(registryHost, {
    register: { type: 'route', service: serviceName, path, dataType }
  })

  logger.trace(`route "${path}" registered at ${registryHost}`)
}