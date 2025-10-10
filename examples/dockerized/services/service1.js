import { createService } from 'micro-js'

console.log({env: process.env})

createService(async function service1(payload = {}) {
  payload.service1 = true
  return this.call('service2', payload)
})
.catch(err => console.error(err))
