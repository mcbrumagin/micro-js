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

  if (!domainPorts[domain]) domainPorts[domain] = defaultStartPort
  let port = domainPorts[domain]++
  let location = `${domain}:${port}`

  return location
}

async function register (payload) {
  let { service, location } = payload

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

  delete addresses[location]
  services[service].delete(location)
  if (!services[service].size) delete services[service]
}

async function lookup (service) {
  // console.log(`lookup service "${service}"`)
  if (!services[service]) {
    throw new Error(`No service by name "${service}"`)
  }
  let addresses = services[service].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  return addresses[ind]
}

module.exports = async function createServer(port) {
  if (!port) {
    let registryHost = process.env.SERVICE_REGISTRY_HOST
    if (!registryHost) {
      throw new Error('Please specify "port" arg or define "SERVICE_REGISTRY_HOST" env variable')
    }
    port = registryHost.split(':')[1]
  }

  return httpServer(port, async function pubSub(payload) {
    if (payload.publish) return publish(payload.publish)
    else if (payload.subscribe) return subscribe(payload.subscribe)
    else if (payload.unsubscribe) return unsubscribe(payload.unsubscribe)
    else if (payload.get) return get(payload.get)
    else if (payload.set) return set(...payload.set)
    else if (payload.setup) return setup(payload.setup)
    else if (payload.register) return register(payload.register)
    else if (payload.unregister) return unregister(payload.unregister)
    else if (payload.lookup) return lookup(payload.lookup)
    else throw new Error('Missing "publish", "subscribe", "unsubscribe", "get", "set", "register", "unregister"')
  })
}
