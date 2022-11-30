const http = require('http')
const readStream = require('./read-stream.js')

module.exports = async function createServer(port, fn) {
  if (!port) throw new Error('"port" is required')
  if (!fn) throw new Error('"fn" is required')
  if (!fn.name) throw new Error('Server handler cannot not be an anonymous function')

  // console.log(`starting "${fn.name}" on ${port}`)
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        let body = await readStream(request)
        try { body = JSON.parse(body) } catch (err) { /* don't care */ }
        let result = await fn(body, request, response)
        if (result !== false) {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify(result))
        }
      } catch (err) {
        console.error(err.stack)
        response.writeHead(500)
        response.end(err.stack)
      }
    })

    server.listen(port, () => {
      // console.log(`server "${fn.name}" listening on ${port}`)
      resolve(server)
    })

    server.on('error', err => {
      // console.log(`server "${fn.name}" failed to start`)
      reject(err)
    })

    server.terminate = () => new Promise(resolve => {
      server.on('close', resolve)
      server.close()
    })

    return server
  })
}
