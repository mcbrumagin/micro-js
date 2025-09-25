import httpRequest from './http-request.js'

export default async function callService (name, payload) {
  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  // console.log('IN CALL SERVICE', {name, payload})
  let result = await httpRequest(registryHost, {
    call: { name, payload }
  })
  return result
}
