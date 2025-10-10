import HttpError from './http-error.js'
import { Buffer } from 'node:buffer'
import Logger from '../utils/logger.js'

const logger = new Logger()

async function request(address, body) {
  let headers = {}
  if (body) headers['content-type'] = 'application/json'

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // TODO override

  let options = {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: controller.signal
  }
  
  try {
    let response = await fetch(address, options)
    return await processResponse(response)
  } catch (error) {
    // TODO test
    if (error.name === 'AbortError') {
      throw new HttpError(408, 'Request timeout')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function processResponse(response) {

  let status = response.status
  let result = await response.text()

  if (status >= 400 && status < 600) {
    throw new HttpError(status, result)
  }

  try {
    result = result ? JSON.parse(result) : ''
  } catch (err) {
    logger.warn('Failed to parse JSON response', {result, error: err.message})
  }

  return result
}

export default request
