// PubSub service for publish-subscribe messaging pattern
// Uses the registry's built-in pub/sub infrastructure

import createService from '../micro-core/create-service.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import envConfig from '../micro-core/env-config.js'

/* --- API ---

// Get pubsub client methods
let { publish, subscribe, unsubscribe } = await createPubSubService()

// Publish message to channel
await publish('myChannel', { data: 'Hello subscribers!' })

// Subscribe with callback handler
let subId = await subscribe('myChannel', message => {
  console.log('Received:', message)
})

// Unsubscribe using subscription ID
await unsubscribe('myChannel', subId)

*/

export default async function createPubSubService() {
  const logger = new Logger({ logGroup: 'pubsub' })
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  
  // Track ONE handler service per channel
  // Map: channel -> { server, location, callbacks: Map<subId, handler> }
  const channelHandlers = {}
  let subscriptionCounter = 0

  /**
   * Publish a message to a channel
   * Uses registry's built-in publish functionality
   */
  async function publish(channel, message) {
    logger.trace(`Publishing to channel "${channel}"`)
    
    const result = await httpRequest(registryHost, {
      publish: {
        type: channel,
        message
      }
    })
    
    return result
  }

  /**
   * Subscribe to a channel with a callback handler
   * Creates a persistent handler service per channel (if needed)
   * Stores callback locally and returns subscription ID
   */
  async function subscribe(channel, handler) {
    if (typeof handler !== 'function') {
      throw new HttpError(400, 'Subscribe handler must be a function')
    }

    const subId = `sub_${channel}_${++subscriptionCounter}_${Date.now()}`
    logger.trace(`Subscribing to channel "${channel}" with ID "${subId}"`)

    // Create channel handler service if this is the first subscription to this channel
    if (!channelHandlers[channel]) {
      const serviceName = `pubsub_handler_${channel}_${Date.now()}`
      const callbacks = new Map()
      
      // Create persistent handler service for this channel
      const server = await createService(serviceName, async function(message) {
        const results = []
        const errors = []
        
        // Call all local handlers for this channel
        for (const [subId, handler] of callbacks) {
          try {
            const result = await handler(message)
            results.push(result)
          } catch (err) {
            logger.error(`Error in subscription ${subId} for channel "${channel}":`, err.stack)
            errors.push(err)
          }
        }
        
        return { results, errors }
      })

      const location = server.location

      // Subscribe the channel handler to registry
      await httpRequest(registryHost, {
        subscribe: {
          type: channel,
          location
        }
      })

      // Track the channel handler
      channelHandlers[channel] = { server, location, callbacks }
      logger.trace(`Created handler service for channel "${channel}" at "${location}"`)
    }

    // Add callback to channel's local handler map
    channelHandlers[channel].callbacks.set(subId, handler)
    logger.trace(`Added subscription "${subId}" to channel "${channel}" (${channelHandlers[channel].callbacks.size} total)`)
    
    return subId
  }

  /**
   * Unsubscribe from a channel using subscription ID
   * Removes local callback and cleans up handler service if no more subscribers
   */
  async function unsubscribe(channel, subId) {
    logger.trace(`Unsubscribing "${subId}" from channel "${channel}"`)

    if (!channelHandlers[channel]) {
      throw new HttpError(404, `No subscriptions found for channel "${channel}"`)
    }

    const deleted = channelHandlers[channel].callbacks.delete(subId)
    if (!deleted) {
      throw new HttpError(404, `Subscription "${subId}" not found for channel "${channel}"`)
    }

    logger.trace(`Removed subscription "${subId}" from channel "${channel}" (${channelHandlers[channel].callbacks.size} remaining)`)

    // If no more subscribers for this channel, clean up the handler service
    if (channelHandlers[channel].callbacks.size === 0) {
      const { server, location } = channelHandlers[channel]

      // Unsubscribe from registry
      await httpRequest(registryHost, {
        unsubscribe: {
          type: channel,
          location
        }
      })

      // Terminate the handler service
      await server.terminate()

      // Remove from tracking
      delete channelHandlers[channel]
      logger.trace(`Terminated handler service for channel "${channel}"`)
    }

    return true
  }

  // TODO rename to list for listSubscriptions
  function listSubscriptions() {
    const result = {}
    for (const channel in channelHandlers) {
      const { location, callbacks } = channelHandlers[channel]
      result[channel] = {
        location,
        subscriptions: Array.from(callbacks.keys())
      }
    }
    return result
  }

  async function terminate() {
    logger.trace('Cleaning up all subscriptions')
    const channels = Object.keys(channelHandlers)
    
    for (const channel of channels) {
      const { server, location } = channelHandlers[channel]
      
      try {
        // Unsubscribe from registry
        await httpRequest(registryHost, {
          unsubscribe: {
            type: channel,
            location
          }
        })

        // Terminate handler service
        await server.terminate()
      } catch (err) {
        logger.error(`Error cleaning up channel ${channel}:`, err.message)
      }
      
      // Clear tracking
      delete channelHandlers[channel]
    }
  }

  return { 
    publish, 
    subscribe, 
    unsubscribe,
    listSubscriptions,
    terminate
  }
}
