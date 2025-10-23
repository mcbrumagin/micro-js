// PubSub service for publish-subscribe messaging pattern
// Uses the registry's built-in pub/sub infrastructure

import createService from '../micro-core/create-service.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'
import envConfig from '../micro-core/env-config.js'
import { buildPublishHeaders, buildSubscribeHeaders, buildUnsubscribeHeaders } from '../utils/micro-headers.js'

export default async function createPubSubService({ useAuthService = null } = {}) {
  const logger = new Logger({
    logGroup: 'pubsub',
    includeLogLineNumbers: true
  })
  const registryHost = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
  
  // Track ONE handler service per channel
  // Map: channel -> { server, location, callbacks: Map<subId, handler> }
  const channelHandlers = {}
  let subscriptionCounter = 0

  /**
   * Publish a message to a channel
   * Uses registry's built-in publish functionality
   */
  async function publish(channel, message) {
    logger.debug(`publishing to channel "${channel}"`)
    
    const result = await httpRequest(registryHost, {
      body: message,
      headers: buildPublishHeaders(channel, registryToken)
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
    logger.debug(`subscribing to channel "${channel}" with ID "${subId}"`)

    if (!channelHandlers[channel]) {
      const serviceName = `pubsub_handler_${channel}_${Date.now()}`
      const callbacks = new Map()
      
      const server = await createService(serviceName, async function(message) {
        const results = []
        const errors = []
        
        for (const [subId, handler] of callbacks) {
          try {
            const result = await handler(message)
            results.push(result)
          } catch (err) {
            logger.error(`error in subscription ${subId} for channel "${channel}":`, err.stack)
            errors.push(err)
          }
        }
        
        return { results, errors }
      }, { useAuthService })

      const location = server.location

      await httpRequest(registryHost, {
        headers: buildSubscribeHeaders(channel, location, registryToken)
      })

      channelHandlers[channel] = { server, location, callbacks }
      logger.debug(`created handler service for channel "${channel}" at "${location}"`)
    }

    channelHandlers[channel].callbacks.set(subId, handler)
    logger.debug(`added subscription "${subId}" to channel "${channel}" (${channelHandlers[channel].callbacks.size} total)`)
    
    return subId
  }

  /**
   * Unsubscribe from a channel using subscription ID
   * Removes local callback and cleans up handler service if no more subscribers
   */
  async function unsubscribe(channel, subId) {
    logger.debug(`unsubscribing "${subId}" from channel "${channel}"`)

    if (!channelHandlers[channel]) {
      throw new HttpError(404, `No subscriptions found for channel "${channel}"`)
    }

    const deleted = channelHandlers[channel].callbacks.delete(subId)
    if (!deleted) {
      throw new HttpError(404, `Subscription "${subId}" not found for channel "${channel}"`)
    }

    logger.debug(`removed subscription "${subId}" from channel "${channel}" (${channelHandlers[channel].callbacks.size} remaining)`)

    if (channelHandlers[channel].callbacks.size === 0) {
      const { server, location } = channelHandlers[channel]

      await httpRequest(registryHost, {
        headers: buildUnsubscribeHeaders(channel, location, registryToken)
      })

      await server.terminate()

      delete channelHandlers[channel]
      logger.debug(`terminated handler service for channel "${channel}"`)
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
    logger.debug('cleaning up all subscriptions')
    const channels = Object.keys(channelHandlers)
    
    for (const channel of channels) {
      const { server, location } = channelHandlers[channel]
      
      try {
        await httpRequest(registryHost, {
          headers: buildUnsubscribeHeaders(channel, location, registryToken)
        })

        await server.terminate()
      } catch (err) {
        logger.error(`error cleaning up channel ${channel}:`, err.message)
      }
      
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
