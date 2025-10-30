/**
 * Pub/Sub Manager
 * Handles publish-subscribe messaging between services
 */

import httpRequest from '../../http-primitives/http-request.js'
import HttpError from '../../http-primitives/http-error.js'
import { buildPublishHeaders, buildCacheUpdateHeaders } from '../../utils/micro-headers.js'

import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'micro-registry' })

/**
 * Publish a message to all subscribers of a type
 */
export async function publish(state, { type, message }) {
  const results = []
  const errors = []
  
  const subscribers = state.subscriptions.get(type)
  if (!subscribers) {
    return { results, errors }
  }
  
  for (const location of subscribers) {
    try {
      const result = await httpRequest(location, {
        body: message,
        headers: buildPublishHeaders(type)
      })
      results.push(result)
    } catch (err) {
      errors.push(err)
    }
  }
  
  return { results, errors }
}

/**
 * Publish cache update notifications to all subscribers
 * Uses micro headers to identify internal cache update calls
 */
export async function publishCacheUpdate(state, { service, location }) {
  const results = []
  const errors = []
  
  const subscribers = state.subscriptions.get('register')
  if (!subscribers) {
    return { results, errors }
  }
  
  for (const subscriberLocation of subscribers) {
    try {
      const result = await httpRequest(subscriberLocation, {
        body: null, // No body needed - all info is in headers
        headers: buildCacheUpdateHeaders(service, location)
      })
      results.push(result)
    } catch (err) {
      errors.push(err)
    }
  }
  
  return { results, errors }
}

/**
 * Subscribe a location to a message type
 */
export function subscribe(state, { type, location }) {
  if (!state.subscriptions.has(type)) {
    state.subscriptions.set(type, new Set())
  }
  
  state.subscriptions.get(type).add(location)
  logger.debug('subscribe - location:', location, 'type:', type)
}

/**
 * Unsubscribe a location from a message type
 */
export function unsubscribe(state, { type, location }) {
  const subscribers = state.subscriptions.get(type)
  
  if (!subscribers) {
    throw new HttpError(404, `No type "${type}"`)
  }
  
  const removed = subscribers.delete(location)
  if (!removed) {
    throw new HttpError(404, `No location "${location}" for type "${type}"`)
  }
  
  // Clean up empty subscription types
  if (subscribers.size === 0) {
    state.subscriptions.delete(type)
  }
  
  logger.debug('unsubscribe - location:', location, 'type:', type)
}

/**
 * Remove all subscriptions for a specific location
 * Useful during service unregistration
 */
export function removeAllSubscriptionsForLocation(state, location) {
  for (const [type, subscribers] of state.subscriptions) {
    subscribers.delete(location)
    if (subscribers.size === 0) {
      state.subscriptions.delete(type)
    }
  }
}

