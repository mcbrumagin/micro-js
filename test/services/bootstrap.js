import { registryServer } from '../../src/index.js'
import cacheService from '../../src/micro-services/cache-service.js'
import pubsubService from '../../src/micro-services/pubsub-service.js'

async function main() {
  await registryServer()
  await cacheService({ expireTime: 10000, evictionInterval: 1000 })
  let pubsub = await pubsubService()

  await pubsub.subscribe('test', async (message) => {
    console.log('Received:', message)
  })
  await pubsub.publish('test', { data: 'Hello subscribers!' })
  await pubsub.terminate()
  await pubsub.subscribe('test', async (message) => {
    console.log('Received:', message)
  })
  await pubsub.publish('test', { data: 'Hello subscribers!' })
}

main().catch(err => console.error(err))
