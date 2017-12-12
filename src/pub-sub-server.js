const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')

const subscriptions = {}

async function publish (payload) {
  let { type, message } = payload

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

async function subscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) subscriptions[type] = new Set()
  subscriptions[type].add(location)
}

async function unsubscribe (payload) {
  let { type, location } = payload
  if (!subscriptions[type]) throw new Error(`No type "${type}"`)
  let success = subscriptions[type].delete(location)
  if (!success) throw new Error(`No location "${location}" for type "${type}"`)
}

module.exports = async function createServer(port) {
  return httpServer(port, async function pubSub(payload) {
    if (payload.publish) await publish(payload.publish)
    else if (payload.subscribe) await subscribe(payload.subscribe)
    else if (payload.unsubscribe) await unsubscribe(payload.unsubscribe)
    else throw new Error('Missing "publish", "subscribe", and "unsubscribe" property')
  })
}
