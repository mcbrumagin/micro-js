import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'

let logger = new Logger({ logGroup: 'micro-services' })

function initializeCacheService(expireTime, evictionInterval) {
  let cache = {}
  let expireCache = {} // mirror of cache for eviction
  let settings = {
    expireTime,
    evictionInterval
  }

  function performEviction() {
    for (let key in expireCache) {
      if (expireCache[key] < Date.now()) {
        delete cache[key]
        delete expireCache[key]
        logger.debug(`evicted key ${key}`)
      }
    }
  }

  let evictionIntervalId
  function reloadSettings(newSettings) {
    for (let key in newSettings) {
      if (settings[key] && settings[key] !== newSettings[key]) {
        settings[key] = newSettings[key]

        if (key === 'evictionInterval') {
          clearInterval(evictionIntervalId)
          evictionIntervalId = setInterval(performEviction, settings[key])
        }
      }
    }
    return settings
  }

  // TODO interval to check resource usage and evict if necessary

  function getExpire(expire) {
    return Date.now() + (Number(expire) || settings.expireTime)
  }

  // Start eviction interval ONCE at service creation
  evictionIntervalId = setInterval(performEviction, settings.evictionInterval)

  function cacheService(payload) {
    logger.debug(`cache service received payload: ${JSON.stringify(payload)}`)

    if (payload.get === '*') return cache
    else if (payload.get) return cache[payload.get] || null
    else if (payload.getex) return expireCache[payload.getex] || null
    else if (payload.set) for (let key in payload.set) cache[key] = payload.set[key]
    else if (payload.ex) for (let key in payload.ex) expireCache[key] = getExpire(payload.ex[key])
    else if (payload.setex) for (let key in payload.setex) {
      cache[key] = payload.setex[key]
      expireCache[key] = getExpire()
    }
    else if (payload.rex) for (let key in payload.rex) delete expireCache[key]
    else if (payload.del) for (let key in payload.del) delete cache[key] && delete expireCache[key]
    else if (payload.settings) return reloadSettings(payload.settings)
    else if (payload.clear) cache = {}
    else return false && logger.warn(`cache service failed to process: ${payload}`)
    return true
  }

  

  return { cacheService, evictionIntervalId }
}

function bindCacheHelpers(cacheSystem, cacheService) {

  cacheSystem.getCache = () => cache
  cacheSystem.getExpireCache = () => expireCache
  cacheSystem.getSettings = () => settings

  cacheSystem.set = (key, value) => cacheService({ set: { [key]: value } })
  cacheSystem.get = (key) => cacheService({ get: key })
  cacheSystem.setex = (key, value, expire) => cacheService({ setex: { [key]: value, expire } })
  cacheSystem.getex = (key) => cacheService({ getex: key })
  cacheSystem.del = (key) => cacheService({ del: { [key]: true } })
  cacheSystem.clear = () => cacheService({ clear: true })
  cacheSystem.settings = (settings) => cacheService({ settings })
}


export function createInMemoryCache({
  expireTime = 60000 * 10,
  evictionInterval = 30000
} = {}) {
  let { cacheService, evictionIntervalId } = initializeCacheService(expireTime, evictionInterval)

  let cacheSystem = {}
  cacheSystem.terminate = () => {
    logger.debug('cache service cleaning up interval')
    clearInterval(evictionIntervalId)
  }
  bindCacheHelpers(cacheSystem, cacheService)
  return cacheSystem
}

export default async function createCacheService({
  expireTime = 60000 * 10,
  evictionInterval = 30000,
  useAuthService = null
} = {}) {
  let { cacheService, evictionIntervalId } = initializeCacheService(expireTime, evictionInterval)

  let server = await createService('cache', cacheService, { useAuthService })

  // Override terminate to clean up interval
  let originalTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.debug('cache service cleaning up interval before serverterminate')
    clearInterval(evictionIntervalId)
    await originalTerminate()
  }

  bindCacheHelpers(server, cacheService)

  return server
}
