import { createService } from 'micro-js'

console.log({env: process.env})

createService(async function service2(payload = {}) {
  payload.service2 = true
  return this.call('service3', payload)
})
.catch(err => console.error(err))
