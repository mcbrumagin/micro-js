# micro-js

# Todo for v1 [MVP]
- cli tools & tests
- cluster failover paradigms
- multi-container integration tests
- production mode (no error traces in routes)
- basic access control

## General Notes
- easily create functional microservices
- registry server tracks all microservice locations
- minimal configuration
  - MICRO_REGISTRY_URL (all containers)
  - MICRO_SERVICE_URL for each containerized service
- see examples and tests for usage

## Basic Setup

```sh
export MICRO_REGISTRY_URL=http://localhost:8000
npm install micro-js
touch micro-app.js # fill this in with the below code example
node micro-app.js
```

## Basic Usage
```javascript
const {
  registryServer,
  createService,
  callService
} = require('micro-js')

async function run() {
  await registryServer()

  // creates a seprate http server on the same nodejs thread
  await createService(function helloService(payload) {
    payload.message = 'hello'
    return this.call('worldService', payload)
  })

  await createService(function worldService(payload) {
    payload.message += ' world!'
    return payload
  })

  let result = await callService('helloService', {})
  console.log(`Message: ${result.message}`)
}
run()
.then(() => console.log('ready!'))
```

You can also easily create routes that target services:
```javascript
const {
  registryServer,
  createRoute
} = require('micro-js')

async function run() {
  await registryServer()

  // create route also creates a service in the background if you include a function
  await createRoute('/hello', function helloWorldService(payload) {
    return 'hello world!'
  }) // go to MICRO_REGISTRY_URL/hello in browser

  // a route by itself is simply a mapping in the registry
  await createRoute('/sup', 'helloWorldService')
  // go to MICRO_REGISTRY_URL/sup in browser
}

run()
.then(() => console.log('ready!'))
```
