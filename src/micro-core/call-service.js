import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import envConfig from './env-config.js'

export default async function callService (name, payload) {
  let registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  let result = await httpRequest(registryHost, {
    call: { name, payload }
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
  let result = await httpRequest(location, payload)
  return result
}
