import HttpError from './http-error.js'
import { Buffer } from 'node:buffer'
import Logger from '../utils/logger.js'
import fs from 'node:fs'

const logger = new Logger()

async function request(address, body, {
  method = 'POST',
  headers = {}
} = {}) {
  let isStream = body instanceof fs.ReadStream

  if (!isStream && typeof body === 'object' && !headers['content-type']) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(body)
  } else if (isStream && !headers['content-type']) {
    headers['content-type'] = 'application/octet-stream'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000) // TODO override
  let options = { method, headers, body, signal: controller.signal }
  
  try {
    let response = await fetch(address, options)
    return isStream ? response : await processResponse(response)
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
    logger.warn(`Failed to parse JSON response ${err.message}`)
    // logger.debug(`Failed to parse JSON response: ${result}`)
  }

  return result
}

export default request
