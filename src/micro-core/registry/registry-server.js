/**
 * Registry Server
 * Central service registry and router for micro-js
 * Refactored into modular components for better maintainability
 */

import createProxyServer from '../http-primitives/http-proxy-server.js'
import readStream from '../http-primitives/read-stream.js'
import Logger from '../../utils/logger.js'
import envConfig from '../shared/env-config.js'
import { createRegistryState, resetState } from './registry-state.js'
import { routeCommand } from './command-router.js'
import { validateRegistryEnvironment } from './registry-auth.js'

const logger = new Logger({ logGroup: 'micro-registry' })

/**
 * Create and start the registry server
 */
export default async function createRegistryServer(port) {
  validateRegistryEnvironment()
  const state = createRegistryState()
  
  // Determine port from argument or environment
  if (!port) {
    const registryHost = process.env.MICRO_REGISTRY_URL
    if (registryHost) {
      port = registryHost.split(':')[2]
      if (!port || isNaN(port)) {
        throw new Error(
          'Please specify "port" arg or define "MICRO_REGISTRY_URL" env variable ' +
          'including protocol and port number'
        )
      }
    }
  }
  
  // Calculate default starting port for services
  const registryEndpoint = envConfig.getRequired('MICRO_REGISTRY_URL')
  const registryPort = registryEndpoint.split(':')[2]
  const defaultStartPort = registryPort && (Number(registryPort) + 1) || 10000
  
  // Create HTTP proxy server that doesn't parse request bodies by default
  // This allows streaming proxy for routes and service calls
  // Commands that need the body (like PUBSUB_PUBLISH) will parse it themselves
  const server = await createProxyServer(port, async function registryServer(request, response) {
    let payload = null
    try {
      // Parse body only for commands that need it (PUBSUB_PUBLISH)
      // For proxy operations (SERVICE_CALL, routes, auth), leave the stream untouched
      const command = request.headers['micro-command']
      const needsBodyParsing = command === 'pubsub-publish'
      
      if (needsBodyParsing) {
        const bodyBuffer = await readStream(request)
        const contentType = request.headers['content-type'] || ''
        
        if (contentType.includes('application/json') && bodyBuffer.length > 0) {
          try {
            payload = JSON.parse(bodyBuffer.toString('utf8'))
          } catch (err) {
            payload = bodyBuffer
          }
        } else {
          payload = bodyBuffer
        }
      }
      
      const result = await routeCommand(state, payload, request, response, {
        defaultStartPort,
        handlerFn: registryServer
      })
      
      // If routeCommand returned false, the response was already sent
      if (result === false) {
        return
      }
      
      // Send the result
      const contentType = typeof result === 'string' ? 'text/plain' : 'application/json'
      const body = typeof result === 'string' ? result : JSON.stringify(result)
      
      response.writeHead(200, { 'content-type': contentType })
      response.end(body)
      
    } catch (err) {
      if (!request.headers['mute-internal-error']) {
        logger.debugErr('Registry command failed:', err)
      }
      const status = err.status || 500
      
      if (!response.writableEnded) {
        response.writeHead(status, { 'content-type': 'text/plain' })
        response.end(err.stack || err.message)
      }
    }
  })
  
  // Override terminate to clean up state
  const httpServerTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.info('Registry shutting down')
    resetState(state)
    await httpServerTerminate()
  }
  
  server.isRegistry = true
  return server
}
