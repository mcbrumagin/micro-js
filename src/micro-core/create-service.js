import os from 'node:os'
import httpServer from '../http-primitives/http-server.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'

import { callServiceWithCache } from './call-service.js'

const logger = new Logger()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const tryRegisterLimit = 3

const cache = {}

// TODO!!! bind local cache locations in order to skip initial httpRequest to registry
// TODO move to call-service?


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
      let context = { call: callServiceWithCache.bind(null, cache) }

      // TODO build context with full service method names
      serviceFn = serviceFn.bind(context)
    } catch (err) {
      logger.warn('createService setup http request error', err.stack)

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
  return Promise.all(fns.map(fn => createService(fn)))
}
