import { createService } from 'micro-js'

console.log({env: process.env})

createService(async function service3(payload = {}) {
  payload.service3 = true
  return payload
})
.catch(err => console.error(err))
