const os = require('os')
const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')
const HttpError = require('./http-error.js')

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const tryRegisterLimit = 3

const cache = {}

// TODO!!! bind local cache locations in order to skip initial httpRequest to registry
// TODO move to call-service?
async function callService (name, payload) {
  // name could be the function if called "locally", or a noop of the same name for code-completion
  name = name.name || name
  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT

  if (!cache.services[name]) throw new HttpError(404, `No service by name "${name}" in cache`)
  let addresses = cache.services[name].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  let location = addresses[ind]
  let result = await httpRequest(location, payload)
  return result
}

module.exports = async function createService (name, fn) {
  if (!(typeof name === 'string' && name&& typeof fn === 'function')
   && !(typeof name === 'function' && typeof name.name === 'string' && name.name)) throw new Error(
    'Please provide a named function, or a service name and its function separately'
  )

  if (!fn && name.name) {
    fn = name
    name = fn.name
  }

  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  if (!registryHost) throw new Error('Please define "SERVICE_REGISTRY_ENDPOINT" env variable')

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

      port = location.split(':')[2]
      let context = { call: callService }

      // TODO build context with full service method names
      fn = fn.bind(context)
    } catch (err) {
      console.warn('createService setup http request error', err.stack)

      await sleep(20 * tryRegisterCount)
      if (tryRegisterCount > tryRegisterLimit) {
        let retryErr = new Error('Retry register exceeded attempts - '
          + `recent error message: ${err.message}`
        )

        throw retryErr
      }
    }
  } while (!port)
  

  function handler(payload) {
    // TODO probably need a more definitive check for the cache update
    if (payload.service && payload.location) {
      // for now, assume this is from the registry and the data is correct
      let { service, location } = payload
      cache.addresses[location] = service
      if (!cache.services[service]) cache.services[service] = []
      cache.services[service].push(location)
    } else return fn(payload)
    // } else { // TODO cleanup
    //   let result = fn(payload)
    //   console.log({name, payload, result})
    //   return result
    // }
  }

  let server
  try {
    Object.defineProperty(handler, 'name', { value: name, writable: false })
    // console.log({name, handler})
    server = await httpServer(port, handler)
  } catch (err) {
    if (err.message.includes('listen EADDRINUSE')) {
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
  server.service = name
  server.location = location

  let httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    if (cache.services) delete cache.services[name]
    if (cache.addresses) delete cache.addresses[location]

    // Remove from registry gracefully
    await httpRequest(registryHost, {
      unregister: { service: name, location }
    })
    await httpServerTerminate()
  }
  return server
}
