const os = require('os')
const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const tryRegisterLimit = 3

// TODO bind local cache locations in order to skip initial httpRequest to registry
// TODO move to call-service?
async function callService (name, payload) {
  // name could be the function if called "locally", or a noop of the same name for code-completion
  name = name.name || name
  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT

  let addresses = cache.services[name].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  let location = addresses[ind]
  let result = await httpRequest(location, payload)
  return result
}

let cache = {} // TODO need to invalidate services that are terminated

module.exports = async function createService (name, fn) {
  if (!fn && name.name) {
    fn = name
    name = fn.name
  }

  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  // TODO
  // get current domain from environment variable?
  // service registry may be able to get domain from req/res objects?
  // console.log({
  //   registryHost,
  //   allbutport: registryHost.split(':').slice(0,2).join(':')
  // })

  let tryRegisterCount = 0
  let location
  let port
  do {
    tryRegisterCount++
    try {
      location = await httpRequest(registryHost, {
        setup: {
          service: name,
          domain: registryHost
          && (
            registryHost.split(':').slice(0,2).join(':')
          ) || os.hostname()
        }
      })

      // console.log({location})

      port = location.split(':')[2]
      // console.log({protocol, domain, port})
      let context = { call: callService }
      // IMPORTANT TODO build context with full service method names
      fn = fn.bind(context)
    } catch (err) {
      
      await sleep(20 * tryRegisterCount)
      // if (err instanceof TypeError) {
      // }
      if (tryRegisterCount > tryRegisterLimit) throw new Error('Retry register exceeded attempts')
    }
  } while (tryRegisterCount < tryRegisterLimit)

  

  function handler(payload) {
    console.log(`IN SERVICE ${name} HTTP HANDLER`, payload)
    // TODO probably need a more definitive check for the cache update
    if (payload.service && payload.location) {
      // for now, assume this is from the registry and the data is correct
      let { service, location } = payload
      cache.addresses[location] = service
      if (!cache.services[service]) cache.services[service] = []
      cache.services[service].push(location)
    } else return fn(payload)
  }

  let server
  try {
    Object.defineProperty(handler, 'name', { value: name, writable: false })
    server = await httpServer(port, handler)
  } catch (err) {
    if (err.message.indexOf('listen EADDRINUSE') !== -1) {
      return createService(name, fn)
    } else throw err
  }

  console.log(server.address())
  // process.exit(0)
  console.log('SERVER STARTED... REGISTERING', { address: server.address(), name, location, registryHost })
  let result = await httpRequest(registryHost, {
    register: {
      service: name,
      location
    }
  })

  cache.addresses = result.addresses
  cache.services = result.services

  console.log(`service "${name}" registered at ${registryHost}`)
  server.service = name
  server.location = location

  let httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    console.log('CLEANING CACHE BEFORE TERMINATE', {name, services: cache.services, location, addresses: cache.addresses})
    
    if (cache.services) delete cache.services[name]
    if (cache.addresses) delete cache.addresses[location]
    // cache = {}

    // Remove from registry gracefully
    await httpRequest(registryHost, {
      unregister: { service: name, location }
    })
    console.log('UNREGISTERED BEFORE TERMINATING SERVICE', {name, location, cache})

    await httpServerTerminate()
  }
  return server
}
