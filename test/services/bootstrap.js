import { registryServer, createService, createRoutes, callService } from '../../src/index.js'
import createCacheService from '../../src/micro-services/cache-service.js'
import createPubsubService from '../../src/micro-services/pubsub-service.js'
import createStaticFileService from '../../src/micro-services/static-file-service.js'
import createFileUploadService from '../../src/micro-services/file-upload-service/file-upload-service.js'
import { overrideConsoleGlobally } from '../../src/index.js'
import path from 'node:path'

overrideConsoleGlobally({
  includeLogLineNumbers: true,
  // in
})

async function main() {
  let registry = await registryServer()
  let cacheService = await createCacheService({ expireTime: 10000, evictionInterval: 1000 })
  let pubsubService = await createPubsubService()
  let staticFileService = await createStaticFileService({ rootDir: 'files', fileMap: { '/': 'index.html' } })


  // TODO update dir handling similar to static file service
  let fileUploadService = await createFileUploadService({
    uploadDir: path.join(process.cwd(), 'files'),
    fileFieldName: 'file'
  })

  const getHealth = () => ({ status: 'ok' })
  // make the services publicly accessible
  await createRoutes({
    '/upload/*': fileUploadService,
    '/*': staticFileService,
    '/health': getHealth
  })

  // cache service example
  await cacheService.set('test', 'Hello from cache!')
  console.info(`cache value: ${await cacheService.get('test')}`)


  // pubsub service example
  await pubsubService.subscribe('test', async (message) => {
    console.info(`subscription received message: ${JSON.stringify(message)}`)
  })
  await pubsubService.publish('test', { data: 'Hello subscribers!' })
  
  await pubsubService.subscribe('test', async (message) => {
    console.info(`subscription2 received message: ${JSON.stringify(message)}`)
  })
  await pubsubService.publish('test', { data: 'Hello subscribers!' })


  // static file service example
  console.info(`file: ${await staticFileService.getFile({ url: '/' })}`)
  

  // custom service example
  let fileCacheService = await createService('custom-file-cache-service', async function customFileCache(payload) {
    if (!payload.url) throw new Error('url is required')

    const prependCacheNamespace = key => `fileCache:${key}`
    let file = await cacheService.get(prependCacheNamespace(payload.url))
    if (file) {
      console.info(`custom file cache service - returning cached file for url: ${payload.url}`)
      return file
    } else {
      console.info(`custom file cache service - fetching file for url: ${payload.url}`)
      file = await staticFileService.getFile(payload)
      cacheService.set(prependCacheNamespace(payload.url), file)
      return file
    }
  })

  console.info(`custom file cache service initial call`)
  await callService('custom-file-cache-service', { url: '/' })

  console.info(`custom file cache service call 2`)
  await callService('custom-file-cache-service', { url: '/' })



  process.once('SIGINT', async () => {
    try {
      await fileCacheService.terminate()
      await cacheService.terminate()
      await pubsubService.terminate()
      await staticFileService.terminate()
      await fileUploadService.terminate()

      // terminate the registry last
      await registry.terminate()
    } catch (err) {
      console.error(err)
    }
    process.exit(0)
  })
}

main().catch(err => console.error(err))
