#!/usr/bin/env node

/**
 * Example CLI usage of publishMessage
 * 
 * Usage:
 *   export MICRO_REGISTRY_URL=http://localhost:10000
 *   node examples/pubsub-cli-example.js myChannel '{"hello":"world"}'
 */

import { publishMessage } from '../../src/index.js'

async function main() {
  const [,, channel, messageJson] = process.argv

  if (!channel || !messageJson) {
    console.error('Usage: node pubsub-cli-example.js <channel> <json-message>')
    console.error('Example: node pubsub-cli-example.js myChannel \'{"hello":"world"}\'')
    process.exit(1)
  }

  try {
    const message = JSON.parse(messageJson)
    console.log(`Publishing to channel "${channel}":`, message)
    
    const result = await publishMessage(channel, message)
    
    console.log('\n Published successfully!')
    console.log(`  Subscribers notified: ${result.results?.length || 0}`)
    
    if (result.results?.length > 0) {
      console.log('\nResponses:')
      result.results.forEach((response, i) => {
        console.log(`  [${i + 1}]`, JSON.stringify(response, null, 2))
      })
    }
    
    if (result.errors?.length > 0) {
      console.log('\nErrors:')
      result.errors.forEach((error, i) => {
        console.log(`  [${i + 1}]`, error)
      })
    }
    
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()

