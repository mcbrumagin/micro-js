const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')
const HttpError = require('./http-error.js')
const { Buffer } = require('node:buffer')


if (!process.env.SERVICE_REGISTRY_ENDPOINT) {
  throw new Error('Please define "SERVICE_REGISTRY_ENDPOINT" env variable')
}

const registryPort = process.env.SERVICE_REGISTRY_ENDPOINT.split(':')[2]
const defaultStartPort = registryPort && (Number(registryPort)+1) || 10000

let services
let addresses
let routes
let controllerRoutes
let domainPorts
let subscriptions = {}

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
      errors.push(err) // TODO test coverage
    }
  }
  return { results, errors }
}

async function subscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) subscriptions[type] = new Set()
  subscriptions[type].add(location)
}

// TODO test coverage
async function unsubscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) throw new HttpError(404, `No type "${type}"`)
  let success = subscriptions[type].delete(location)
  if (!success) throw new HttpError(404, `No location "${location}" for type "${type}"`)
  if (!subscriptions[type].size) delete subscriptions[type]
}

Set.prototype.map = function (fn) {
  let result = []
  this.forEach(item => result.push(fn(item)))
  return result
}

async function setup (payload) {
  let { service, domain } = payload
  console.log(`setup service "${service}" at domain "${domain}"`)

  if (!domainPorts[domain]) domainPorts[domain] = defaultStartPort
  let port = domainPorts[domain]++
  let location = `${domain}:${port}`

  // console.log('resistry-server.setup', location)
  return location
}

async function register (payload) {
  let { type = 'service' } = payload
  // console.log({ payload, type })

  if (type === 'service') {
    //console.log('REGISTER SERVICE', payload)
    let { service, location } = payload
    console.log(`service "${service}" registered for location "${location}"`)

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
  } else if (type === 'route') {
    let { service, path, dataType = 'text/html' } = payload
    // console.log({ path, service, dataType })
    if (path.includes('*')) {
      controllerRoutes[path.replace('*', '')] = { service, dataType }
      console.log(`route controller "${path}" registered for service "${service}"`)
    } else {
      routes[path] = { service, dataType }
      console.log(`route "${path}" registered for service "${service}"`)
    }
  } else {
    throw new HttpError(400, 'Invalid type') // TODO test coverage
  }
}

async function unregister (payload) {
  let { service, location } = payload
  console.log(`service "${service}" unregistered for location "${location}"`)

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
    throw new HttpError(404, `No service by name "${service}"`) // TODO test coverage
  }

  let addresses = services[service].map(s => s)
  let len = addresses.length
  let ind = Math.floor(Math.random() * len)
  return addresses[ind]
}

const roundRobin = {}
// TODO!!! bind local cache locations in order to skip initial httpRequest to registry
async function call ({ name, payload }) {
  let err
  if (!name) err = new HttpError(400, `Proxy call requires service "name" property`)
  // if (!payload) err = new HttpError(400, `Proxy call requires service "payload" property`)
  if (!payload) payload = {}
  if (!services[name]) err = new HttpError(404, `No service by name "${name}"`)
  if (err) {
    err.details = { name, payload }
    throw err
  }

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
  const initState = () => {
    services = {}
    addresses = {}
    routes = {}
    controllerRoutes = {}
    domainPorts = {}
  }

  initState()

  if (!port) { // TODO test coverage
    let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
    if (registryHost) {
      port = registryHost.split(':')[2]
      // console.log('registry-server.createServer', {port})
      if (!port || isNaN(port)) {
        throw new Error('Please specify "port" arg or define "SERVICE_REGISTRY_ENDPOINT" env variable including protocol and port number')
      }
    }
  }

  let server = await httpServer(port, async function registryServer(payload, request, response) {
    const findControllerRoute = url => {
      for (let basePath in controllerRoutes) {
        let reg = new RegExp(`^${basePath}`, 'i')
        if (reg.test(url)) {
          return controllerRoutes[basePath]
        }
      }
    }

    const resolvePossibleRoute = async () => {
      let { url } = request
      let { service, dataType } = routes[url] || {}
      if (service) {
        let result = await call({ name: service, payload: {}})
        response.writeHead(200, { 'content-type': dataType })
        response.end(result)
        return false // skip default response write/end // TODO cleaner/idiomatic way of doing this
      }

      let controllerTarget = findControllerRoute(url)
      if (controllerTarget) {
        let { service, dataType } = controllerTarget

        // TODO try/catch res(500) etc
        let result = await call({ name: service, payload: { url }})

        let { status, headers } = result
        // console.log({ headers })
        dataType = result.dataType || dataType
        headers = Object.assign({}, { 'content-type': dataType }, headers)
        // console.log({ headers })
        if (dataType) response.writeHead(status || 200, headers)
        // console.log({
        //   "typeof result === 'object'": typeof result === 'object',
        //   "result.payload": !!result.payload,
        //   "buff?": result.payload instanceof Buffer,
        //   wtf: true
        // })

        // TODO add isBuffer flag to return payload to make this conditional
        try {
          // NOTE seems to work but should maybe only be situational
          result.payload = result.payload ? Buffer.from(result.payload) : ''
          // console.log('PDF Debug:', {
          //   'result is Buffer': Buffer.isBuffer(result.payload),
          //   'result length': result.payload?.length,
          //   // 'first few bytes': result.payload.slice(0, 10),
          //   // 'PDF header check': result.payload?.slice(0, 4).toString() === '%PDF'
          // })
        } catch (err) {
          console.warn(err.stack)
          // throw err
        }

        // console.log({result})
        if (typeof result === 'object' && result.payload) response.end(result.payload)
        else response.end(result) // TODO test coverage
        return false // skip default response write/end
      }

      if (url) { // TODO test coverage
        if (!url.endsWith('/')) {
          url += '/'
          response.writeHead(301, { 'Location': url })
          response.end()
          return false // skip default response write/end
        } else {
          // console.log('DEFALT URL', routes)
          return Object.keys(routes).join('\n')
        }
      }
    }

    // TODO test coverage
    const printRegistryFunctions = () => {
      let message = registryServer.toString()
      try {
        // TODO print routemap as well
        // TODO why is this like this? for cli call?
        message = registryServer.toString()
          .match(/payload\.(.+?)\) return/ig)
          .join('\n')
          .replace(/payload\./ig,'')
          .replace(/\) return/ig, '')
      } catch (err) {
        console.warn('error parsing registry server fn')
      }
      return message
    }

    try {
      // console.log({ payload, url: request.url, '?': request.url !== '/' })
      if (payload.health) return { status: 'ready', timestamp: Date.now() }
      else if (payload.publish) return publish(payload.publish)
      else if (payload.subscribe) return subscribe(payload.subscribe)
      else if (payload.unsubscribe) return unsubscribe(payload.unsubscribe)
      else if (payload.setup) return setup(payload.setup)
      else if (payload.register) return register(payload.register)
      else if (payload.unregister) return unregister(payload.unregister)
      else if (payload.lookup) return lookup(payload.lookup)
      else if (payload.call) return call(payload.call)
      else if (request.url && request.url !== '/') return resolvePossibleRoute()
      else return printRegistryFunctions()
    } catch (err) {
      // TODO test coverage
      console.error(err.stack)
      response.writeHead(500)
      response.end(err.stack)
    }
  })
  
  let httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    console.log('registry terminating')
    initState()
    subscriptions = {}
    await httpServerTerminate()

    // TODO call registered services to ask them to unreg/rereg with new server?
  }

  server.isRegistry = true
  return server
}
