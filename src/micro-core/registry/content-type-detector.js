/**
 * Content-Type Detection
 * Detects and guesses content types from payloads and URLs
 */

import { Buffer } from 'node:buffer'
import { suggestTypeFromUrl } from '../../http-primitives/http-helpers.js'
import Logger from '../../utils/logger.js'
const logger = new Logger({ logGroup: 'micro-registry' })

/**
 * Check if a string is valid JSON
 */
export function isJsonString(payload) {
  try {
    JSON.parse(payload)
    return true
  } catch (err) {
    return false
  }
}

/**
 * Detect content type from Buffer objects
 */
export function detectFromBuffer(payload) {
  if (Buffer.isBuffer(payload)) {
    return 'application/octet-stream'
  }
  return null
}

/**
 * Detect content type from payload and optional URL context
 */
export function detectContentType(payload, url = '') {

  // just use our url-based suggestion if we have one
  let dataType = suggestTypeFromUrl(url)
  if (dataType) return dataType
  
  if (typeof payload === 'string') {
    if (isJsonString(payload)) {
      logger.debug('detectContentType: payload is a JSON string - returning application/json')
      return 'application/json'
    }
    
    if (payload.search(/<[^>]*>/) !== -1) {
      if (url.includes('.xml')) {
        return 'application/xml'
      }
      return 'text/html'
    }
    
    return 'text/plain'
  }
  
  if (typeof payload === 'object') {
    const bufferType = detectFromBuffer(payload)
    if (bufferType) return bufferType
    
    // Plain JavaScript objects/arrays should be JSON
    if (payload !== null) {
      logger.debug('detectContentType: payload is an object - returning application/json')
      return 'application/json'
    }
  }
  
  return dataType || 'text/plain'
}
