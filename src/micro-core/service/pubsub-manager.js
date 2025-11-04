/**
 * PubSub Manager
 * Handles global publish-subscribe messaging for services
 * 
 * All events are globally scoped by default - they broadcast to ALL subscribers
 * across the entire service cluster via the registry.
 * 
 * Uses the service's existing HTTP server with header-based routing (like cache updates).
 * Messages are routed through cache-handler.js when PUBSUB_PUBLISH command is detected.
 */

import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'
import { buildSubscribeHeaders, buildUnsubscribeHeaders, buildPublishHeaders } from '../shared/micro-headers.js'

const logger = new Logger({ logGroup: 'micro-pubsub' })

/**
 * Create PubSub manager for a service
 * Manages global event subscriptions using the service's existing HTTP server
 * 
 * @param {string} serviceName - Name of the parent service
 * @param {string} serviceLocation - HTTP location of the parent service (e.g. 'http://localhost:3000')
 */
export function createPubSubManager(serviceName, serviceLocation) {
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  // Track subscriptions: channel -> Map<subId, handler>
  // Allows multiple handlers per channel within this service
  const channelHandlers = new Map()
  let subscriptionCounter = 0

  /**
   * Subscribe to a global event channel
   * 
   * Messages published to this channel will be broadcast to ALL services
   * that have subscribed, across the entire cluster.
   * 
   * @param {string} channel - Channel name (e.g. 'user-created', 'order-placed')
   *                          Convention: Use 'micro:*' prefix for framework events
   * @param {Function} handler - Async function to handle messages: (message, request, response) => result
   * @returns {Promise<string>} Subscription ID for unsubscribe
   * 
   * @example
   * const subId = await subscribe('user-created', async (userData) => {
   *   console.log('New user:', userData)
   * })
   * 
   * TODO: Add scope parameter for future enhancements
   * TODO: subscribe(channel, handler, { scope: 'global' | 'local' | 'instance' | 'location' })
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
   * Unsubscribe from a global event channel
   * 
   * If this was the last subscription for this channel in this service,
   * the service location is unregistered from the registry.
   * 
   * @param {string} channel - Channel name
   * @param {string} subId - Subscription ID from subscribe()
   * @returns {Promise<boolean>}
   * 
   * TODO: Handle scoped unsubscribe when scope feature is added
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
   * Publish a message to a global event channel
   * 
   * Message is broadcast to ALL services subscribed to this channel
   * across the entire cluster via the registry.
   * 
   * @param {string} channel - Channel name
   * @param {any} message - Message payload (will be JSON serialized)
   * @returns {Promise<{results: Array, errors: Array}>} Results from all subscribers
   * 
   * @example
   * await publish('user-created', { userId: 123, email: 'user@example.com' })
   * 
   * TODO: Add scope parameter and routing logic
   * TODO: publish(channel, message, { scope: 'global' | 'instance' | 'location', target: '...' })
   */
  async function publish(channel, message) {
    logger.debug(`publish [${serviceName}] - channel: ${channel}`)
    
    // TODO: Add scope-based routing here when implementing scopes
    // For now, all publishes go through registry (global scope)
    const result = await httpRequest(registryHost, {
      body: message,
      headers: buildPublishHeaders(channel, registryToken)
    })
    
    return result
  }

  /**
   * Handle incoming message from registry
   * 
   * Called by cache-handler.js when a PUBSUB_PUBLISH command is detected.
   * Routes the message to all local handlers subscribed to this channel.
   * 
   * @param {string} channel - Channel name from headers
   * @param {any} message - Message payload
   * @returns {Promise<{results: Array, errors: Array}>}
   * 
   * TODO: Add scope-based filtering when scope feature is added
   * TODO: For 'local' scope, handle message directly without registry roundtrip
   */
  async function handleIncomingMessage(channel, message) {
    logger.debug(`handleIncomingMessage [${serviceName}] - channel: ${channel}`)
    
    if (!channelHandlers.has(channel)) {
      logger.debugErr(`No handlers for channel: ${channel}`)
      return { results: [], errors: [{ error: `No handlers for channel "${channel}"` }] }
    }
    
    const results = []
    const errors = []
    const callbacks = channelHandlers.get(channel)
    
    // Call all local handlers for this channel
    for (const [subId, handler] of callbacks) {
      try {
        const result = await handler(message)
        results.push(result)
      } catch (err) {
        logger.debugErr(`Handler error in ${subId} for channel "${channel}":`, err)
        
        // TODO: Decide on error handling strategy
        // Options: 1) Return errors to publisher, 2) Silent fail, 3) Dead letter queue
        errors.push({ subId, error: err.message, status: 500 })
      }
    }
    
    return { results, errors }
  }

  /**
   * List all active subscriptions for this service
   * 
   * @returns {Object} Map of channels to subscription details
   * 
   * TODO: Include scope information when scope feature is added
   */
  function listSubscriptions() {
    const result = {}
    for (const [channel, callbacks] of channelHandlers) {
      result[channel] = {
        scope: 'global', // TODO: Add actual scope when implemented
        location: serviceLocation,
        subscriptions: Array.from(callbacks.keys())
      }
    }
    return result
  }

  /**
   * Clean up all subscriptions
   * 
   * Called when parent service terminates to ensure proper cleanup.
   * Unregisters all channels from the registry and clears local handlers.
   */
  async function cleanup() {
    logger.debug(`cleanup [${serviceName}] - cleaning up all subscriptions`)
    const channels = Array.from(channelHandlers.keys())
    
    for (const channel of channels) {
      try {
        // Unregister from registry (global scope)
        await httpRequest(registryHost, {
          headers: buildUnsubscribeHeaders(channel, serviceLocation, registryToken)
        })
      } catch (err) {
        logger.debugErr(`Error unsubscribing channel ${channel}:`, err)
      }
      
      channelHandlers.delete(channel)
    }
    
    logger.info(`cleanup [${serviceName}] - cleaned up ${channels.length} channels`)
  }

  return {
    subscribe,
    unsubscribe,
    publish,
    handleIncomingMessage,
    listSubscriptions,
    cleanup
  }
}

