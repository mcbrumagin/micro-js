const {
  registryServer,
  createService,
  callService
} = require('micro-js')

Promise.all([
  registryServer(),
  createService(function service1(payload = {}) {
    payload.service1 = true
    return this.call('service2', payload)
  }),
  createService(function service2(payload = {}) {
    payload.service2 = true
    return this.call('service3', payload)
  }),
  createService(function service3(payload = {}) {
    payload.service3 = true
    return payload
  })
])
.then(async () => {
  let result = await callService('service1', { test: 'payload' })
  console.log(`RESULT: ${JSON.stringify(result, null, 2)}`)
})
.catch(err => console.error(err))
