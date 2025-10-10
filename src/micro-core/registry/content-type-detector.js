/**
 * Content-Type Detection
 * Detects and guesses content types from payloads and URLs
 */

import { Buffer } from 'node:buffer'
import { suggestTypeFromUrl } from '../../http-primitives/http-helpers.js'

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
  // Start with URL-based suggestion
  let dataType = suggestTypeFromUrl(url)
  
  // String payloads
  if (typeof payload === 'string') {
    if (isJsonString(payload)) {
      return 'application/json'
    }
    
    // Check for HTML/XML tags
    if (payload.search(/<[^>]*>/) !== -1) {
      if (url.includes('.xml')) {
        return 'application/xml'
      }
      return 'text/html'
    }
    
    return 'text/plain'
  }
  
  // Object/Buffer payloads
  if (typeof payload === 'object') {
    const bufferType = detectFromBuffer(payload)
    if (bufferType) return bufferType
  }
  
  return dataType || 'text/html'
}

