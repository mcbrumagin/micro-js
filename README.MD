# micro-js

# Todo before version 1 [MVP]
- remove deployers/ci (new package?)
- many more integration tests
- units tests for individual (especially essential) modules
- automatic registry updates on service failure (services unregister each other on each other's behalf)
- finalize cluster and failover paradigms
  - implementation may depend on testing and complexity
  - mode for each service to act as a registry?
  - or just the ability for multiple registry servers to talk to each other?
  - cache registered services on every other service?
- logger systems
  - features for distributed microservices
  - consistent output based on various nodejs built-ins
  - ability to use logger on client, and to print client logs to server
- production mode
  - optionally disable client logs
  - disable production error cascades on clients
  - option to create minified client code
  - more strict enforcement of other configurations
- basic central logging and metrics service
- move/remove unnecessary modules

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

# Rough Roadmap
- break out parts of the system to their own repos/modules as needed
- consider peer dependencies for lower-level ones that are used throughout (especially logger)
- ability to easily deploy services/registry to cluster/swarm/kube/AWS/Azure/GCP/etc
- cpu/io tests at scale
- robust automation topology
  - registries (service and route resolution)
  - services (apis, agents, jobs)
  - sources (databases, caches, state)
  - digestors (logging, metrics, telemetry)
  - equalizers (resourece-aware load-balancer)? depending on multi-registry testing
- master declarative deploy record to use as ground truth
- soak/memory tests
- various connectors and adaptors for sources to services and digestors
- basic document-style eventually consistent nosql database (like a functional mongodb)
- create polyglot libraries that mirror the createService/callService fns
- dedicated load-balancer with usage updates for services?
