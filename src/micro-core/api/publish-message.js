import httpRequest from '../http-primitives/http-request.js'
import { buildPublishHeaders } from '../shared/micro-headers.js'
import envConfig from '../shared/env-config.js'

/**
 * Publish a message to a pubsub channel via the registry
 * 
 * @param {string} channel - The channel name to publish to
 * @param {any} message - The message payload to send
 * @returns {Promise<{results: Array, errors: Array}>} Results and errors from all subscribers
 */
export default async function publishMessage(channel, message) {
  let registryHost = process.env.MICRO_REGISTRY_URL
  if (!registryHost) throw new Error('Please define "MICRO_REGISTRY_URL" env variable')
  
  const registryToken = envConfig.get('MICRO_REGISTRY_TOKEN')
    
  let result = await httpRequest(registryHost, {
    body: message,
    headers: buildPublishHeaders(channel, registryToken)
  })
  
  return result
}

