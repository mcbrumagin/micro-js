import { Buffer } from 'node:buffer'

export default async function readStream(stream) {
  return new Promise((resolve, reject) => {
    if (stream.readableEnded) return resolve(stream.read())
    else {
      let chunks = []
      stream.on('data', data => chunks.push(data))
      stream.on('error', err => reject(err))
      stream.on('end', err => {
        if (err) reject(err)
        else {
          // Concatenate and return as Buffer to preserve binary data
          // Caller will decide whether to parse as JSON or keep as Buffer
          const buffer = Buffer.concat(chunks)
          resolve(buffer)
        }
        // stream.body = result // NOTE: may be useful for debugging, but a bit of a functional code smell
      })
    }
  })
}
