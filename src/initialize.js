const httpRequest = require('./http-request.js')
const pubSubServer = require('./pub-sub-server.js')

module.exports = async function initialize () {
  let registryHost = process.env.SERVICE_REGISTRY_HOST
  let [, registryPort] = registryHost.split(':')
  await pubSubServer(registryPort)

  // TODO
}
