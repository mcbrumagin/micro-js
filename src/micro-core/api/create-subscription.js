/**
 * Create Subscription
 * Standalone subscription service for code that doesn't run within a service
 * Creates a lightweight HTTP server to receive channel messages
 */

import httpServer from '../../http-primitives/http-server.js'
import httpRequest from '../../http-primitives/http-request.js'
import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'
import { buildSubscribeHeaders, buildUnsubscribeHeaders } from '../../utils/micro-headers.js'
import crypto from 'crypto'

const logger = new Logger({ logGroup: 'micro-subscription' })

/**
 * Create a standalone subscription to a channel
 * Useful for external code, testing, or utilities that need to listen to events
 * 
 * @param {string} channel - Channel name to subscribe to
 * @param {Function} handler - Async function to handle messages
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Subscription object with terminate() method
 * 
 * @example
 * const subscription = await createSubscription('user.created', async (userData) => {
 *   console.log('New user:', userData)
 * })
 * 
 * // Later: await subscription.terminate()
 */
export default async function createSubscription(channel, handler, options = {}) {
  if (typeof handler !== 'function') {
    throw new Error('Subscription handler must be a function')
  }

  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  const serviceHome = registryHost.replace(/:\d+$/, '')
  
  // Generate unique name for this subscription service
  const subscriptionId = crypto.randomBytes(4).toString('hex')
  const serviceName = `subscription_${channel}_${subscriptionId}`

  logger.debug(`createSubscription - channel: ${channel}, id: ${subscriptionId}`)

  // Request port allocation from registry
  const setupHeaders = {
    'micro-command': 'service-setup',
    'micro-service-name': serviceName,
    'micro-service-home': serviceHome,
    ...(registryToken && { 'micro-registry-token': registryToken })
  }
  
  const location = await httpRequest(registryHost, {
    headers: setupHeaders
  })
  
  const port = location.split(':')[2]

  // Create HTTP server to receive channel messages
  const server = await httpServer(port, async function subscriptionHandler(message, request, response) {
    try {
      const result = await handler(message, request, response)
      return result || { status: 'processed' }
    } catch (err) {
      logger.debugErr(`Subscription handler error for channel "${channel}":`, err)
      throw err
    }
  })

  // Subscribe this location to the channel in registry
  await httpRequest(registryHost, {
    headers: buildSubscribeHeaders(channel, location, registryToken)
  })

  logger.info(`Subscription "${serviceName}" listening on ${location} for channel "${channel}"`)

  // Return subscription object with termination capability
  const subscription = {
    channel,
    location,
    serviceName,
    
    /**
     * Terminate the subscription and cleanup
     */
    async terminate() {
      logger.debug(`terminate - unsubscribing from channel: ${channel}`)
      
      try {
        // Unsubscribe from registry
        await httpRequest(registryHost, {
          headers: buildUnsubscribeHeaders(channel, location, registryToken)
        })
      } catch (err) {
        logger.debugErr(`Error unsubscribing from channel ${channel}:`, err)
      }
      
      // Stop HTTP server
      await server.terminate()
      logger.info(`Subscription "${serviceName}" terminated`)
    }
  }

  return subscription
}

