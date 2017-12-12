const http = require('http')
const readStream = require('./read-stream.js')

async function request(address, body) {
  let headers = { ['content-type']: 'application/json' }
  return new Promise((resolve, reject) => {
    try {
      let req = http.request({
        method: 'POST',
        host: address.split(':').slice(0,1).join(':'),
        port: address.split(':')[1],
        headers
      }, async res => {
        let result = await readStream(res)
        if (res.statusCode >= 400) reject(new Error(result))
        else {
          try {
            result = JSON.parse(result)
          } catch (err) { /* don't care */ }
          resolve(result)
        }
      })

      if (body) {
        body = JSON.stringify(body)
        req.write(body)
      }
      req.end()
      req.on('error', err => reject(err))
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = request
