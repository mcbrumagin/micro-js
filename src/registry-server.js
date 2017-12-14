const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')

const subscriptions = {}

async function publish (payload) {
  let { type, message } = payload

  let results = []
  let errors = []

  if (!subscriptions[type]) return { results, errors }

  for (let location of subscriptions[type]) {
    try {
      let result = await httpRequest(location, message)
      results.push(result)
    } catch (err) {
      errors.push(err)
    }
  }
  return { results, errors }
}

async function subscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) subscriptions[type] = new Set()
  subscriptions[type].add(location)
}

async function unsubscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) throw new Error(`No type "${type}"`)
  let success = subscriptions[type].delete(location)
  if (!success) throw new Error(`No location "${location}" for type "${type}"`)
  if (!subscriptions[type].size) delete subscriptions[type]
}


const cache = {}

async function set (key, val) {
  cache[key] = val
}

async function get (key) {
  return cache[key]
}

Set.prototype.map = function (fn) {
  let result = []
  this.forEach(item => result.push(fn(item)))
  return result
}

const services = {}
const addresses = {}
const domainPorts = {}

const registryPort = process.env.SERVICE_REGISTRY_HOST.split(':')[1]
const defaultStartPort = 10000 || registryPort && (Number(registryPort)+1) || 10000

async function setup (payload) {
  let { service, domain } = payload
  console.log(`setup service "${service}" at domain "${domain}"`)

  if (!domainPorts[domain]) domainPorts[domain] = defaultStartPort
  let port = domainPorts[domain]++
  let location = `${domain}:${port}`

  return location
}

async function register (payload) {
  let { service, location } = payload
  console.log(`register service "${service}" at location "${location}"`)

  if (!services[service]) services[service] = new Set()
  addresses[location] = service
  services[service].add(location)

  // TODO subscribe to new service locations and addresses
  await publish({ type: 'register', message: payload })
  await subscribe({ type: 'register', location })

  let mappedServices = {}
  for (let service in services) {
    mappedServices[service] = services[service].map(s => s)
  }
  return { services: mappedServices, addresses }
}

async function unregister (payload) {
  let { service, location } = payload
  console.log(`unregister service "${service}" at location "${location}"`)

  delete addresses[location]
  services[service].delete(location)
  if (!services[service].size) delete services[service]
}

async function lookup (service) {
  console.log(`lookup service (${service}) addresses`)
  if (service === 'all') {
    let servicesMap = {}
    for (let service in services) {
      let addresses = services[service].map(s => s)
      servicesMap[service] = addresses
    }
    return servicesMap
  }
  else if (!services[service]) {
    throw new Error(`No service by name "${service}"`)
  }

  let addresses = services[service].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  return addresses[ind]
}

const roundRobin = {}
// TODO bind local cache locations in order to skip initial httpRequest to registry
async function call ({ name, payload }) {
  if (!name) throw new Error('Proxy call requires service "name" property')
  if (!payload) throw new Error('Proxy call requires service "payload" property')
  let registryHost = process.env.SERVICE_REGISTRY_HOST

  let addresses = services[name].map(s => s)
  let ind
  if (!roundRobin[name]) {
    ind = Math.floor(Math.random() * addresses.length)
  } else {
    ind = roundRobin[name] + 1
    if (ind >= addresses.length) ind = 0
  }
  roundRobin[name] = ind
  let location = addresses[ind]
  let result = await httpRequest(location, payload)
  return result
}

module.exports = async function createServer(port) {
  if (!port) {
    let registryHost = process.env.SERVICE_REGISTRY_HOST
    if (!registryHost) {
      throw new Error('Please specify "port" arg or define "SERVICE_REGISTRY_HOST" env variable')
    }
    port = registryHost.split(':')[1]
  }

  return httpServer(port, async function registryServer(payload) {
    if (payload.publish) return publish(payload.publish)
    else if (payload.subscribe) return subscribe(payload.subscribe)
    else if (payload.unsubscribe) return unsubscribe(payload.unsubscribe)
    else if (payload.get) return get(payload.get)
    else if (payload.set) return set(...payload.set)
    else if (payload.setup) return setup(payload.setup)
    else if (payload.register) return register(payload.register)
    else if (payload.unregister) return unregister(payload.unregister)
    else if (payload.lookup) return lookup(payload.lookup)
    else if (payload.call) return call(payload.call)
    else {
      let message = registryServer.toString()
      try {
        message = registryServer.toString()
          .match(/payload\.(.+?)\) return/ig)
          .join('\n')
          .replace(/payload\./ig,'')
          .replace(/\) return/ig, '')
      } catch (err) {}
      return message
    }
  })
}
