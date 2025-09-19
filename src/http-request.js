const HttpError = require('./http-error.js')

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
  
  if (status >= 400 && status < 600) {
    // console.log({httpres: result, split: result.split('\n')})
    // let [newResult, ...stack] = result.split('\n')
    // console.log({newResult, stack})
    // throw new HttpError(status, newResult, '\n' + stack.join('\n'))
    throw new HttpError(status, result)
  }

  try {
    result = await JSON.parse(result)
  } catch (err) { /* don't care */ }

  return result
}

module.exports = request
