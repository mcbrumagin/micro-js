#!/usr/bin/env node

/**
 * Mixed Node.js + Python Example
 * Demonstrates Node.js and Python services working together
 */

import { createService, callService } from '../../src/index.js'

// Set registry URL
process.env.MICRO_REGISTRY_URL = process.env.MICRO_REGISTRY_URL || 'http://localhost:3000'

console.log('Starting Node.js services...')
console.log(`Registry URL: ${process.env.MICRO_REGISTRY_URL}`)

// Create a Node.js service that calls Python services
await createService(async function nodeToPythonService(payload) {
  console.log('Node service received:', payload)
  
  // Call Python simple-service
  try {
    const result = await this.call('simple-service', {
      name: 'Node.js Caller'
    })
    
    return {
      service: 'nodeToPythonService',
      language: 'Node.js',
      calledPythonService: 'simple-service',
      pythonResponse: result,
      originalPayload: payload
    }
  } catch (err) {
    return {
      service: 'nodeToPythonService',
      error: err.message,
      message: 'Make sure Python simple-service is running'
    }
  }
})

// Create a Node.js service that publishes to channels Python services subscribe to
await createService(async function nodePublisher(payload) {
  const channel = payload.channel || 'test-channel'
  const message = payload.message || { source: 'Node.js', data: 'Hello Python!' }
  
  console.log(`Publishing to ${channel}:`, message)
  
  // Publish message
  const result = await this.publish(channel, message)
  
  return {
    service: 'nodePublisher',
    language: 'Node.js',
    published: true,
    channel,
    message,
    result
  }
})

// Create a Node.js service that can be called from Python
await createService(async function nodeService(payload) {
  console.log('Node service called by:', payload.from || 'unknown')
  
  return {
    service: 'nodeService',
    language: 'Node.js',
    message: 'Hello from Node.js!',
    receivedPayload: payload,
    timestamp: new Date().toISOString()
  }
})

console.log('\n✓ Node.js services running:')
console.log('  - nodeToPythonService (calls Python services)')
console.log('  - nodePublisher (publishes to channels)')
console.log('  - nodeService (can be called from Python)')
console.log('\nNow start Python services with:')
console.log('  python simple-service.py')
console.log('  python service-with-calls.py')
console.log('\nPress Ctrl+C to stop...')

