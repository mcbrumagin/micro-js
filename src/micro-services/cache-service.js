import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'

export default function createCacheService({
  expireTime = 60000 * 10,
  evictionInterval = 30000,
}) {
  let logger = new Logger({logGroup: 'cache'})
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
        console.log(`evicted key ${key}`)
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

  return createService('cache', async function cacheService(payload) {
    logger.info(`cache service received payload: ${payload}`)
    evictionIntervalId = setInterval(performEviction, settings.evictionInterval)

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
  })
}
