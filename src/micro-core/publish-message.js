import httpRequest from '../http-primitives/http-request.js'
import { buildPublishHeaders } from '../utils/micro-headers.js'

/**
 * Publish a message to a pubsub channel via the registry
 * Similar to callService but for pub/sub messaging
 * 
 * @param {string} channel - The channel name to publish to
 * @param {any} message - The message payload to send
 * @returns {Promise<{results: Array, errors: Array}>} Results and errors from all subscribers
 */
export default async function publishMessage(channel, message) {
  let registryHost = process.env.MICRO_REGISTRY_URL
  if (!registryHost) throw new Error('Please define "MICRO_REGISTRY_URL" env variable')

  // Use header-based command: message goes in body, channel in header
  let result = await httpRequest(registryHost, {
    body: message,
    headers: buildPublishHeaders(channel)
  })
  
  return result
}

