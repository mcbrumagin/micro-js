/**
 * PubSub Service (Refactored)
 * Uses the new context.subscribe() and context.publish() methods
 * 
 * This demonstrates how to use the built-in pubsub functionality.
 * Services can use subscribe/publish directly in their context without this wrapper.
 */

import createService from '../micro-core/api/create-service.js'
import HttpError from '../micro-core/http-primitives/http-error.js'
import Logger from '../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-services' })

/**
 * Create a PubSub service using context methods
 * Provides a programmatic API for pubsub operations
 */
export default async function createPubSubService({ useAuthService = null } = {}) {
  // Track subscriptions: channel -> Set<subId>
  const subscriptions = new Map()
  
  const server = await createService('pubSubService', async function pubSubService(payload) {
    // This service function is for HTTP-based calls (if needed)
    // The actual pubsub API is exposed through the return object
    const { action, channel, message } = payload || {}
    
    if (!action) {
      throw new HttpError(400, 'Missing required field: action')
    }
    
    switch (action) {
      case 'publish':
        if (!channel) throw new HttpError(400, 'Missing required field: channel')
        return await this.publish(channel, message)
      
      default:
        throw new HttpError(400, `Unknown action: ${action}. Use the direct API methods instead.`)
    }
  }, { useAuthService })
  
  /**
   * Publish a message to a channel
   */
  async function publish(channel, message) {
    logger.debug('publish - channel:', channel)
    return await server.context.publish(channel, message)
  }
  
  /**
   * Subscribe to a channel with a callback handler
   */
  async function subscribe(channel, handler) {
    if (typeof handler !== 'function') {
      throw new HttpError(400, 'Subscribe handler must be a function')
    }
    
    logger.debug('subscribe - channel:', channel)
    const subId = await server.context.subscribe(channel, handler)
    
    // Track subscription for list functionality
    if (!subscriptions.has(channel)) {
      subscriptions.set(channel, new Set())
    }
    subscriptions.get(channel).add(subId)
    
    return subId
  }
  
  /**
   * Unsubscribe from a channel using subscription ID
   */
  async function unsubscribe(channel, subId) {
    logger.debug('unsubscribe - channel:', channel, 'id:', subId)
    
    const result = await server.context.unsubscribe(channel, subId)
    
    // Update tracking
    if (subscriptions.has(channel)) {
      subscriptions.get(channel).delete(subId)
      if (subscriptions.get(channel).size === 0) {
        subscriptions.delete(channel)
      }
    }
    
    return result
  }
  
  /**
   * List all active subscriptions
   */
  function listSubscriptions() {
    if (server.context._subscriptionManager) {
      return server.context._subscriptionManager.listSubscriptions()
    }
    return {}
  }
  
  // Override terminate to ensure proper cleanup
  const originalTerminate = server.terminate
  server.terminate = async () => {
    logger.debug('pubSubService - terminating, cleaning up subscriptions')
    subscriptions.clear()
    // Note: originalTerminate() will call context._subscriptionManager.cleanup()
    // which handles unsubscribing and terminating subscription handlers
    await originalTerminate()
  }
  
  // Return server with pubsub API methods
  return Object.assign(server, {
    publish,
    subscribe,
    unsubscribe,
    listSubscriptions
  })
}

