export default async function readStream(stream) {
  return new Promise((resolve, reject) => {
    if (stream.readableEnded) return resolve(stream.read())
    else {
      let result = ''
      stream.on('data', data => result += data)
      stream.on('error', err => reject(err))
      stream.on('end', err => {
        if (err) reject(err)
        else resolve(result)
        // stream.body = result // NOTE: may be useful for debugging, but a bit of a functional code smell
      })
    }
  })
}
