import {
  registryServer,
  createService,
  createRoutes,
  callService,
  Logger,
  overrideConsoleGlobally,
  createSubscriptionService,
  publishMessage,
  HttpError
} from '../../src/index.js'
import createCacheService from '../../src/micro-services/cache-service.js'
import createStaticFileService from '../../src/micro-services/static-file-service.js'
import createFileUploadService from '../../src/micro-services/file-upload-service/file-upload-service.js'
import createAuthService from '../../src/micro-services/auth-service.js'
import path from 'node:path'
import { Readable } from 'node:stream'

// const logger = new Logger({ logGroup: 'bootstrap' })

overrideConsoleGlobally({
  includeLogLineNumbers: true
})

const testRawMultipartFile = `------geckoformboundary85c5b05d9412d0694e8082bfaef6fac3\r
Content-Disposition: form-data; name="file"; filename="test-upload-0.txt"\r
Content-Type: text/plain\r
\r
test-upload-1234\r
------geckoformboundary85c5b05d9412d0694e8082bfaef6fac3--\r
`

async function main() {
  let registry = await registryServer()
  let cacheService = await createCacheService({ expireTime: 10000, evictionInterval: 1000 })
  let authService = await createAuthService()
  
  // File upload service with automatic event publishing
  let fileUploadService = await createFileUploadService({
    uploadDir: path.join(process.cwd(), 'files'),
    fileFieldName: 'file',
    useAuthService: authService,
    publishFileEvents: true,  // Publish micro:file-updated events
    urlPathPrefix: '/files'  // URL path prefix for uploaded files
  })
  
  // Static file service with auto-refresh in hybrid mode
  // - PubSub: Real-time updates when files are uploaded via fileUploadService
  // - Interval: Periodic scanning for external file additions (every 30s)
  let staticFileService = await createStaticFileService({ 
    rootDir: 'files', 
    fileMap: { '/': 'index.html' },
    autoRefresh: {
      mode: 'hybrid',  // Both pubsub and interval
      updateChannel: 'micro:file-updated',
      deletionChannel: 'micro:file-deleted',
      intervalMs: 30000,  // Check for external changes every 30s
      onFileAdded: (fileInfo) => {
        console.info(`📁 File added to index: ${fileInfo.urlPath}`)
      },
      onRefreshComplete: (stats) => {
        console.info(`🔄 Index refreshed: +${stats.added} -${stats.removed} files (${stats.duration}ms)`)
      }
    }
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


  // pubsub example using standalone subscription
  const subscription1 = await createSubscriptionService('sub1', 'test', async (message) => {
    console.info(`subscription received message: ${JSON.stringify(message)}`)
  })
  
  const subscription2 = await createSubscriptionService('sub2', 'test', async (message) => {
    console.info(`subscription2 received message: ${JSON.stringify(message)}`)
  })
  
  await publishMessage('test', { data: 'Hello subscribers!' })


  // static file service example
  let file = await staticFileService.getFile('/')
  console.info(`file: ${file.slice(0, 100)}...\n<etc>\n...`)
  
  // Demonstrate auto-refresh API
  console.info('Static file service stats:', staticFileService.getIndexStats())
  
  // Manual refresh API (useful for build processes or external file changes)
  // await staticFileService.refreshIndex()  // Full rescan
  // await staticFileService.refreshPath('uploads')  // Rescan specific directory
  // staticFileService.addFile('/files/newfile.txt', './files/newfile.txt')  // Add single file
  // staticFileService.removeFile('/files/oldfile.txt')  // Remove file from index
  // staticFileService.pauseAutoRefresh()  // Pause interval scanning
  // staticFileService.resumeAutoRefresh()  // Resume interval scanning

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
      file = await staticFileService.getFile(payload.url)
      cacheService.set(prependCacheNamespace(payload.url), file)
      return file
    }
  })

  console.info(`custom file cache service initial call`)
  await callService('custom-file-cache-service', { url: '/' })

  console.info(`custom file cache service call 2`)
  await callService('custom-file-cache-service', { url: '/' })

  let authResult = await callService('auth-service', { authenticate: { user: 'admin', password: 'password' } })
  let token = authResult.accessToken
  console.info(`authResult:`, authResult)
  let verifyResult = await callService('auth-service', { verifyAccess: token })
  console.info(`verifyResult: ${JSON.stringify(verifyResult)}`)

  // let uploadResult = await callService('file-upload-service', Readable.from(testRawMultipartFile), {
  //   authToken: token,
  //   contentType: 'multipart/form-data; boundary=geckoformboundary85c5b05d9412d0694e8082bfaef6fac3'
  // })
  // console.info(`uploadResult: ${JSON.stringify(uploadResult)}`)



  process.once('SIGINT', async () => {
    try {
      await fileCacheService.terminate()
      await cacheService.terminate()
      await subscription1.terminate()
      await subscription2.terminate()
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

main().catch(err => console.error(err.stack))
