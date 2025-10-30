import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import envConfig from './env-config.js'
import { buildCallHeaders } from '../utils/micro-headers.js'
import Logger from '../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-api' })

// TODO implement for returned errors? do we need this?
// function throwErrorFromResult(result) {
//   if (result.status >= 400 && result.status < 600) {
//     throw new HttpError(result.status, result.message || result.name || 'Unknown error')
//   }
//   throw result
// }

export default async function callService (name, payload, {
  contentType = 'application/json',
  authToken = null
} = {}) {
  let registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  
  logger.debug('callService - name:', name)
  
  let result = await httpRequest(registryHost, {
    body: payload,
    headers: { ...buildCallHeaders(name, authToken), 'content-type': contentType }
  })
  
  return result
}

export async function callServiceWithCache (cache, name, payload) {
  // name could be the function if called "locally", or a noop of the same name for code-completion
  name = name.name || name
  let registryHost = process.env.MICRO_REGISTRY_URL

  if (!cache.services[name]) throw new HttpError(404, `No service by name "${name}" in cache`)
  let addresses = cache.services[name].map(s => s)
  let len = addresses.length

  // TODO implement strategies (random, round-robin, etc.)
  // initialize service round-robin start index based on own location port number
  let ind = Math.floor(Math.random() * len)
  let location = addresses[ind]
  let result = await httpRequest(location, { body: payload })
  return result
}
