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

  async function publish(channel, message) {
    if (!subscriptions[channel]) return { results: [], errors: [] }
    return await httpRequest(subscriptions[channel], message)
  }

  async function subscribe(channel, callback) {
    if (!subscriptions[channel]) subscriptions[channel] = new Set()
    subscriptions[channel].add(callback)
  }

  async function list(channel) {
    return subscriptions[channel]
  }

  async function unsubscribe(channel, callback) {
    subscriptions[channel].delete(callback)
  }

  // TODO - bad/broken/incomplete
  createService({
    publish,
    subscribe,
    list,
    unsubscribe
  })

  //  TODO for application boundaries, the subscription should create a service based on the consumer/channel

  return { publish, subscribe, list, unsubscribe }
}
