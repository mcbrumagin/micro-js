import http from 'node:http'
import readStream from './read-stream.js'
import HttpError from './http-error.js'
import Logger from '../utils/logger.js'
import fs from 'node:fs'

const logger = new Logger()

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
    if (!Buffer.isBuffer(sanitizedPayload) && typeof sanitizedPayload === 'object')
      sanitizedPayload = JSON.stringify(sanitizedPayload)
    
    if (!response.isEnded) originalEnd.call(response, sanitizedPayload)
    else logger.warn('response already ended')
    response.isEnded = true
  }
  return response
}

export default async function createServer(port, serverFn) {
  if (!port) throw new Error('"port" is required')
  if (!serverFn) throw new Error('"serverFn" is required')

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
        let body = await readStream(request)
        try { body = JSON.parse(body) } catch (err) { /* don't care */ }
        let result = await serverFn(body, request, response)
        if (result instanceof fs.ReadStream) {
          return result.pipe(response) // TODO VERIFY THIS WORKS
        } else if (result !== false) {
          response.writeHead(200, {
            'content-type': 'application/json',
            // Modern security headers
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'x-xss-protection': '1; mode=block'
          })
          response.end(JSON.stringify(result))
        } // else logger.warn('nothing returned from server handler', {port, name: serverFn.name})
      } catch (err) {
        if (err instanceof HttpError) {
          prependServiceNameToErrorStack(err, serverFn.name)
          // response.setHeader('x-correlation-id', generateId()) // TODO?
          if (!response.writableEnded) { // TODO is this needed?
            response.writeHead(err.status || 500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', {port, name: serverFn.name})
          }
        } else {
          if (!response.writableEnded) {
            response.writeHead(500)
            response.end(err.stack)
          } else {
            logger.warn('response already ended', {port, name: serverFn.name})
          }
        }
      }
    })

    server.on('error', err => {
      logger.error(`server "${serverFn.name}" failed to start`)
      reject(err)
    })

    server.terminate = () => new Promise(resolve => {
      server.on('close', async () => {
        // I hate this, but for some reason, in tests,
        // terminating and restarting causes subsequent create-service registrations to fail.
        // This should permit whatever outlying OS network freeing outside nodejs
        await sleep(5) // TODO
        resolve()
      })
      server.close()
    })
    
    server.listen(port, () => {
      logger.debug(`server "${serverFn.name}" listening on ${port}`)
      resolve(server)
    })
  })
}
