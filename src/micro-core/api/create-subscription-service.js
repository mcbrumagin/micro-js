/**
 * Create Subscription Service
 * Dedicated service for handling event subscriptions
 * Automatically subscribes to all channels on startup and registers with registry
 * 
 * This is the recommended way to handle event subscriptions - subscription services
 * are clearly long-running and have explicit lifecycle management.
 */

import Logger from '../../utils/logger.js'
import { COMMANDS, parseCommandHeaders } from '../shared/micro-headers.js'
import { createPubSubManager } from '../service/pubsub-manager.js'
import {
  createAndRegisterService,
  unregisterServiceFromRegistry
} from './service-helpers.js'

const logger = new Logger({ logGroup: 'micro-subscription-service' })

/**
 * Create a subscription service to handle event channels
 * 
 * Unlike regular services that handle RPC calls, subscription services are dedicated
 * to processing events from specific channels. They automatically subscribe on startup
 * and properly clean up on termination.
 * 
 * @param {string} serviceName - Name of the subscription service
 * @param {string|Object} channelOrMap - Channel name (string) or map of channel names to handlers (object)
 * @param {Function|Object} handlerOrOptions - Handler function (if channelOrMap is string) or options (if channelOrMap is object)
 * @param {Object} [options] - Configuration options (only used when channelOrMap is string)
 * @returns {Promise<Object>} Service instance with terminate() method
 * 
 * @example
 * // Single channel subscription
 * const service = await createSubscriptionService('user-created-handler', 'user.created', 
 *   async (userData) => {
 *     await sendWelcomeEmail(userData.email)
 *     return { welcomed: true }
 *   }
 * )
 * 
 * @example
 * // Multiple channels with channel map
 * const service = await createSubscriptionService('user-event-handler', {
 *   'user.created': async (userData) => {
 *     await sendWelcomeEmail(userData.email)
 *     return { welcomed: true }
 *   },
 *   'user.deleted': async (userData) => {
 *     await cleanupUserData(userData.id)
 *   }
 * })
 * 
 * @example
 * // Multi-domain event aggregator
 * const logger = await createSubscriptionService('event-logger', {
 *   'user.created': async (data) => logEvent('user', 'created', data),
 *   'user.updated': async (data) => logEvent('user', 'updated', data),
 *   'order.placed': async (data) => logEvent('order', 'placed', data)
 * })
 * 
 * // Later: await service.terminate()
 */
export default async function createSubscriptionService(serviceName, channelOrMap, handlerOrOptions, options) {
  let channelMap
  
  // Support both single channel/handler and channel map
  if (typeof channelOrMap === 'string') {
    // Single channel mode: createSubscriptionService(name, channel, handler, options)
    const channel = channelOrMap
    const handler = handlerOrOptions
    
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function')
    }
    
    channelMap = { [channel]: handler }
    // options is already the 4th parameter
  } else if (typeof channelOrMap === 'object') {
    // Channel map mode: createSubscriptionService(name, channelMap, options)
    channelMap = channelOrMap
    options = handlerOrOptions || {}
    
    // Validate channelMap
    if (!channelMap || typeof channelMap !== 'object') {
      throw new Error('channelMap must be an object with channel names as keys')
    }
    
    const channels = Object.keys(channelMap)
    if (channels.length === 0) {
      throw new Error('channelMap must contain at least one channel')
    }
    
    // Validate all handlers are functions
    for (const [channel, handler] of Object.entries(channelMap)) {
      if (typeof handler !== 'function') {
        throw new Error(`Handler for channel "${channel}" must be a function`)
      }
    }
  } else {
    throw new Error('Second parameter must be a channel name (string) or channel map (object)')
  }
  
  options = options || {}
  const channels = Object.keys(channelMap)
  
  logger.debug(`createSubscriptionService - ${serviceName} with ${channels.length} channels`)
  
  // We need to declare pubSubManager in outer scope so it's accessible in handler
  let pubSubManager = null
  
  // Setup service infrastructure (allocate port, create server, register)
  const { location, server, registryData } = await createAndRegisterService(
    serviceName,
    async function subscriptionServiceHandler(message, request, response) {
      const { command, pubsubChannel } = parseCommandHeaders(request.headers)
      
      // Handle incoming subscription messages
      if (command === COMMANDS.PUBSUB_PUBLISH) {
        if (!pubSubManager) {
          logger.debugErr(`PubSub manager not initialized for ${serviceName}`)
          return { results: [], errors: [{ error: 'PubSub manager not ready' }] }
        }
        return await pubSubManager.handleIncomingMessage(pubsubChannel, message)
      }
      
      // For non-pubsub requests, return service info
      return {
        service: serviceName,
        type: 'subscription-service',
        channels: Object.keys(channelMap),
        subscriptionCount: channels.length,
        location
      }
    },
    options
  )
  
  // Create pubsub manager for routing messages to handlers
  pubSubManager = createPubSubManager(serviceName, location)
  
  // Subscribe to all channels upfront
  const subscriptionIds = {}
  for (const [channel, handler] of Object.entries(channelMap)) {
    logger.debug(`Subscribing to channel: ${channel}`)
    subscriptionIds[channel] = await pubSubManager.subscribe(channel, handler)
  }
  
  logger.info(`Subscription service "${serviceName}" running at ${location}`)
  logger.info(`Subscribed to ${channels.length} channels: ${channels.join(', ')}`)
  
  // Add metadata to server instance
  server.name = serviceName
  server.location = location
  server.service = serviceName
  server.type = 'subscription-service'
  server.channels = channels
  server.subscriptionIds = subscriptionIds
  
  // Override terminate to handle cleanup
  const httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.debug(`Terminating subscription service: ${serviceName}`)
    
    // Cleanup subscriptions first (unsubscribes from all channels)
    await pubSubManager.cleanup()
    
    // Unregister from registry
    await unregisterServiceFromRegistry(serviceName, location)
    
    // Stop HTTP server
    await httpServerTerminate()
    
    logger.info(`Subscription service "${serviceName}" terminated`)
  }
  
  return server
}

