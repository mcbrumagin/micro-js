import { createService } from 'micro-js'

console.log({env: process.env})

createService(async function messagePublisherService (payload = {}) {
  payload.messagePublisherService = true
  this.publish('global-event', payload)
})
.catch(err => console.error(err))
