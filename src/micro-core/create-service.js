import os from 'node:os'
import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'

import { callServiceWithCache } from './call-service.js'

const logger = new Logger()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const tryRegisterLimit = 3 // TODO configurable

// TODO create state-management helper for local service cache
const cache = {}

// TODO option for "isLocal"? avoids assigning/binding to a port
// allows for simpler progressive microservice refactors when loads/boundaires/domains are known
export default async function createService (name, serviceFn) {
  if (!(typeof name === 'string' && name&& typeof serviceFn === 'function')
   && !(typeof name === 'function' && typeof name.name === 'string' && name.name)) throw new Error(
    'Please provide a named function, or a service name and its function separately'
  )

  if (!serviceFn && name.name) {
    serviceFn = name
    name = serviceFn.name
  }

  let registryHost = process.env.MICRO_REGISTRY_URL
  if (!registryHost) throw new Error('Please define "MICRO_REGISTRY_URL" env variable')
  let serviceHome = registryHost // assume we are on the same host by default
  // validate registryHost

  let serviceHost = process.env.MICRO_SERVICE_URL // port is optional
  if (serviceHost) {
    // validate
    serviceHome = serviceHost
  } else {
    serviceHome = serviceHome
      // remove port; registry will assign one
      && (serviceHome.split(':').slice(0,2).join(':'))
      || os.hostname()
  }

  let location
  let port

  // TODO create generic retry-helper (we will want it for other http/service calls as well)
  let tryRegisterCount = 0
  do {
    tryRegisterCount++
    try {
      location = await httpRequest(registryHost, {
        setup: {
          service: name, 
          domain: serviceHome // TODO rename domain to home since it could be contain a protocol/port
        }
      })

      // TODO verify serviceHome/location/port
      // NOTE: if MICRO_SERVICE_URL has a hard-coded port, we should probably error?
      // if the user needs a specific port, it will be up to them to make sure it is unused before calling createService
      // we can give a helpful error to tell them how to fix this
      // (either by registering this service earlier, or by using a different port)
      port = location.split(':')[2]


      // TODO bind functions to context for local service calls
      // update context when cache is updated
      // maybe a "local" helper for now that skips the httpRequest to registry
      // TODO should be its own buildContext helper
      let context = { call: callServiceWithCache.bind(null, cache) }

      // TODO build context with full service method names
      serviceFn = serviceFn.bind(context)
    } catch (err) {
      // TODO create flag to mute this error warning
      logger.warn('createService setup http request error', err.stack)

      await sleep(20 * tryRegisterCount)
      if (tryRegisterCount > tryRegisterLimit) {
        let retryErr = new Error('Retry register exceeded attempts - '
          + `recent error message: ${err.message}`
        )

        throw retryErr
      }
    }
  } while (!location || !port) // TODO default port?
  

  function handler(payload) {
    // TODO refactor so that override functionality for service is bound from a separate function
    // TODO probably need a more definitive check for the cache update payload (maybe a custom from-registry header?)
    // NOTE: having a simple token returned by the setup call could harden these calls a bit
    // maybe the token is only sent for setup calls with an https protocol home, otherwise it is not needed and insecure
    if (payload.service && payload.location) {
      // for now, assume this is from the registry and the data is correct
      let { service, location } = payload
      cache.addresses[location] = service
      if (!cache.services[service]) cache.services[service] = []
      cache.services[service].push(location)
      // update context with any new functions registered since createService call
      // rerun buildContext -> { call: callServiceWithCache.bind(null, cache) }... etc
    } else return serviceFn(payload)
  }

  let server
  try {
    Object.defineProperty(handler, 'name', { value: name, writable: false })
    server = await httpServer(port, handler)
  } catch (err) {
    if (err.message.includes('listen EADDRINUSE')) {
      return createService(name, serviceFn)
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

  logger.trace(`service "${name}" registered at ${registryHost}`)
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

export function createServices (...fns) {
  // TODO assemble cache in advance for all services created here
  // they should all have the same home, except for the port
  return Promise.all(fns.map(fn => createService(fn)))
}
