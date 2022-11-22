const {
  registryServer,
  createService,
  callService
} = require('micro-js')

function stackTest1 () {
  throw new Error('test')
}
Promise.all([
  registryServer(),
  createService(async function service1(payload = {}) {
    payload.service1 = true
    return this.call('service2', payload)
  }),
  createService(async function service2(payload = {}) {
    payload.service2 = true
    return this.call('service3', payload)
  }),
  createService(async function service3(payload = {}) {
    payload.service3 = true

    if (payload.failOn3) stackTest1()
    return payload
  })
])
// .then(async () => {
//   let result = await callService('service1', { test: 'payload' })
//   console.log(`RESULT: ${JSON.stringify(result, null, 2)}`)
// })
// .catch(err => console.error(err))
