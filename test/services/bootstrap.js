import { registryServer, createService, callService } from '../../src/index.js'
import cacheService from '../../src/micro-services/cache-service.js'
import pubsubService from '../../src/micro-services/pubsub-service.js'
import staticFileService from '../../src/micro-services/static-file-service.js'
import { overrideConsoleGlobally } from '../../src/index.js'

overrideConsoleGlobally({
  includeLogLineNumbers: true,
  // in
})

async function main() {
  let registry = await registryServer()
  let cache = await cacheService({ expireTime: 10000, evictionInterval: 1000 })
  let pubsub = await pubsubService()
  let staticFile = await staticFileService({ rootDir: 'files' })
  

  // cache service example
  await cache.set('test', 'Hello from cache!')
  console.info(`cache value: ${await cache.get('test')}`)


  // pubsub service example
  await pubsub.subscribe('test', async (message) => {
    console.info(`subscription received message: ${JSON.stringify(message)}`)
  })
  await pubsub.publish('test', { data: 'Hello subscribers!' })
  
  await pubsub.subscribe('test', async (message) => {
    console.info(`subscription2 received message: ${JSON.stringify(message)}`)
  })
  await pubsub.publish('test', { data: 'Hello subscribers!' })


  // static file service example
  console.info(`file: ${await staticFile.getFile({ url: '/' })}`)
  

  // custom service example
  let fileCache = await createService('test', async function customFileCache(payload) {
    if (!payload.url) throw new Error('url is required')

    const prependCacheNamespace = key => `fileCache:${key}`
    let file = await cache.get(prependCacheNamespace(payload.url))
    if (file) {
      console.info(`custom file cache service - returning cached file for url: ${payload.url}`)
      return file
    } else {
      console.info(`custom file cache service - fetching file for url: ${payload.url}`)
      file = await staticFile.getFile(payload)
      cache.set(prependCacheNamespace(payload.url), file)
      return file
    }
  })

  console.info(`custom file cache service initial call`)
  await callService('test', { url: '/' })

  console.info(`custom file cache service call 2`)
  await callService('test', { url: '/' })



  process.once('SIGINT', async () => {
    try {
      await cache.terminate()
      await pubsub.terminate()
      await staticFile.terminate()
      await fileCache.terminate()

      // terminate the registry last
      await registry.terminate()
    } catch (err) {
      console.error(err)
    }
    process.exit(0)
  })
}

main().catch(err => console.error(err))
