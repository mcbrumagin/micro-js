const http = require('http')
const readStream = require('./read-stream.js')
const HttpError = require('./http-error.js')

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

module.exports = async function createServer(port, fn) {
  if (!port) throw new Error('"port" is required')
  if (!fn) throw new Error('"fn" is required')
  // if (!fn.name) throw new Error('Server handler cannot not be an anonymous function')

  // console.log(`starting "${fn.name}" on ${port}`)
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        let body = await readStream(request)
        try { body = JSON.parse(body) } catch (err) { /* don't care */ }
        let result = await fn(body, request, response)
        if (result !== false) {
          response.writeHead(200, {
            'content-type': 'application/json',
            // 'access-control-allow-origin': '*' // TODO REMOVE?
          })
          response.end(JSON.stringify(result))
        } // else console.warn('nothing returned from server handler', {port, name: fn.name})
      } catch (err) {
        // console.log({ err })
        if (err instanceof HttpError) {
          prependServiceNameToErrorStack(err, fn.name)
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
      // console.log(`server "${fn.name}" failed to start`)
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

    // console.log({port, fn})
    server.listen(port, () => {
      console.log(`server "${fn.name}" listening on ${port}`)
      resolve(server)
    })
  })
}
