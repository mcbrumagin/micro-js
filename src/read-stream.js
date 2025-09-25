export default async function readStream(stream) {
  return new Promise((resolve, reject) => {
    let result = ''
    stream.on('data', data => result += data)
    stream.on('error', err => reject(err))
    stream.on('end', err => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}
