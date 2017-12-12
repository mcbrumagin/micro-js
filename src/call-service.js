const httpRequest = require('./http-request.js')

module.exports = async function callService (name, payload) {
  let registryHost = process.env.SERVICE_REGISTRY_HOST
  let location = await httpRequest(registryHost, { lookup: name })
  let result = await httpRequest(location, payload)
  return result
}
