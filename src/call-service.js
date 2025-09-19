const httpRequest = require('./http-request.js')

module.exports = async function callService (name, payload) {
  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  // console.log('IN CALL SERVICE', {name, payload})
  let result = await httpRequest(registryHost, {
    call: { name, payload }
  })
  return result
}
