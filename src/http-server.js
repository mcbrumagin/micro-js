import http from 'node:http'
import readStream from './read-stream.js'
import HttpError from './http-error.js'
import Logger from './logger.js'

const logger = new Logger()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function prependServiceNameToErrorStack(err, serviceName) {
  // helpful for cascading errors

  // console.log({err, serviceName})
  let errFrags = err.stack.split('\n')
  errFrags.splice(1, 0, `in service "${serviceName}"`)
  err.stack = errFrags.join('\n')
  // if (err.stack.includes('Object.testService2')) {
    // console.log({err, serviceName})
    // process.exit(1)
  // }
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
      try {
        let body = await readStream(request)
        try { body = JSON.parse(body) } catch (err) { /* don't care */ }
        let result = await serverFn(body, request, response)
        if (result !== false) {
          response.writeHead(200, {
            'content-type': 'application/json',
            // Modern security headers
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'DENY',
            'x-xss-protection': '1; mode=block'
          })
          response.end(JSON.stringify(result))
        } // else console.warn('nothing returned from server handler', {port, name: serverFn.name})
      } catch (err) {
        // console.log({ err })
        if (err instanceof HttpError) {
          prependServiceNameToErrorStack(err, serverFn.name)
          // response.setHeader('x-correlation-id', generateId()) // TODO?
          response.writeHead(err.status || 500)
          response.end(err.stack)
        } else {
          response.writeHead(500)
          response.end(err.stack)
        }
      }
    })

    server.on('error', err => {
      // console.log(`server "${serverFn.name}" failed to start`)
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

    // console.log({port, serverFn})
    server.listen(port, () => {
      logger.trace(`server "${serverFn.name}" listening on ${port}`)
      resolve(server)
    })
  })
}
