const httpServer = require('./http-server.js')
const httpRequest = require('./http-request.js')
const HttpError = require('./http-error.js')

const subscriptions = {}

async function publish(payload) {
  let { type, message } = payload
  if (!type || !message) throw new HttpError(400, `"type" and "message" are required`)
  // console.log('publish', {type, message, subscriptions})

  let results = []
  let errors = []
  for (let location of subscriptions[type]) {
    try {
      // console.log({location, message})
      let result = await httpRequest(location, message)
      results.push(result)
    } catch (err) {
      errors.push(err) // TODO test coverage
    }
  }
  return { results, errors }
}

async function subscribe(payload) {
  let { type, location } = payload
  if (!type || !location) throw new HttpError(400, `"type" and "location" are required`)
  // TODO better validation?

  // console.log('subscribe', { type, location })
  if (!subscriptions[type]) subscriptions[type] = new Set()
  subscriptions[type].add(location)
}

async function unsubscribe(payload) {
  let { type, location } = payload
  if (!subscriptions[type]) throw new HttpError(404, `No type "${type}"`)
  let success = subscriptions[type].delete(location)
  if (!success) throw new HttpError(404, `No location "${location}" for type "${type}"`)
}

module.exports = async function createServer(port) {
  let server = await httpServer(port, async function pubSub(payload) {
    if (payload.publish) await publish(payload.publish)
    else if (payload.subscribe) await subscribe(payload.subscribe)
    else if (payload.unsubscribe) await unsubscribe(payload.unsubscribe)
    else throw new HttpError(400, 'Missing "publish", "subscribe", or "unsubscribe" property') // TODO test coverage
  })

  let httpTerminate = server.terminate.bind(server)
  server.terminate =  async () => {
    for (let prop in subscriptions) {
      delete subscriptions[prop]
    }
    await httpTerminate()
  }

  return server
}
