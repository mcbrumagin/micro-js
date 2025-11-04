const { createService } = require('micro-js')

createService(async function service1(payload = {}) {
  payload.service1 = true
  return this.call('service2', payload)
})
.catch(err => console.error(err))
