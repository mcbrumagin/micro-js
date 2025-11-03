/**
 * Registry Server
 * Central service registry and router for micro-js
 * Refactored into modular components for better maintainability
 */

import httpServer from '../http-primitives/http-server.js'
import Logger from '../utils/logger.js'
import envConfig from './shared/env-config.js'
import { createRegistryState, resetState } from './registry/registry-state.js'
import { routeCommand } from './registry/command-router.js'
import { validateRegistryEnvironment } from './registry/registry-auth.js'

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
  
  // Create HTTP server with main request handler
  // Enable streamPayload for multipart uploads to pass through
  const server = await httpServer(port, async function registryServer(payload, request, response) {
    try {
      const result = await routeCommand(state, payload, request, response, {
        defaultStartPort,
        handlerFn: registryServer
      })
      
      // If routeCommand returned false, the response was already sent
      if (result === false) {
        return false
      }
      
      return result
    } catch (err) {
      logger.debugErr('Registry command failed:', err)
      err.status = err.status || 500
      throw err
    }
  }, {
    streamPayload: false // Registry buffers by default, but streaming proxy will handle multipart
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
