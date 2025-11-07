import http from 'node:http'
import readStream from './read-stream.js'
import HttpError from './http-error.js'
import Logger from '../../utils/logger.js'
import fs from 'node:fs'
import { detectContentType } from '../registry/content-type-detector.js'

const logger = new Logger({ logGroup: 'http-primitives' })

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function prependServiceNameToErrorStack(err, serviceName) {
  // helpful for cascading errors

  let errFrags = err.stack.split('\n')
  errFrags.splice(1, 0, `in service "${serviceName}"`)
  err.stack = errFrags.join('\n')
}

function overrideResponse(response) {
  response.isEnded = false
  const originalEnd = response.end.bind(response)
  response.end = (sanitizedPayload) => {
    // logger.info('response.end', { type: typeof sanitizedPayload, isBuffer: Buffer.isBuffer(sanitizedPayload) })
    if (!Buffer.isBuffer(sanitizedPayload) && typeof sanitizedPayload === 'object')
      sanitizedPayload = JSON.stringify(sanitizedPayload)
    
    if (!response.isEnded) originalEnd.call(response, sanitizedPayload)
    else logger.warn('response already ended', { port, name: serverFn.name })
    response.isEnded = true
  }
  return response
}

export default async function createServer(port, serverFn, options = {}) {
  if (!port) throw new Error('"port" is required')
  if (!serverFn) throw new Error('"serverFn" is required')

  const { streamPayload = false } = options

  return new Promise((resolve, reject) => {
    // Use modern HTTP server options for better performance
    const server = http.createServer({
      // Enable keep-alive connections for better performance
      keepAlive: true,
      keepAliveInitialDelay: 0,
      // Set reasonable timeouts
      requestTimeout: 60000,
      headersTimeout: 30000, // NOTE can't exceed requestTimeout
    }, async (request, response) => {
      response = overrideResponse(response) // TODO VERIFY
      try {
        let body
        const contentType = request.headers['content-type'] || ''
        
        // Auto-detect if we should stream based on content-type (for multipart uploads)
        const shouldStream = streamPayload || contentType.includes('multipart/')
        
        // If streamPayload is true or multipart detected, don't buffer the request
        if (shouldStream) {
          body = null
        } else {
          body = await readStream(request)
          
          // Determine if we should parse as JSON based on content-type
          // Binary content types should NOT be parsed as JSON
          const isBinaryContent = contentType.includes('octet-stream') ||
                                 contentType.includes('audio/') ||
                                 contentType.includes('video/') ||
                                 contentType.includes('image/')
          
          // Parse body as JSON if it's not binary
          if (!isBinaryContent && body && body.length > 0) {
            try { 
              // Convert buffer to string, then parse as JSON
              const bodyStr = Buffer.isBuffer(body) ? body.toString('utf8') : body
              body = JSON.parse(bodyStr)
            } catch (err) { 
              // If JSON parsing fails, keep as-is (could be plain text or buffer)
            }
          }
        }
        
        let result = await server.handler(body, request, response)
        if (result instanceof fs.ReadStream) {
          return result.pipe(response) // TODO VERIFY THIS WORKS
        } else if (result !== false) {
          // Determine content type and body based on result type
          let contentType = 'application/json'
          let responseBody = result
          
          if (Buffer.isBuffer(result)) {
            // Binary data - send as-is
            contentType = 'application/octet-stream'
            responseBody = result
          } else if (typeof result === 'string') {
            // Strings - detect if HTML, XML, JSON, or plain text
            if (!response.getHeader('content-type')) {
              contentType = detectContentType(result, request.url)
            }
            responseBody = result
          } else {
            // Everything else (objects, arrays, numbers, booleans, null) - send as JSON
            // This preserves type information (numbers stay numbers, booleans stay booleans, etc.)
            contentType = 'application/json'
            responseBody = JSON.stringify(result)
          }
          
          response.writeHead(200, {
            'content-type': contentType,
            // Modern security headers
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'x-xss-protection': '1; mode=block'
          })
          response.end(responseBody)
        } // else logger.warn('nothing returned from server handler', {port, name: serverFn.name})
      } catch (err) {
        if (err instanceof HttpError) {
          prependServiceNameToErrorStack(err, serverFn.name)
          // response.setHeader('x-correlation-id', generateId()) // TODO?
          if (!response.writableEnded) {
            response.setHeader('content-type', 'text/plain')
            response.writeHead(err.status || 500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', {port, name: serverFn.name})
            logger.error(err.stack)
          }
        } else {
          if (!response.writableEnded) {
            response.setHeader('content-type', 'text/plain')
            response.writeHead(500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', {port, name: serverFn.name})
            logger.error(err.stack)
          }
        }
      }
    })

    // store our handler so we can override w/ "middleware"
    server.handler = serverFn

    server.on('error', err => {
      logger.warn(`server "${serverFn.name}" failed to start at port ${port}`)
      logger.warn(err.stack)
      reject(err)
    })

    server.terminate = () => new Promise(resolve => {
      server.on('close', async () => {
        // I hate this, but for some reason, in tests,
        // terminating and restarting causes subsequent create-service registrations to fail.
        // This should permit whatever outlying OS network freeing outside nodejs
        await sleep(5) // TODO
        // not having sleep currently only fails testRouteMissingService
        resolve()
      })
      server.close()
    })
    
    server.listen(port, () => {
      server.port = port
      server.name = serverFn.name
      logger.debug(`server "${serverFn.name}" listening on ${port}`)
      resolve(server)
    })
  })
}
