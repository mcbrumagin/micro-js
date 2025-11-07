import createService from '../micro-core/api/create-service.js'
import Logger from '../utils/logger.js'
import HttpError from '../micro-core/http-primitives/http-error.js'
import path from 'path'
import fs from 'fs'
import { next } from '../micro-core/http-primitives/next.js'
import { detectContentType } from '../micro-core/registry/content-type-detector.js'

const logger = new Logger({ logGroup: 'micro-services' })

/* --- example filemap ---
{
  '/': 'index.html',
  '/styles/main.css': 'public/main.css',
  '/assets/*': 'public/assets'.
  '/modules/*: 'node_modules'
}
*/

const endsWithValidWildcard = new RegExp('^.*\/\*$')
const isRoot = new RegExp('^/$')
const isFilePath = new RegExp('^.*\/.*$')


function validateMapEntry(rootDir, item, target) {
  if (item.length === 0) {
    return new Error(`fileMap url route cannot be empty: "${item}"`)
  } else if (!endsWithValidWildcard.test(item) && !isFilePath.test(item) && !isRoot.test(item)) {
    return new Error(`fileMap url route must end with '/*' or be a file path with extension: "${item}"`)
  }

  if (target.length === 0) {
    return new Error(`fileMap file path cannot be empty: "${target}"`)
  } else if (!endsWithValidWildcard.test(target) && !isFilePath.test(target)) {
    return new Error(`fileMap file path must end with '/*' or be a file path with extension: "${target}"`)
  }

  // check if target path exists (strip wildcard for directory check)
  const targetPath = target.endsWith('/*') ? target.slice(0, -2) : target
  if (!fs.existsSync(path.join(rootDir, targetPath))) {
    return new Error(`fileMap file path does not exist: "${target}"`)
  }
}

function populateQuickLookupForDirectoryTree(quickLookup, rootDir, urlRoute, targetDir) {

  // check that target is a directory
  if (!fs.statSync(path.join(rootDir, targetDir)).isDirectory()) {
    throw new Error(`fileMap file path is not a directory: "${targetDir}"`)
  }

  // TODO read all files/folders in the directory and recursively add to quickLookup
  const urlPrefix = urlRoute
  const files = fs.readdirSync(path.join(rootDir, targetDir))

  for (let file of files) {
    const urlPath = urlPrefix === '' ? `/${file}` : `${urlPrefix}/${file}`
    if (fs.statSync(path.join(rootDir, targetDir, file)).isDirectory()) {
      // TODO VERIFY
      populateQuickLookupForDirectoryTree(quickLookup, rootDir, urlPath, `${targetDir}/${file}`)
    } else {
      quickLookup[urlPath] = path.join(rootDir, targetDir, file)
    }
  }
}

function generateQuickLookupMap(fileMap, urlRoot, rootDir, skipValidation = false) {
  // even though the map doesn't have nesting, the file structure can
  const quickLookup = {}
  let errors = []
  
  for (let urlRoute in fileMap) {
    let target = fileMap[urlRoute]

    urlRoute = normalizePath(urlRoute)
    target = normalizePath(target)

    if (!skipValidation) {
      const err = validateMapEntry(rootDir, urlRoute, target)
      if (err) errors.push(err)
    }

    const createSpecificFileMapping = (urlRoute, target) => {
      if (urlRoute.endsWith('/')) {
        let explicitFileItem = `${urlRoute}${target.split('/').pop()}`
        quickLookup[explicitFileItem] = path.join(rootDir, target)
      }
    }

    if (urlRoute.endsWith('/*')) { // wildcard mapping, so recursively populate
      urlRoute = urlRoute.slice(0, -2) // remove /*
      populateQuickLookupForDirectoryTree(quickLookup, rootDir, urlRoute, target)

    } else if (urlRoute === '/') { // root mapping
      quickLookup['/'] = path.join(rootDir, target)
      createSpecificFileMapping(urlRoute, target)

    } else { // direct file path mapping
      quickLookup[urlRoute] = path.join(rootDir, target)
      createSpecificFileMapping(urlRoute, target)

    }
  }

  if (errors.length > 0) {
    throw new Error(`Errors in static-file-service filemap: ${errors.join('\n')}`)
  }
  
  return quickLookup
}


function normalizePath(path) {
  // default to root
  if (!path) return '/'
  
  // ensure path starts with "/"
  if (!path.startsWith('/')) path = '/' + path
  
  // remove trailing slash unless it's the root
  if (path !== '/' && path.endsWith('/')) path = path.slice(0, -1)

  return path
}


function sanityCheckRootDir(rootDir, externalRootDir = false) {
  if (!externalRootDir && !rootDir.startsWith(process.cwd())) {
    throw new Error(`rootDir is not inside process.cwd(): "${rootDir}"`)
  }

  if (externalRootDir) {
    logger.warn(`Potentially unsafe! "externalRootDir" is enabled for rootDir: "${rootDir}"`)
  }

  if (!fs.existsSync(rootDir)) {
    throw new Error(`rootDir does not exist: "${rootDir}"`)
  }

  return true
}

function simpleSecurityCheck(url, preventSystemFileAccess = true) {
  if (url.includes('..') // prevent path traversal
    || url.split('/').some(segment => segment.startsWith('.')) // prevent access to hidden files/directories
    || url.includes('%2e%2e') // prevent encoded path traversal ".."
    || url.includes('%2e') // prevent encoded dot
    || url.includes('\\') // prevent backslash
    || url.includes('%5c') // prevent encoded double-backslash
    || url.includes('%2f') // prevent encoded forward slash

    // prevent access to typical system files
    || (preventSystemFileAccess && (
         url.includes('/etc')
      || url.includes('/boot')
      || url.includes('/lib')
      || url.includes('/bin')
      || url.includes('/sbin')
      || url.includes('/usr')
      || url.includes('/var')
    ))
  ) throw new HttpError(403, 'url contains invalid characters')
  else return true
}

function getLastModified(filePath) {
  const stats = fs.statSync(filePath)

  return stats.mtime.toISOString() // modification time
    || stats.ctime.toISOString() // change time
    || stats.birthtime.toISOString() // creation time
}

const prettyPrintQuickLookup = (quickLookup) => {
  let prettyString = '\n'
  for (let url in quickLookup) {
    prettyString += `  ${url} → ${path.relative(process.cwd(), quickLookup[url])}\n`
  }
  return prettyString
}


async function getRangeData(filePath, range) {
  // TODO promise
  const fileSize = fs.statSync(filePath).size
  const parts = range.replace(/bytes=/, "").split("-")
  const start = parseInt(parts[0], 10)
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
  
  // Validate range
  if (isNaN(start) || isNaN(end) || start < 0 || end >= fileSize || start > end) {
    return { invalid: true, fileSize }
  }
  
  const chunksize = (end - start) + 1
  return { start, end, chunksize, fileSize, invalid: false }
}

// TODO dev mode default returns quickLookup path urls
const $404 = () => new HttpError(404, 'Not found')

export default async function createStaticFileService({
  serviceName = 'static-file-service',
  rootDir = normalizePath(process.cwd()),
  urlRoot = '/',
  fileMap = 'index.html',
  externalRootDir = false,
  customSecurityCheck = null,
  simpleSecurity = true,
  preventSystemFileAccess = true,
  useAuthService = null,
  autoRefresh = false  // NEW: false | { mode, ...options }
}, resolverFn, defaultFn = $404) {

  if (!externalRootDir && !rootDir.startsWith(process.cwd())) {
    // assume this is a relative path
    rootDir = path.join(normalizePath(process.cwd()), rootDir)
  }

  sanityCheckRootDir(rootDir, externalRootDir)

  if (typeof fileMap === 'string') {
    // if just a string is provided, assume this is our index path
    fileMap = { '/' : fileMap }
  }

  let quickLookup = generateQuickLookupMap(fileMap, urlRoot, rootDir)
  logger.info(`Static files mapped for "${urlRoot}" ${prettyPrintQuickLookup(quickLookup)}`)
  
  // Auto-refresh state tracking
  let refreshStats = {
    lastRefresh: Date.now(),
    totalFiles: Object.keys(quickLookup).length,
    refreshCount: 0,
    mode: autoRefresh ? (autoRefresh.mode || 'manual') : 'manual'
  }
  let refreshInterval = null
  let isPaused = false
  
  async function getFile(payload, request, response) {
    const url = payload?.url || request?.url
    logger.debug(`getting file for url: "${url}"`)

    if (simpleSecurity) simpleSecurityCheck(url, preventSystemFileAccess)
    else logger.warn('simpleSecurity is disabled, make sure you trust the source of the url, or implement customSecurityCheck')

    if (customSecurityCheck) customSecurityCheck(url)
    else if (!simpleSecurity) logger.warn('customSecurityCheck is disabled, make sure you trust the source of the url, or use simpleSecurity')

    if (!url) throw new HttpError(400, 'url is required')

    const filePath = quickLookup[normalizePath(url)]

    // TODO optional eager lookup of file path before resolver
    // eager lookup should also update quickLookup if it's not already present
    // quickLookup should have the option to be backed up by a cache service with eviction


    if (!filePath) {
      logger.debug(`file not found in lookup for url: "${url}"`)
      if (resolverFn) {
        try {

          let suggestedContentType = detectContentType(null, url)
          logger.debug('staticFileService - suggestedContentType:', suggestedContentType)
          response.setHeader('content-type', suggestedContentType)

          // TODO needed?
          const setContentType = (contentType) => {
            response.setHeader('content-type', contentType)
          }

          let result = await resolverFn(url, setContentType)

          // TODO should actually complete read file?
          if (result !== false && result != null) return result
        } catch (err) {
          logger.debugErr(`Error in static file resolver at "${url}":`, err)
          throw err
        }
      }

      logger.debug(`file failed to resolve for url: "${url}"; using defaultFn`)
      let defaultResult = await defaultFn()
      if (defaultResult instanceof Error) {
        throw defaultResult
      } else {
        return defaultResult
      }
    }

    logger.debug('staticFileService - filePath:', filePath)
    let contentType = detectContentType(null, filePath)

    const isLocalHelperCall = !response
    if (isLocalHelperCall) return fs.createReadStream(filePath)
    else {
      const fileStats = fs.statSync(filePath)
      const fileSize = fileStats.size
      
      // Always advertise range support for all files
      response.setHeader('accept-ranges', 'bytes')
      response.setHeader('content-type', contentType)
      response.setHeader('last-modified', getLastModified(filePath))

      // Handle range requests
      if (request?.headers?.range) {
        // Check If-Range precondition (RFC 7233)
        // If-Range can be either an ETag or a date (Last-Modified)
        const ifRange = request.headers['if-range']
        let shouldProcessRange = true
        
        if (ifRange) {
          const lastModified = getLastModified(filePath)
          // Simple date comparison - if file was modified, ignore range and send full file
          if (ifRange !== lastModified) {
            shouldProcessRange = false
            logger.debug('If-Range condition failed, sending full file')
          }
        }
        
        if (shouldProcessRange) {
          const rangeData = await getRangeData(filePath, request.headers.range)
          
          // Handle invalid range (416 Range Not Satisfiable)
          if (rangeData.invalid) {
            response.setHeader('content-range', `bytes */${rangeData.fileSize}`)
            response.writeHead(416)
            response.end()
            return next({ reason: 'invalid range', file: filePath })
          }
          
          // Valid range - send partial content (206)
          const { start, end, chunksize } = rangeData
          response.setHeader('content-range', `bytes ${start}-${end}/${fileSize}`)
          response.setHeader('content-length', chunksize)
          response.writeHead(206)
          fs.createReadStream(filePath, { start, end }).pipe(response)
        } else {
          // If-Range condition failed - send full file
          response.setHeader('content-length', fileSize)
          response.writeHead(200)
          fs.createReadStream(filePath).pipe(response)
        }
      } else {
        // Normal request - send full file (200)
        response.setHeader('content-length', fileSize)
        response.writeHead(200)
        fs.createReadStream(filePath).pipe(response)
      }

      // TODO return next()? preventDefault()? next({ preventDefault: true })?
      return next({ reason: 'streaming file', file: filePath })
    }
  }


  // --- Auto-refresh functionality ---------------------------------------------
  
  /**
   * Add a single file to the index
   * @param {string} urlPath - URL path (e.g. '/uploads/photo.jpg')
   * @param {string} filePath - Full filesystem path
   */
  function addFile(urlPath, filePath) {
    // TODO should determine urlPath based on filePath?
    urlPath = normalizePath(urlPath)
    
    // Security check
    // TODO whitelist other directories
    // if (!filePath.startsWith(rootDir)) {
    //   logger.warn(`Rejecting file outside rootDir: ${filePath}`)
    //   return false
    // }
    
    if (!fs.existsSync(filePath)) {
      logger.warn(`Attempting to add non-existent file: ${filePath}`)
      return false
    }
    
    quickLookup[urlPath] = filePath
    refreshStats.totalFiles = Object.keys(quickLookup).length
    
    if (autoRefresh?.onFileAdded) {
      autoRefresh.onFileAdded({ urlPath, filePath })
    }
    
    return true
  }
  
  /**
   * Remove a file from the index
   * @param {string} urlPath - URL path to remove
   */
  function removeFile(urlPath) {
    urlPath = normalizePath(urlPath)
    
    if (quickLookup[urlPath]) {
      delete quickLookup[urlPath]
      refreshStats.totalFiles = Object.keys(quickLookup).length
      
      if (autoRefresh?.onFileRemoved) {
        autoRefresh.onFileRemoved({ urlPath })
      }
      
      return true
    }
    
    return false
  }
  
  /**
   * Refresh a specific directory path
   * @param {string} dirPath - Directory path to rescan
   */
  async function refreshPath(dirPath) {
    const startTime = Date.now()
    let addedCount = 0
    let removedCount = 0
    
    // Find matching fileMap entry
    for (let urlRoute in fileMap) {
      let target = fileMap[urlRoute]
      
      if (target.endsWith('/*')) {
        target = target.slice(0, -2)
      }
      
      const fullTargetPath = path.join(rootDir, target)
      const fullDirPath = path.join(rootDir, dirPath)
      
      // Check if this is the directory we want to refresh
      if (fullDirPath.startsWith(fullTargetPath)) {
        // Regenerate for this specific mapping
        const oldUrls = new Set()
        const urlPrefix = urlRoute.endsWith('/*') ? urlRoute.slice(0, -2) : urlRoute
        
        // Track existing URLs for this path
        for (const url in quickLookup) {
          if (url.startsWith(urlPrefix)) {
            oldUrls.add(url)
          }
        }
        
        // Rescan directory
        try {
          populateQuickLookupForDirectoryTree(quickLookup, rootDir, urlPrefix, target)
          
          // Count additions
          for (const url in quickLookup) {
            if (url.startsWith(urlPrefix) && !oldUrls.has(url)) {
              addedCount++
            }
          }
          
          // Handle deletions if enabled
          if (autoRefresh?.detectDeletions) {
            for (const url of oldUrls) {
              if (!quickLookup[url]) {
                removedCount++
              }
            }
          }
        } catch (err) {
          logger.error(`Error refreshing path ${dirPath}:`, err)
          throw err
        }
      }
    }
    
    const duration = Date.now() - startTime
    refreshStats.totalFiles = Object.keys(quickLookup).length
    
    logger.debug(`Refreshed path ${dirPath}: +${addedCount} -${removedCount} (${duration}ms)`)
    
    return { added: addedCount, removed: removedCount, duration }
  }
  
  /**
   * Full index refresh - rescan all directories
   */
  async function refreshIndex() {
    const startTime = Date.now()
    
    try {
      const oldLookup = { ...quickLookup }
      quickLookup = generateQuickLookupMap(fileMap, urlRoot, rootDir)
      
      // Calculate changes
      const oldUrls = new Set(Object.keys(oldLookup))
      const newUrls = new Set(Object.keys(quickLookup))
      
      const added = [...newUrls].filter(url => !oldUrls.has(url))
      const removed = [...oldUrls].filter(url => !newUrls.has(url))
      
      const duration = Date.now() - startTime
      refreshStats.lastRefresh = Date.now()
      refreshStats.totalFiles = Object.keys(quickLookup).length
      refreshStats.refreshCount++
      
      logger.debug(`Index refreshed: +${added.length} -${removed.length} files (${duration}ms)`)
      
      if (autoRefresh?.onRefreshComplete) {
        autoRefresh.onRefreshComplete({ 
          added: added.length, 
          removed: removed.length, 
          duration,
          total: refreshStats.totalFiles
        })
      }
      
      return { 
        added: added.length, 
        removed: removed.length, 
        duration,
        addedFiles: added,
        removedFiles: removed
      }
    } catch (err) {
      logger.error('Error refreshing index:', err)
      if (autoRefresh?.onRefreshError) {
        autoRefresh.onRefreshError(err)
      }
      throw err
    }
  }
  
  /**
   * Get index statistics
   */
  function getIndexStats() {
    return {
      ...refreshStats,
      isPaused,
      hasInterval: !!refreshInterval
    }
  }
  
  /**
   * Pause auto-refresh (interval mode)
   */
  function pauseAutoRefresh() {
    isPaused = true
  }
  
  /**
   * Resume auto-refresh (interval mode)
   */
  function resumeAutoRefresh() {
    isPaused = false
  }
  
  /**
   * Handle file upload event from pubsub
   */
  async function handleFileUploadEvent(event) {
    logger.debug('staticFileService - handleFileUploadEvent:', event)
    try {
      const { urlPath, filePath } = event
      addFile(urlPath, filePath)
    } catch (err) {
      logger.error('Error handling file upload event:', err)
    }
  }
  
  /**
   * Handle file deletion event from pubsub
   */
  async function handleFileDeletionEvent(event) {
    logger.debug('staticFileService - handleFileUploadEvent:', event)
    try {
      const { urlPath } = event
      removeFile(urlPath)
    } catch (err) {
      logger.error('Error handling file deletion event:', err)
    }
  }
  
  // --- create service and helpers to expose ---------------------------------
  const server = await createService(serviceName, getFile, { useAuthService })

  // Attach lookup map and helper functions
  server.quickLookup = quickLookup
  server.getFile = getFile
  server.refreshIndex = refreshIndex
  server.refreshPath = refreshPath
  server.addFile = addFile
  server.removeFile = removeFile
  server.getIndexStats = getIndexStats
  server.pauseAutoRefresh = pauseAutoRefresh
  server.resumeAutoRefresh = resumeAutoRefresh
  
  // --- Setup auto-refresh based on mode -------------------------------------
  if (autoRefresh && autoRefresh.mode) {
    const mode = autoRefresh.mode
    const updateChannel = autoRefresh.updateChannel || 'micro:file-updated'
    const deletionChannel = autoRefresh.deletionChannel || 'micro:file-deleted'
    const intervalMs = autoRefresh.intervalMs || 10000
    
    logger.info(`Auto-refresh enabled: mode=${mode}`)
    
    // PubSub mode - subscribe to file upload/deletion events
    if (mode === 'pubsub' || mode === 'hybrid') {
      try {
        // await server.context.subscribe(updateChannel, handleFileUploadEvent)
        // await server.context.subscribe(deletionChannel, handleFileDeletionEvent)
        await server.createSubscription({
          [updateChannel]: handleFileUploadEvent,
          [deletionChannel]: handleFileDeletionEvent
        })
        logger.info(`Auto-refresh subscribed to: ${updateChannel}, ${deletionChannel}`)
      } catch (err) {
        logger.error('Failed to subscribe to file events:', err)
      }
    }
    
    // Interval mode - periodic directory scanning
    if (mode === 'interval' || mode === 'hybrid') {
      refreshInterval = setInterval(async () => {
        if (isPaused) {
          logger.debug('Skipping refresh (paused)')
          return
        }
        
        try {
          await refreshIndex()
        } catch (err) {
          logger.error('Error in scheduled refresh:', err)
        }
      }, intervalMs)
      
      logger.info(`Interval refresh started: ${intervalMs}ms`)
    }
  }

  // Override terminate to cleanup intervals and subscriptions
  let originalTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    // Clear refresh interval
    if (refreshInterval) {
      clearInterval(refreshInterval)
      refreshInterval = null
    }
    
    await originalTerminate()
  }

  return server
}
