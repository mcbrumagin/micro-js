/**
 * Retry Helper
 * Generic retry utility for async operations with configurable strategies
 */

import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-utils' })

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxAttempts: 3,
  initialDelay: 20,
  delayMultiplier: 1, // Linear backoff by default
  maxDelay: 5000,
  muteWarnings: false,
  onRetry: null // Optional callback(error, attemptNumber)
}

/**
 * Sleep utility
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Calculate delay for next retry attempt
 */
function calculateDelay(config, attemptNumber) {
  const delay = config.initialDelay * attemptNumber * config.delayMultiplier
  return Math.min(delay, config.maxDelay)
}

/**
 * Execute an async function with retry logic
 * 
 * @param {Function} fn - Async function to execute
 * @param {Object} config - Retry configuration
 * @returns {Promise} - Result of successful execution
 * @throws {Error} - Last error if all retries fail
 * 
 * @example
 * const result = await retry(async () => {
 *   return await httpRequest(url, payload)
 * }, { maxAttempts: 5, initialDelay: 100 })
 */
export async function retry(fn, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config }
  let lastError
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt < options.maxAttempts) {
        if (!options.muteWarnings) {
          logger.warn(
            `Retry attempt ${attempt}/${options.maxAttempts} failed: ${error.message}`
          )
        }
        
        // Call optional retry callback
        if (options.onRetry) {
          options.onRetry(error, attempt)
        }
        
        const delay = calculateDelay(options, attempt)
        await sleep(delay)
      }
    }
  }
  
  // All retries exhausted
  throw new Error(
    `Retry exceeded ${options.maxAttempts} attempts - last error: ${lastError.message}`
  )
}

/**
 * Execute with retry until a condition is met
 * Useful for polling scenarios
 * 
 * @param {Function} fn - Async function that returns a result
 * @param {Function} condition - Function that tests if result is acceptable
 * @param {Object} config - Retry configuration
 * @returns {Promise} - Result that satisfies condition
 * 
 * @example
 * const result = await retryUntil(
 *   async () => await checkStatus(),
 *   result => result.ready === true,
 *   { maxAttempts: 10 }
 * )
 */
export async function retryUntil(fn, condition, config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config }
  let lastResult
  let lastError
  
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      lastResult = await fn()
      
      if (condition(lastResult)) {
        return lastResult
      }
      
      if (attempt < options.maxAttempts) {
        const delay = calculateDelay(options, attempt)
        await sleep(delay)
      }
    } catch (error) {
      lastError = error
      
      if (!options.muteWarnings) {
        logger.warn(
          `Retry attempt ${attempt}/${options.maxAttempts} failed: ${error.message}`
        )
      }
      
      if (attempt < options.maxAttempts) {
        const delay = calculateDelay(options, attempt)
        await sleep(delay)
      }
    }
  }
  
  if (lastError) {
    throw new Error(
      `Retry exceeded ${options.maxAttempts} attempts - last error: ${lastError.message}`
    )
  } else {
    throw new Error(
      `Retry exceeded ${options.maxAttempts} attempts - condition not met`
    )
  }
}

export default retry

