
const httpRequest = require('./http-request.js')
const createService = require('./create-service.js')
const HttpError = require('./http-error.js')

module.exports = async function createRoute (path, service, dataType) {
  if (!path || !service) throw new HttpError(400, 'Route path and service name are required')
  if (service.name) {
    await createService(service)
    service = service.name
  }

  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  await httpRequest(registryHost, {
    register: { type: 'route', service, path, dataType }
  })

  console.log(`route "${path}" registered at ${registryHost}`)
}