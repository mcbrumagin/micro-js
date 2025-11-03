/**
 * Subscription Manager
 * Handles pubsub subscriptions within a service context
 * Uses the service's existing HTTP server with header-based routing (like cache updates)
 */

import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'
import { buildSubscribeHeaders, buildUnsubscribeHeaders, buildPublishHeaders } from '../shared/micro-headers.js'

const logger = new Logger({ logGroup: 'micro-subscription' })

/**
 * Create subscription manager for a service
 * Manages channel subscriptions using the service's existing HTTP server
 * 
 * @param {string} serviceName - Name of the parent service
 * @param {string} serviceLocation - HTTP location of the parent service
 */
export function createSubscriptionManager(serviceName, serviceLocation) {
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  // Track subscriptions: channel -> Map<subId, handler>
  const channelHandlers = new Map()
  let subscriptionCounter = 0

  /**
   * Subscribe to a channel with a callback handler
   * Registers the service's location with the registry for this channel
   * 
   * @param {string} channel - Channel name to subscribe to
   * @param {Function} handler - Async function to handle messages
   * @returns {Promise<string>} Subscription ID for unsubscribe
   */
  async function subscribe(channel, handler) {
    if (typeof handler !== 'function') {
      throw new HttpError(400, 'Subscribe handler must be a function')
    }

    const subId = `sub_${channel}_${++subscriptionCounter}_${Date.now()}`
    logger.debug(`subscribe [${serviceName}] - channel: ${channel}, id: ${subId}`)

    // Register this channel with local handlers if first subscription
    if (!channelHandlers.has(channel)) {
      channelHandlers.set(channel, new Map())
      
      // Register service location with registry for this channel
      await httpRequest(registryHost, {
        headers: buildSubscribeHeaders(channel, serviceLocation, registryToken)
      })
      
      logger.debug(`subscribe [${serviceName}] - registered location ${serviceLocation} for channel: ${channel}`)
    }

    // Add callback to channel's handler map
    channelHandlers.get(channel).set(subId, handler)
    logger.debug(`subscribe [${serviceName}] - total subscribers for ${channel}: ${channelHandlers.get(channel).size}`)
    
    return subId
  }

  /**
   * Unsubscribe from a channel using subscription ID
   * Unregisters from registry if no more subscribers
   * 
   * @param {string} channel - Channel name
   * @param {string} subId - Subscription ID from subscribe()
   * @returns {Promise<boolean>}
   */
  async function unsubscribe(channel, subId) {
    logger.debug(`unsubscribe [${serviceName}] - channel: ${channel}, id: ${subId}`)

    if (!channelHandlers.has(channel)) {
      throw new HttpError(404, `No subscriptions found for channel "${channel}"`)
    }

    const callbacks = channelHandlers.get(channel)
    const deleted = callbacks.delete(subId)
    if (!deleted) {
      throw new HttpError(404, `Subscription "${subId}" not found for channel "${channel}"`)
    }

    logger.debug(`unsubscribe [${serviceName}] - remaining: ${callbacks.size}`)

    // Unregister from registry if no more subscribers for this channel
    if (callbacks.size === 0) {
      await httpRequest(registryHost, {
        headers: buildUnsubscribeHeaders(channel, serviceLocation, registryToken)
      })

      channelHandlers.delete(channel)
      logger.debug(`unsubscribe [${serviceName}] - unregistered from channel: ${channel}`)
    }

    return true
  }

  /**
   * Publish a message to a channel
   * 
   * @param {string} channel - Channel name
   * @param {any} message - Message payload
   * @returns {Promise<{results: Array, errors: Array}>}
   */
  async function publish(channel, message) {
    logger.debug(`publish [${serviceName}] - channel: ${channel}`)
    
    const result = await httpRequest(registryHost, {
      body: message,
      headers: buildPublishHeaders(channel, registryToken)
    })
    
    return result
  }

  /**
   * Handle incoming subscription message
   * Called by cache-handler when a subscription message is detected
   * 
   * @param {string} channel - Channel name from headers
   * @param {any} message - Message payload
   * @returns {Promise<{results: Array, errors: Array}>}
   */
  async function handleSubscriptionMessage(channel, message) {
    logger.debug(`handleSubscriptionMessage [${serviceName}] - channel: ${channel}`)
    
    if (!channelHandlers.has(channel)) {
      logger.debugErr(`No handlers for channel: ${channel}`)
      return { results: [], errors: [{ error: `No handlers for channel "${channel}"` }] }
    }
    
    const results = []
    const errors = []
    const callbacks = channelHandlers.get(channel)
    
    // Call all callbacks for this channel
    for (const [subId, handler] of callbacks) {
      try {
        const result = await handler(message)
        results.push(result)
      } catch (err) {
        logger.debugErr(`Subscription error in ${subId} for channel "${channel}":`, err)
        errors.push({ subId, error: err.message })
      }
    }
    
    return { results, errors }
  }

  /**
   * List all active subscriptions
   * 
   * @returns {Object} Map of channels to subscription details
   */
  function listSubscriptions() {
    const result = {}
    for (const [channel, callbacks] of channelHandlers) {
      result[channel] = {
        location: serviceLocation,
        subscriptions: Array.from(callbacks.keys())
      }
    }
    return result
  }

  /**
   * Clean up all subscriptions
   * Called when parent service terminates
   */
  async function cleanup() {
    logger.debug(`cleanup [${serviceName}] - cleaning up subscriptions`)
    const channels = Array.from(channelHandlers.keys())
    
    for (const channel of channels) {
      try {
        // Unsubscribe from registry
        await httpRequest(registryHost, {
          headers: buildUnsubscribeHeaders(channel, serviceLocation, registryToken)
        })
      } catch (err) {
        logger.debugErr(`Error unsubscribing channel ${channel}:`, err)
      }
      
      channelHandlers.delete(channel)
    }
  }

  return {
    subscribe,
    unsubscribe,
    publish,
    handleSubscriptionMessage,
    listSubscriptions,
    cleanup
  }
}

