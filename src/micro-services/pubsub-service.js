// PubSub service for publish-subscribe messaging pattern

import createService from '../micro-core/create-service.js'
import httpRequest from '../http-primitives/http-request.js'
import HttpError from '../http-primitives/http-error.js'
import Logger from '../utils/logger.js'

/* --- TODO ---

// something like this
let { publish, subscribe, list, clear, unsubscribe } = pubsubService() // automatically bind to registry
publish('test', 'Hello subscribers!') // specific service is in closure, just send message to channel
subscribe('test', message => console.log(message)) // handle callbacks whenever/wherever

*/

export default function createPubSubService() {

  let logger = new Logger({logGroup: 'pubsub'})
  const subscriptions = {}

  async function publish(payload) {
    let { type, message } = payload
    if (!type || !message) throw new HttpError(400, `"type" and "message" are required`)
    
    if (!subscriptions[type] || subscriptions[type].size === 0) {
      return { results: [], errors: [] }
    }

    let results = []
    let errors = []
    for (let location of subscriptions[type]) {
      try {
        let result = await httpRequest(location, message)
        results.push(result)
      } catch (err) {
        errors.push(err)
      }
    }
    return { results, errors }
  }

  async function subscribe(payload) {
    let { type, location } = payload
    if (!type || !location) throw new HttpError(400, `"type" and "location" are required`)

    if (!subscriptions[type]) subscriptions[type] = new Set()
    subscriptions[type].add(location)
    return { success: true, type, location }
  }

  async function unsubscribe(payload) {
    let { type, location } = payload
    if (!subscriptions[type]) throw new HttpError(404, `No type "${type}"`)
    let success = subscriptions[type].delete(location)
    if (!success) throw new HttpError(404, `No location "${location}" for type "${type}"`)
    return { success: true, type, location }
  }

  return createService('pubsub', async function pubsubService(payload) {
    logger.trace(`pubsub service received payload:`, payload)
    
    if (payload.publish) return await publish(payload.publish)
    else if (payload.subscribe) return await subscribe(payload.subscribe)
    else if (payload.unsubscribe) return await unsubscribe(payload.unsubscribe)
    else if (payload.list) {
      // List all subscriptions or for a specific type
      if (payload.list.type) {
        return {
          type: payload.list.type,
          subscribers: subscriptions[payload.list.type] ? Array.from(subscriptions[payload.list.type]) : []
        }
      }
      // Return all subscriptions
      let allSubscriptions = {}
      for (let type in subscriptions) {
        allSubscriptions[type] = Array.from(subscriptions[type])
      }
      return allSubscriptions
    }
    else if (payload.clear) {
      // Clear all subscriptions or for a specific type
      if (payload.clear.type) {
        delete subscriptions[payload.clear.type]
        return { success: true, type: payload.clear.type }
      }
      // Clear all
      for (let prop in subscriptions) {
        delete subscriptions[prop]
      }
      return { success: true, cleared: 'all' }
    }
    else throw new HttpError(400, 'Missing "publish", "subscribe", "unsubscribe", "list", or "clear" property')
  })  
}
