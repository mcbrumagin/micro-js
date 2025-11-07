import http from 'node:http'
import HttpError from './http-error.js'
import Logger from '../../utils/logger.js'

const logger = new Logger({ logGroup: 'http-primitives' })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function prependServiceNameToErrorStack(err, serviceName) {
  // helpful for cascading errors
  let errFrags = err.stack.split('\n')
  errFrags.splice(1, 0, `in service "${serviceName}"`)
  err.stack = errFrags.join('\n')
}

/**
 * Create a proxy-specific HTTP server that doesn't parse request bodies
 * This allows the request stream to be forwarded/piped to backend services
 * 
 * Key difference from http-server.js:
 * - Does NOT read or parse the request body
 * - Does NOT automatically handle response formatting
 * - Expects the handler to manage the full request/response cycle
 * 
 * @param {number} port - Port to listen on
 * @param {Function} serverFn - Handler function(request, response)
 * @param {Object} options - Server options
 * @returns {Promise<http.Server>} HTTP server instance
 */
export default async function createProxyServer(port, serverFn, options = {}) {
  if (!port) throw new Error('"port" is required')
  if (!serverFn) throw new Error('"serverFn" is required')

  return new Promise((resolve, reject) => {
    const server = http.createServer({
      keepAlive: true,
      keepAliveInitialDelay: 0,
      requestTimeout: 60000,
      headersTimeout: 30000,
    }, async (request, response) => {
      try {
        // Pass request and response directly to handler without reading body
        // Handler is responsible for:
        // - Reading/streaming the request body if needed
        // - Writing appropriate response headers
        // - Sending the response
        await server.handler(request, response)
        
      } catch (err) {
        if (err instanceof HttpError) {
          prependServiceNameToErrorStack(err, serverFn.name)
          if (!response.writableEnded) {
            response.setHeader('content-type', 'text/plain')
            response.writeHead(err.status || 500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', { port, name: serverFn.name })
            logger.error(err.stack)
          }
        } else {
          if (!response.writableEnded) {
            response.setHeader('content-type', 'text/plain')
            response.writeHead(500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', { port, name: serverFn.name })
            logger.error(err.stack)
          }
        }
      }
    })

    // Store handler so it can be overridden
    server.handler = serverFn

    server.on('error', err => {
      logger.warn(`proxy server "${serverFn.name}" failed to start at port ${port}`)
      logger.warn(err.stack)
      reject(err)
    })

    server.terminate = () => new Promise(resolve => {
      server.on('close', async () => {
        await sleep(5)
        resolve()
      })
      server.close()
    })
    
    server.listen(port, () => {
      server.port = port
      server.name = serverFn.name
      logger.debug(`proxy server "${serverFn.name}" listening on ${port}`)
      resolve(server)
    })
  })
}

