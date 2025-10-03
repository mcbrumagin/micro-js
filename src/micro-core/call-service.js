import httpRequest from '../http-primitives/http-request.js'

export default async function callService (name, payload) {
  let registryHost = process.env.MICRO_REGISTRY_URL
  // console.log('IN CALL SERVICE', {name, payload})
  let result = await httpRequest(registryHost, {
    call: { name, payload }
  })
  return result
}
