const HttpError = require('./http-error.js')
const { Buffer } = require('node:buffer')

async function request(address, body) {
  let headers = {}
  if (body) headers['content-type'] = 'application/json'

  let options = {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }
  
  let response = await fetch(address, options)

  // TODO check response.status & response.statusText
  let status = response.status
  let result = await response.text()
  
  // console.log({ status, result })

  if (status >= 400 && status < 600) {
    // TODO should cascading error messages be cleaned up here instead?
    throw new HttpError(status, result)
  }

  try {
    result = result ? await JSON.parse(result) : ''
  } catch (err) { /* don't care */ console.warn({result}, err.stack) }

  // console.log({
  //   options,
  //   status,
  //   // payload: result?.payload,
  //   type: typeof result.payload,
  //   isBuffer: Buffer.isBuffer(result?.payload),
  //   headers: result?.payload?.headers,
  //   dataType: result?.payload?.dataType
  // })

  return result
}

module.exports = request
