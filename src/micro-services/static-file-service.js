import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'
import HttpError from '../http-primitives/http-error.js'
import path from 'path'
import fs from 'fs'
import { next } from '../http-primitives/next.js'

const logger = new Logger('static-file-service')

/*

example filemap

{
  '/': 'index.html',
  '/styles/main.css': 'public/main.css',
  '/assets/*': 'public/assets/*'.
  '/modules/*: 'node_modules/*'
}

should automatically insert '/' at the beginning
automatically remove '/' at the end
automatically remove '/*' from map values (url routes)
map doesn't do nested object since it could be named differently
terminating wildcards are more concise and just as secure
...assuming they are never written to elsewhere
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

  // Check if target path exists (strip wildcard for directory check)
  const targetPath = target.endsWith('/*') ? target.slice(0, -2) : target
  if (!fs.existsSync(path.join(rootDir, targetPath))) {
    return new Error(`fileMap file path does not exist: "${target}"`)
  }
}

function generateQuickLookupMap(fileMap, urlRoot, rootDir, skipValidation = false) {
  // even though the map doesn't have nesting, the file structure can
  const quickLookup = {}
  let errors = []
  
  for (let item in fileMap) {
    let target = fileMap[item]

    item = normalizePath(item)
    target = normalizePath(target)

    if (!skipValidation) {
      const err = validateMapEntry(rootDir, item, target)
      if (err) errors.push(err)
    }

    const createSpecificFileMapping = (item, target) => {
      if (item.endsWith('/')) {
        let explicitFileItem = `${item}${target.split('/').pop()}`
        quickLookup[explicitFileItem] = path.join(rootDir, target)
      }
    }

    if (item.endsWith('/*')) {
      // Wildcard mapping - map directory contents
      const targetDir = target.endsWith('/*') ? target.slice(0, -2) : target
      const urlPrefix = item.slice(0, -2) // remove /*
      const files = fs.readdirSync(path.join(rootDir, targetDir))
      for (let file of files) {
        const urlPath = urlPrefix === '' ? `/${file}` : `${urlPrefix}/${file}`
        quickLookup[urlPath] = path.join(rootDir, targetDir, file)
      }
    } else if (item === '/') {
      // Root mapping
      quickLookup['/'] = path.join(rootDir, target)
      createSpecificFileMapping(item, target)
    } else {
      // Direct file path mapping
      quickLookup[item] = path.join(rootDir, target)
      createSpecificFileMapping(item, target)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Errors in static-file-service filemap: ${errors.join('\n')}`)
  }
  
  return quickLookup
}


function normalizePath(path) {
  if (!path) return '/'
  // Ensure path starts with /
  if (!path.startsWith('/')) path = '/' + path
  // Remove trailing slash unless it's the root
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

// TODO dev mode default returns quickLookup path urls
const $404 = () => new HttpError(404, 'Not found')

export default async function createStaticFileService({
  rootDir = normalizePath(process.cwd()),
  urlRoot = '/',
  fileMap = 'index.html',
  externalRootDir = false,
  customSecurityCheck = null,
  simpleSecurity = true,
  preventSystemFileAccess = true
}, resolverFn, defaultFn = $404) {

  if (!externalRootDir && !rootDir.startsWith(process.cwd())) {
    // assume this is a relative path
    rootDir = path.join(normalizePath(process.cwd()), rootDir)
  }

  sanityCheckRootDir(rootDir, externalRootDir)

  if (typeof fileMap === 'string') {
    fileMap = { '/' : fileMap } // if just a string is provided, assume this is our index path
  }

  const quickLookup = generateQuickLookupMap(fileMap, urlRoot, rootDir)
  
  const getFile = async payload => {
    const url = payload?.url
    logger.debug(`getting file for url: "${url}"`)

    if (simpleSecurity) simpleSecurityCheck(url, preventSystemFileAccess)
    else logger.warn('simpleSecurity is disabled, make sure you trust the source of the url, or implement customSecurityCheck')

    if (customSecurityCheck) customSecurityCheck(url)
    else if (!simpleSecurity) logger.warn('customSecurityCheck is disabled, make sure you trust the source of the url, or use simpleSecurity')

    if (!url) throw new HttpError(400, 'url is required')

    const filePath = quickLookup[normalizePath(url)]
    if (!filePath) {
      logger.debug(`file not found in lookup for url: "${url}"`)
      if (resolverFn) {
        try {
          let result = await resolverFn(url)
          // TODO should handle fs readFileSync?
          if (result !== false && result != null) return result
        } catch (err) {
          logger.error(`Error in resolverFn for url: "${url}": ${err.stack}`)
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

    // TODO implement a streaming read file
    // const content = await fs.readFileSync(filePath, 'utf-8')
    // return content
    return fs.createReadStream(filePath)
  }

  const server = await createService('static-file-service', async function staticFileService(payload) {
    // logger.warn('request url: ', request?.url)
    return getFile(payload)
  })

  // attach lookup map and helper fns
  server.quickLookup = quickLookup
  server.getFile = getFile

  let originalTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    console.log('terminating static file service')
    await originalTerminate()
    console.log('static file service terminated')
  }
  return server
}
