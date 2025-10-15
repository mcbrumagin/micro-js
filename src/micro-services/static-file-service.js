import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'
import HttpError from '../http-primitives/http-error.js'
import path from 'path'
import fs from 'fs'

/*

example filemap... should this be the other way around? find examples online for local vs web path conventions
my hunch is it should since other routers are urls on the left

{
  '/': 'index.html',
  '/styles/main.css': 'public/main.css',
  '/assets/*': 'public/assets/*'.
  '/modules/*: 'node_modules/*'
}

should automatically insert '/' at the bgeinning
automatically remove '/' at the end
automatically remove '/*' from map values (url routes)
map doesn't do nested object since it could be named differently
terminating wildcards are more concise and just as secure
...assuming they are never written to elsewhere
*/

const quickLookup = {}
function generateQuickLookupMap(fileMap) {
  // even though the map doesn't have nesting, the file structure can
  // TODO directory mappings should strictly require '/*' at least in url route, otherwise throw an err
  for (let item in fileMap) {
    if (item.endsWith('*')) {
      // TODO lookup all files at target and add to quickLookup
    } else if (item === '/') {
      // TODO lookup index and add to quickLookup
    } else {
      // TODO lookup direct file path and add to quickLookup
    }
  }
}

// TODO
function sanitizePath(path) {

}

function sanitizeUrl(url) {
  if (url.endsWith('/')) url = url.slice(0, -1)
  if (url.startsWith('/')) url = url.slice(1)
  return url
}

// TODO dev mode default returns quickLookup path urls
const $404 = () => new HttpError(404, 'Not found')

export default async function createStaticFileService({
  rootDir,
  urlRoot = '/',
  fileMap
}, resolverFn, defaultFn = $404) {
  // TODO validate rootDir
  
  if (typeof fileMap === 'string') {
    fileMap = { '/' : fileMap } // if just a string is provided, assume this is our index path
  }

  return await createService('static-file-service', async function staticFileService(payload, request) {
    const url = sanitizeUrl(payload?.url || request?.url)

    const filePath = quickLookup[url]

    if (!filePath) {
      try {
        return resolverFn(url)
      } finally {
        return defaultFn()
      }
    }
  })
}
