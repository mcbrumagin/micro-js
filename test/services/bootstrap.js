import { registryServer } from '../../src/index.js'
import cacheService from '../../src/micro-services/cache-service.js'
// import pubsubService from './src/micro-services/pubsub-service.js'

async function main() {
  await registryServer()
  await cacheService({ expireTime: 10000, evictionInterval: 1000 })
  // await pubsubService()
}

main().catch(err => console.error(err))
