import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import { suggestTypeFromUrl } from '../http-primitives/http-helpers.js'

import { Buffer } from 'node:buffer'
import Logger from '../utils/logger.js'
import envConfig from './env-config.js'

const logger = new Logger()

const registryEndpoint = envConfig.getRequired('MICRO_REGISTRY_URL')
const registryPort = registryEndpoint.split(':')[2]
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
  logger.trace(`setup service "${service}" at domain "${domain}"`)

  if (!domainPorts[domain]) domainPorts[domain] = defaultStartPort
  let port = domainPorts[domain]++
  let location = `${domain}:${port}`

  return location
}

async function register (payload) {
  let { type = 'service' } = payload

  if (type === 'service') {
    let { service, location } = payload
    logger.trace(`service "${service}" registered for location "${location}"`)

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
    let { service, path, dataType = 'dynamic' } = payload
    if (path.includes('*')) {
      controllerRoutes[path.replace('*', '')] = { service, dataType }
      logger.trace(`route controller "${path}" registered for service "${service}"`)
    } else {
      routes[path] = { service, dataType }
      logger.trace(`route "${path}" registered for service "${service}"`)
    }
  } else {
    throw new HttpError(400, 'Invalid type') // TODO test coverage
  }
}

async function unregister (payload) {
  let { service, location } = payload

  delete addresses[location]
  if (services[service])services[service].delete(location)
  else throw new HttpError(404, `No service by name "${service}"`)

  // Clean up subscription to 'register' type
  if (subscriptions['register']) {
    subscriptions['register'].delete(location)
    if (!subscriptions['register'].size) delete subscriptions['register']
  }

  logger.trace(`service "${service}" unregistered for location "${location}"`)
  if (!services[service].size) delete services[service]
}

async function lookup (service) {
  logger.trace(`lookup service (${service}) addresses`)
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

function isJsonString(payload) {
  try {
    JSON.parse(payload)
    return true
  } catch (err) {
    return false
  }
}

function guessObjectDataType(payload) {
  if (Buffer.isBuffer(payload)) {
    return 'application/octet-stream'
  }
}

function guessDataType(payload, optionalUrl = '') {
  let dataType = suggestTypeFromUrl(optionalUrl)
  if (isJsonString(payload)) {
    dataType = 'application/json'
  } else if (typeof payload === 'string' && payload.search(/<[^>]*>/) !== -1) {
    if (optionalUrl.includes('.xml')) {
      dataType = 'application/xml'
    } else {
      dataType = 'text/html'
    }
  } else if (typeof payload === 'string') {
    dataType = 'text/plain'
  } else if (typeof payload === 'object') {
    let guess = guessObjectDataType(payload)
    if (guess) dataType = guess
  }
  return dataType || 'text/html'
}

export default async function createServer(port) {
  const initState = () => {
    services = {}
    addresses = {}
    routes = {}
    controllerRoutes = {}
    domainPorts = {}
  }

  initState()

  if (!port) { // TODO test coverage
    let registryHost = process.env.MICRO_REGISTRY_URL
    if (registryHost) {
      port = registryHost.split(':')[2]
      // logger.log('registry-server.createServer', {port})
      if (!port || isNaN(port)) {
        throw new Error('Please specify "port" arg or define "MICRO_REGISTRY_URL" env variable including protocol and port number')
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
      let localCall = call.bind(call) // TODO this is a bit sketchy... but it works!

      if (dataType === 'dynamic') {
        let originalCall = localCall
        localCall = async ({ name, payload }) => {
          let result = await originalCall({ name, payload })
          try {
            if (result &&!result.dataType) {
              if (result.payload) {
                result.dataType = guessDataType(result.payload, url)
              } else {
                result = { payload: result, dataType: guessDataType(result, url) }
              }
            } else {
              let guess = guessDataType(result.payload, url)
              if (guess !== result.dataType) {
                logger.warn(`dataType mismatch for ${url}: ${result.dataType} !== ${guess}`)
              }
            }
          } catch (err) {
            logger.warn(err.stack)
          } finally {
            localCall = originalCall
            return result
          }
        }
      }

      const endAndCheckBuffer = (result) => {
        if (result && result.payload) {
          try {
            result.payload = result.payload ? Buffer.from(result.payload) : ''
          } catch (err) {
            logger.warn(err.stack)
          }
        }
        response.end(result && result.payload || result)
      }

      if (service) {
        let result = await localCall({ name: service, payload: {}})
        response.writeHead(200, { 'content-type': result && result.dataType || dataType })
        endAndCheckBuffer(result)
      } else {
        let controllerTarget = findControllerRoute(url)
        if (controllerTarget) {
          let { service, dataType } = controllerTarget
          let result = await localCall({ name: service, payload: { url }})
          response.writeHead(200, { 'content-type': result && result.dataType || dataType })
          endAndCheckBuffer(result)
        } else if (url) {
          if (!url.endsWith('/')) {
            url += '/'
            response.writeHead(301, { 'Location': url })
            response.end()
          }
        }
      }

      if (response.isEnded) {
        return false // skip default response write/end
      } else return { payload: routes, dataType: 'application/json' }
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
        logger.warn('error parsing registry server fn')
      }
      return message
    }

    try {
      if (payload.health) return { status: 'ready', timestamp: Date.now() }
      else if (payload.publish) return publish(payload.publish)
      else if (payload.subscribe) return subscribe(payload.subscribe)
      else if (payload.unsubscribe) return unsubscribe(payload.unsubscribe)
      else if (payload.setup) return setup(payload.setup)
      else if (payload.register) return register(payload.register)
      else if (payload.unregister) return unregister(payload.unregister)
      else if (payload.lookup) return lookup(payload.lookup)
      else if (payload.call) return call(payload.call)
      else if (request.url) return resolvePossibleRoute()
      else return printRegistryFunctions()
    } catch (err) {
      // TODO test coverage
      logger.error(err.stack)
      response.writeHead(500)
      response.end(err.stack)
    }
  })
  
  let httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.trace('registry terminating')
    initState()
    subscriptions = {}
    await httpServerTerminate()

    // TODO call registered services to ask them to unreg/rereg with new server?
  }

  server.isRegistry = true
  return server
}
