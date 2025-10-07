/**
 * Registry Module Tests
 * Tests for the refactored registry modules
 */

import { assert } from '../core/assert.js'
import { Buffer } from 'node:buffer'

// Module imports
import { 
  createRegistryState, 
  resetState, 
  setToArray, 
  serializeServicesMap 
} from '../../src/micro-core/registry/registry-state.js'

import { 
  isJsonString, 
  detectFromBuffer, 
  detectContentType 
} from '../../src/micro-core/registry/content-type-detector.js'

import { 
  getServiceAddresses, 
  selectServiceLocation,
  resetRoundRobinState
} from '../../src/micro-core/registry/load-balancer.js'

import { 
  subscribe, 
  unsubscribe,
  removeAllSubscriptionsForLocation
} from '../../src/micro-core/registry/pubsub-manager.js'

import { 
  allocateServicePort,
  registerService,
  unregisterService,
  findServiceLocation
} from '../../src/micro-core/registry/service-registry.js'

import { 
  registerDirectRoute,
  registerControllerRoute,
  registerRoute,
  findControllerRoute,
  getAllRoutes
} from '../../src/micro-core/registry/route-registry.js'

// --- Registry State Tests ---

async function testCreateRegistryState() {
  const state = createRegistryState()
  await assert(state,
    s => s.services instanceof Map,
    s => s.addresses instanceof Map,
    s => s.routes instanceof Map,
    s => s.controllerRoutes instanceof Map,
    s => s.domainPorts instanceof Map,
    s => s.subscriptions instanceof Map,
    s => s.services.size === 0
  )
}

async function testResetState() {
  const state = createRegistryState()
  state.services.set('test', new Set(['loc1']))
  state.addresses.set('loc1', 'test')
  state.routes.set('/api', { service: 'test' })
  
  resetState(state)
  
  await assert(state,
    s => s.services.size === 0,
    s => s.addresses.size === 0,
    s => s.routes.size === 0
  )
}

async function testSetToArray() {
  const mySet = new Set(['a', 'b', 'c'])
  const result = setToArray(mySet)
  
  await assert(result,
    r => Array.isArray(r),
    r => r.length === 3,
    r => r.includes('a') && r.includes('b') && r.includes('c')
  )
}

async function testSerializeServicesMap() {
  const state = createRegistryState()
  state.services.set('service1', new Set(['loc1', 'loc2']))
  state.services.set('service2', new Set(['loc3']))
  
  const result = serializeServicesMap(state.services)
  
  await assert(result,
    r => Array.isArray(r.service1),
    r => r.service1.length === 2,
    r => Array.isArray(r.service2),
    r => r.service2.length === 1
  )
}

// --- Content Type Detector Tests ---

async function testIsJsonString() {
  await assert(true,
    () => isJsonString('{"key":"value"}') === true,
    () => isJsonString('[1,2,3]') === true,
    () => isJsonString('not json') === false,
    () => isJsonString('{incomplete') === false
  )
}

async function testDetectFromBuffer() {
  const buf = Buffer.from('test')
  await assert(true,
    () => detectFromBuffer(buf) === 'application/octet-stream',
    () => detectFromBuffer('string') === null,
    () => detectFromBuffer({ key: 'value' }) === null
  )
}

async function testDetectContentType() {
  await assert(true,
    () => detectContentType('{"key":"value"}') === 'application/json',
    () => detectContentType('<html><body>test</body></html>') === 'text/html',
    () => detectContentType('<root>test</root>', '/api/data.xml') === 'application/xml',
    () => detectContentType('plain text here') === 'text/plain',
    () => detectContentType(Buffer.from('binary')) === 'application/octet-stream'
  )
}

// --- Load Balancer Tests ---

async function testGetServiceAddresses() {
  const state = createRegistryState()
  state.services.set('myService', new Set(['loc1', 'loc2', 'loc3']))
  
  const result = getServiceAddresses(state, 'myService')
  
  await assert(result,
    r => Array.isArray(r),
    r => r.length === 3,
    r => r.includes('loc1') && r.includes('loc2') && r.includes('loc3')
  )
}

async function testSelectServiceLocationRandom() {
  const state = createRegistryState()
  state.services.set('myService', new Set(['loc1', 'loc2', 'loc3']))
  
  const result = selectServiceLocation(state, 'myService', 'random')
  
  await assert(result,
    r => typeof r === 'string',
    r => ['loc1', 'loc2', 'loc3'].includes(r)
  )
}

async function testSelectServiceLocationRoundRobin() {
  resetRoundRobinState()
  const state = createRegistryState()
  state.services.set('myService', new Set(['loc1', 'loc2', 'loc3']))
  
  const results = []
  for (let i = 0; i < 6; i++) {
    results.push(selectServiceLocation(state, 'myService', 'round-robin'))
  }
  
  await assert(results,
    r => r.includes('loc1') && r.includes('loc2') && r.includes('loc3'),
    r => r[0] === r[3],  // Pattern repeats
    r => r[1] === r[4],
    r => r[2] === r[5]
  )
}

// --- PubSub Manager Tests ---

async function testPubSubSubscribe() {
  const state = createRegistryState()
  subscribe(state, { type: 'myType', location: 'loc1' })
  
  await assert(state,
    s => s.subscriptions.has('myType'),
    s => s.subscriptions.get('myType').has('loc1')
  )
}

async function testPubSubUnsubscribe() {
  const state = createRegistryState()
  subscribe(state, { type: 'myType', location: 'loc1' })
  subscribe(state, { type: 'myType', location: 'loc2' })
  
  unsubscribe(state, { type: 'myType', location: 'loc1' })
  
  await assert(state,
    s => s.subscriptions.get('myType').size === 1,
    s => !s.subscriptions.get('myType').has('loc1'),
    s => s.subscriptions.get('myType').has('loc2')
  )
}

async function testRemoveAllSubscriptionsForLocation() {
  const state = createRegistryState()
  subscribe(state, { type: 'type1', location: 'loc1' })
  subscribe(state, { type: 'type2', location: 'loc1' })
  subscribe(state, { type: 'type2', location: 'loc2' })
  
  removeAllSubscriptionsForLocation(state, 'loc1')
  
  await assert(state,
    s => !s.subscriptions.has('type1'),
    s => !s.subscriptions.get('type2').has('loc1'),
    s => s.subscriptions.get('type2').has('loc2')
  )
}

// --- Service Registry Tests ---

async function testAllocateServicePort() {
  const state = createRegistryState()
  
  const loc1 = allocateServicePort(state, { 
    service: 'svc1', 
    domain: 'http://localhost' 
  }, 10000)
  
  const loc2 = allocateServicePort(state, { 
    service: 'svc2', 
    domain: 'http://localhost' 
  }, 10000)
  
  await assert(true,
    () => loc1 === 'http://localhost:10000',
    () => loc2 === 'http://localhost:10001'
  )
}

async function testRegisterService() {
  const state = createRegistryState()
  
  await registerService(state, { 
    service: 'myService', 
    location: 'http://localhost:10000' 
  })
  
  await assert(state,
    s => s.services.has('myService'),
    s => s.services.get('myService').has('http://localhost:10000'),
    s => s.addresses.get('http://localhost:10000') === 'myService'
  )
}

async function testUnregisterService() {
  const state = createRegistryState()
  state.services.set('svc', new Set(['loc1', 'loc2']))
  state.addresses.set('loc1', 'svc')
  state.addresses.set('loc2', 'svc')
  
  unregisterService(state, { service: 'svc', location: 'loc1' })
  
  await assert(state,
    s => !s.services.get('svc').has('loc1'),
    s => s.services.get('svc').has('loc2'),
    s => !s.addresses.has('loc1')
  )
}

async function testFindServiceLocation() {
  const state = createRegistryState()
  state.services.set('svc1', new Set(['loc1']))
  state.services.set('svc2', new Set(['loc2']))
  
  const result = findServiceLocation(state, 'all')
  
  await assert(result,
    r => typeof r === 'object',
    r => Array.isArray(r.svc1),
    r => r.svc1[0] === 'loc1',
    r => r.svc2[0] === 'loc2'
  )
}

// --- Route Registry Tests ---

async function testRegisterDirectRoute() {
  const state = createRegistryState()
  
  registerDirectRoute(state, { 
    service: 'myService', 
    path: '/api/users',
    dataType: 'application/json'
  })
  
  await assert(state,
    s => s.routes.has('/api/users'),
    s => s.routes.get('/api/users').service === 'myService',
    s => s.routes.get('/api/users').dataType === 'application/json'
  )
}

async function testRegisterControllerRoute() {
  const state = createRegistryState()
  
  registerControllerRoute(state, { 
    service: 'myService', 
    path: '/api/users/*'
  })
  
  await assert(state,
    s => s.controllerRoutes.has('/api/users/'),
    s => s.controllerRoutes.get('/api/users/').service === 'myService'
  )
}

async function testRegisterRouteAutoDetect() {
  const state = createRegistryState()
  
  registerRoute(state, { service: 'svc1', path: '/exact' })
  registerRoute(state, { service: 'svc2', path: '/prefix/*' })
  
  await assert(state,
    s => s.routes.has('/exact'),
    s => s.controllerRoutes.has('/prefix/')
  )
}

async function testFindControllerRoute() {
  const state = createRegistryState()
  state.controllerRoutes.set('/api/', { service: 'apiService' })
  state.controllerRoutes.set('/admin/', { service: 'adminService' })
  
  const result1 = findControllerRoute(state, '/api/users/123')
  const result2 = findControllerRoute(state, '/admin/dashboard')
  const result3 = findControllerRoute(state, '/other/path')
  
  await assert(true,
    () => result1.service === 'apiService',
    () => result2.service === 'adminService',
    () => result3 === null
  )
}

async function testGetAllRoutes() {
  const state = createRegistryState()
  registerRoute(state, { service: 'svc1', path: '/exact' })
  registerRoute(state, { service: 'svc2', path: '/prefix/*' })
  
  const result = getAllRoutes(state)
  
  await assert(result,
    r => typeof r.routes === 'object',
    r => typeof r.controllerRoutes === 'object',
    r => r.routes['/exact'].service === 'svc1',
    r => r.controllerRoutes['/prefix/'].service === 'svc2'
  )
}

// Export all test functions
export default {
  // State tests
  testCreateRegistryState,
  testResetState,
  testSetToArray,
  testSerializeServicesMap,
  
  // Content type tests
  testIsJsonString,
  testDetectFromBuffer,
  testDetectContentType,
  
  // Load balancer tests
  testGetServiceAddresses,
  testSelectServiceLocationRandom,
  testSelectServiceLocationRoundRobin,
  
  // PubSub tests
  testPubSubSubscribe,
  testPubSubUnsubscribe,
  testRemoveAllSubscriptionsForLocation,
  
  // Service registry tests
  testAllocateServicePort,
  testRegisterService,
  testUnregisterService,
  testFindServiceLocation,
  
  // Route registry tests
  testRegisterDirectRoute,
  testRegisterControllerRoute,
  testRegisterRouteAutoDetect,
  testFindControllerRoute,
  testGetAllRoutes
}
