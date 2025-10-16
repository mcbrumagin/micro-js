/**
 * Next - Response Control Helper
 * 
 * Provides a type-safe way for services to signal that they have handled
 * the HTTP response directly and want to skip the default JSON response handling.
 * 
 * This is more explicit and safer than returning false or other magic values.
 */

/**
 * Next Class
 * 
 * Represents a signal that the service has handled the response directly.
 * Services return an instance of this class to indicate they've taken control
 * of the response object (e.g., for streaming, custom headers, chunked responses).
 * 
 * @example
 * async function streamingService(payload, request, response) {
 *   response.writeHead(200, {'content-type': 'audio/mpeg'})
 *   fs.createReadStream('file.mp3').pipe(response)
 *   return next() // Skip default JSON response
 * }
 */
export class Next {
  /**
   * Create a Next instance
   * 
   * @param {Object} metadata - Optional metadata for logging, debugging, or future extensions
   * @param {string} metadata.reason - Human-readable reason for direct response handling
   * @param {*} metadata.* - Any other metadata for extensions
   */
  constructor(metadata = {}) {
    this.metadata = metadata
    this.timestamp = Date.now()
    
    // Reserved for future promise-based resolution pattern
    this._deferred = null
  }
  
  /**
   * Future: Add promise-based resolution
   * This could enable middleware patterns or deferred response handling
   */
  // resolve(data) {
  //   if (this._deferred) {
  //     this._deferred.resolve(data)
  //   }
  // }
  //
  // reject(error) {
  //   if (this._deferred) {
  //     this._deferred.reject(error)
  //   }
  // }
}

/**
 * Helper function to create a Next instance
 * 
 * Services call this to signal they've handled the response directly.
 * The framework will skip the default JSON response handling.
 * 
 * @param {Object} metadata - Optional metadata
 * @returns {Next} Next instance
 * 
 * @example
 * // Basic usage
 * return next()
 * 
 * @example
 * // With metadata
 * return next({ reason: 'streaming', contentType: 'audio/mpeg' })
 * 
 * @example
 * // File streaming
 * async function audioService(payload, request, response) {
 *   const filePath = path.join(__dirname, payload.file)
 *   response.writeHead(200, { 'content-type': 'audio/mpeg' })
 *   fs.createReadStream(filePath).pipe(response)
 *   return next({ reason: 'streaming audio' })
 * }
 * 
 * @example
 * // Conditional response handling
 * async function hybridService(payload, request, response) {
 *   if (payload.raw) {
 *     response.writeHead(200, { 'content-type': 'text/plain' })
 *     response.end('Raw response')
 *     return next()
 *   }
 *   // Normal JSON response
 *   return { data: 'value' }
 * }
 */
export function next(metadata) {
  return new Next(metadata)
}

