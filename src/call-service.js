const httpRequest = require('./http-request.js')

module.exports = async function callService (name, payload) {
  let registryHost = process.env.SERVICE_REGISTRY_ENDPOINT
  try {
    console.log('IN CALL SERVICE', {name, payload})
    let result = await httpRequest(registryHost, {
      call: { name, payload }
    })
    return result
  } catch (err) {
    console.log({err}) // TODO better err handling here?
    let error = new Error(err.stack.replace('Error: ', ''))
    throw error
  }
}
