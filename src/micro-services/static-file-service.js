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

// TODO dev mode default returns quickLookup path urls
const $404 = () => new HttpError(404, 'Not found')

export default async function createStaticFileService({
  rootDir = normalizePath(process.cwd()),
  urlRoot = '/',
  fileMap = 'index.html',
  externalRootDir = false,
  customSecurityCheck = null,
  simpleSecurity = true,
  preventSystemFileAccess = true,
  useAuthService = null
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

  const quickLookup = generateQuickLookupMap(fileMap, urlRoot, rootDir)
  logger.info(`Static files mapped for "${urlRoot}" ${prettyPrintQuickLookup(quickLookup)}`)
  // logger.debug('static-file-service - quickLookup:', quickLookup)
  
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
      response.setHeader('content-type', contentType)
      response.setHeader('content-length', fs.statSync(filePath).size)
      response.setHeader('last-modified', getLastModified(filePath))

      fs.createReadStream(filePath).pipe(response)

      // TODO return next()? preventDefault()? next({ preventDefault: true })?
      return next({ reason: 'streaming file', file: filePath })
    }
  }


  // --- create service and helpers to expose ---------------------------------
  const server = await createService('static-file-service', getFile, { useAuthService })

  // attach lookup map and helper fns
  server.quickLookup = quickLookup
  server.getFile = getFile

  let originalTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.debug('terminating static file service')
    await originalTerminate()
    logger.debug('static file service terminated')
  }

  return server
}
