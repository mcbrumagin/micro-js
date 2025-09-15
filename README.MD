# micro-js

# TODO before version udpate
- remove deployers/ci (new package?)
- more tests
- remove this markdown block

- ability to easily deploy services/registry to cluster/swarm/kube
- try running scaled-out compute intensive code
- possibly call into rust or other polyglot services
- possibly ML processes


## General Notes
- easily create functional microservices
- registry server tracks all microservice locations
- minimal configuration, just need SERVICE_REGISTRY_ENDPOINT (host:port)
- ideal for vms or containers, especially swarms/orchestrators
- see examples and tests for usage

## Basic Usage
```javascript:
const {
  registryServer,
  createService,
  callService
} = require('micro-js')

async function run() {
  // assumes cli has env var SERVICE_REGISTRY_ENDPOINT=<host>:<port>
  await registryServer()

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
```javascript:
const {
  registryServer,
  createRoute
} = require('micro-js')

async function run() {
  // assumes cli has env var SERVICE_REGISTRY_ENDPOINT=<host>:<port>
  await registryServer()

  // create route also creates a service in the background if you include a function
  await createRoute('/hello', function helloWorldService(payload) {
    return 'hello world!'
  }) // go to SERVICE_REGISTRY_ENDPOINT/hello in browser

  // a route by itself is simply a mapping in the registry
  await createRoute('/sup', 'helloWorldService')
  // go to SERVICE_REGISTRY_ENDPOINT/sup in browser
}
run()
.then(() => console.log('ready!'))
```

## Overview
The real power of micro-js is unlocked when the registryServer and createService calls are deployed on separate containers, especially using container orchestration.

Each new service calls the registry server on startup with its location. The registry pushes its location lookup table to all services when new services register with it. So, when a service needs to call another service, it checks its local lookup table and simply calls the other service directly.
