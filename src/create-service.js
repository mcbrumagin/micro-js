const os = require('os')
const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')

// TODO bind local cache locations in order to skip initial httpRequest to registry
async function callService (name, payload) {
  let registryHost = process.env.SERVICE_REGISTRY_HOST

  let addresses = cache.services[name].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  let location = addresses[ind]
  let result = await httpRequest(location, payload)
  return result
}

const cache = {}

module.exports = async function createService (name, fn) {
  if (!fn && name.name) {
    fn = name
    name = fn.name
  }

  let registryHost = process.env.SERVICE_REGISTRY_HOST
  // TODO
  // get current domain from environment variable?
  // service registry may be able to get domain from req/res objects?
  let location = await httpRequest(registryHost, {
    setup: {
      service: name,
      domain: os.hostname()
    }
  })

  let [domain, port] = location.split(':')
  let context = { call: callService }
  // TODO build context with full service method names
  fn = fn.bind(context)

  function handler(payload) {
    if (payload.service && payload.location) {
      let { service, location } = payload
      cache.addresses[location] = service
      if (!cache.services[service]) cache.services[service] = []
      cache.services[service].push(location)
    } else return fn(payload)
  }

  try {
    Object.defineProperty(handler, 'name', { value: name, writable: false })
    await httpServer(port, handler)
  } catch (err) {
    if (err.message.indexOf('listen EADDRINUSE') !== -1) {
      return createService(name, fn)
    } else throw err
  }

  let result = await httpRequest(registryHost, {
    register: {
      service: name,
      location
    }
  })

  cache.addresses = result.addresses
  cache.services = result.services

  console.log(`service "${name}" registered at ${registryHost}`)
}
