import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'
import HttpError from '../http-primitives/http-error.js'
import path from 'path'
import fs from 'fs'

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

      // TODO helper fn
      if (item.endsWith('/')) {
        let explicitFileItem = `${item}${target.split('/').pop()}`
        quickLookup[explicitFileItem] = path.join(rootDir, target)
        console.warn({explicitFileItem, path: path.join(rootDir, target)})
      } else console.warn({item, target})
    } else {
      // Direct file path mapping
      quickLookup[item] = path.join(rootDir, target)
      
      // also create a mapping for the file path with the file name
      if (item.endsWith('/')) {
        let explicitFileItem = `${item}${target.split('/').pop()}`
        quickLookup[explicitFileItem] = path.join(rootDir, target)
        console.warn({explicitFileItem, path: path.join(rootDir, target)})
      } else console.warn({item, target})
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

  console.warn({path})
  return path
}

// TODO dev mode default returns quickLookup path urls
const $404 = () => new HttpError(404, 'Not found')

export default async function createStaticFileService({
  rootDir = process.cwd(),
  urlRoot = '/',
  fileMap = 'index.html'
}, resolverFn, defaultFn = $404) {
  // Validate rootDir
  if (!fs.existsSync(rootDir)) {
    throw new Error(`rootDir does not exist: "${rootDir}"`)
  }

  if (typeof fileMap === 'string') {
    fileMap = { '/' : fileMap } // if just a string is provided, assume this is our index path
  }

  // Generate the lookup map
  const quickLookup = generateQuickLookupMap(fileMap, urlRoot, rootDir)
  console.warn({quickLookup})
  // TODO attach to server before returning

  return await createService('static-file-service', async function staticFileService(payload) {
    // console.warn('request url: ', request?.url)
    console.warn('payload url?: ', payload?.url)
    const url = payload?.url

    if (!url) throw new HttpError(400, 'url is required')

    const filePath = quickLookup[normalizePath(url)]
    console.warn({url, filePath, quickLookup})

    if (!filePath) {
      // File not found in lookup
      if (resolverFn) {
        try {
          let result = await resolverFn(url)
          console.warn({result})
          return result
        } catch (err) {
          // If resolver fails, fall through to default
        }
      }

      let defaultResult = await defaultFn()
      if (defaultResult instanceof Error) {
        throw defaultResult
      } else {
        return defaultResult
      }
    }

    // Read and return the file content
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return content
    } catch (err) {
      throw new HttpError(500, `Error reading file: ${err.message}`)
    }
  })
}
