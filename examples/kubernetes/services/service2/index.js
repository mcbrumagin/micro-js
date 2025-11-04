const { createService } = require('micro-js')

createService(async function service2(payload = {}) {
  payload.service2 = true
  return this.call('service3', payload)
})
.catch(err => console.error(err))
