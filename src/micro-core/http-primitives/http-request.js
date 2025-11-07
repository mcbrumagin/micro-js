import HttpError from './http-error.js'
import { Buffer } from 'node:buffer'
import Logger from '../../utils/logger.js'
import fs from 'node:fs'

const logger = new Logger({ logGroup: 'http-primitives' })

async function request(address, {
  method = 'POST',
  body = null,
  headers = {},
  stream = false, // If true, return raw Response for streaming
  timeout = 30000 // TODO override
} = {}) {

  // Handle different body types
  if (Buffer.isBuffer(body)) {

    // Binary data - send as-is with appropriate content-type
    if (!headers['content-type']) {
      headers['content-type'] = 'application/octet-stream'
    }

  } else if (body !== null && body !== undefined && typeof body === 'object') {

    // JSON objects/arrays - stringify
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json'
    }
    body = JSON.stringify(body)

  } else if (body === null || body === undefined || typeof body === 'number' || typeof body === 'boolean') {

    // Primitives (null, undefined, numbers, booleans) - send as JSON to preserve type
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json'
    }
    body = JSON.stringify(body)

  } else if (typeof body === 'string') {

    // Strings - send as JSON if empty (to preserve empty string), otherwise as text
    if (body === '') {

      if (!headers['content-type']) {
        headers['content-type'] = 'application/json'
      }
      body = JSON.stringify(body) // "" becomes '""'

    } else {

      if (!headers['content-type']) {
        headers['content-type'] = 'text/plain'
      }
      // Non-empty strings send as-is
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  let options = { method, headers, body, signal: controller.signal }
  
  try {
    let response = await fetch(address, options)
    
    if (stream) return response // this allows caller to pipe the response stream
    else return await processResponse(response)
  } catch (error) {
    // TODO test
    if (error.name === 'AbortError') {
      throw new HttpError(408, 'Request timeout')
    }
    if (!request ||!request.headers['mute-internal-error']) {
      logger.debugErr(`Fetch failed at "${address}" - Error: ${error.message}`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

async function processResponse(response) {
  let status = response.status
  const contentType = response.headers.get('content-type') || ''

  if (status >= 400 && status < 600) {
    const errorText = await response.text()
    logger.debug('processResponse - error status:', status)
    throw new HttpError(status, errorText)
  }

  // Handle binary responses (return as Buffer)
  if (contentType.includes('octet-stream') || contentType.includes('audio/') || contentType.includes('video/') || contentType.includes('image/')) {
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  // Get response as text
  let result = await response.text()
  
  // Handle JSON responses (parse and return as object)
  if (contentType.includes('application/json')) {
    try {
      result = result ? JSON.parse(result) : ''
    } catch (err) {
      logger.debugErr('Failed to parse JSON response:', err)
    }
  }
  
  // Otherwise return as text (string)
  return result
}

export default request
