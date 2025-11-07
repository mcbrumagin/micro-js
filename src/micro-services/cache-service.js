import createService from '../micro-core/api/create-service.js'
import Logger from '../utils/logger.js'

let logger = new Logger({ logGroup: 'micro-services' })

function validateSettings(expireTime, evictionInterval) {
  const errors = []
  
  // Validate expireTime
  if (expireTime !== 'None' && typeof expireTime !== 'number') {
    errors.push(`expireTime must be a number or 'None', got: ${typeof expireTime}`)
  }
  if (typeof expireTime === 'number' && expireTime <= 0) {
    errors.push(`expireTime must be positive, got: ${expireTime}`)
  }
  
  // Validate evictionInterval
  if (evictionInterval !== 'None' && typeof evictionInterval !== 'number') {
    errors.push(`evictionInterval must be a number or 'None', got: ${typeof evictionInterval}`)
  }
  if (typeof evictionInterval === 'number' && evictionInterval <= 0) {
    errors.push(`evictionInterval must be positive, got: ${evictionInterval}`)
  }
  
  if (errors.length > 0) {
    // TODO: Using ' - ' separator instead of '\n' because HttpError truncates multiline messages
    // See http-error.js line 4 - only first line is preserved when errors cross service boundaries
    throw new Error(`Cache service validation failed: ${errors.join(' - ')}`)
  }
}

function warnAboutSettings(expireTime, evictionInterval) {
  if (expireTime === 'None') {
    logger.warn('⚠️  Cache expireTime is set to "None" - items will never expire automatically!')
    logger.warn('   This may lead to unbounded memory growth. Consider setting an expiration time.')
  }
  
  if (evictionInterval === 'None') {
    logger.warn('⚠️  Cache evictionInterval is set to "None" - expired items will not be cleaned up!')
    logger.warn('   Even with expireTime set, items will remain in memory until manually deleted.')
  }
  
  if (expireTime === 'None' && evictionInterval === 'None') {
    logger.warn('⚠️  Both expireTime and evictionInterval are "None" - cache will grow indefinitely!')
  }
}

function initializeCacheService(expireTime, evictionInterval) {
  // Validate settings on initialization
  validateSettings(expireTime, evictionInterval)
  
  // Warn about potentially problematic settings
  warnAboutSettings(expireTime, evictionInterval)
  
  let cache = {}
  let expireCache = {} // mirror of cache for eviction
  let settings = {
    expireTime,
    evictionInterval
  }

  function performEviction() {
    if (settings.expireTime === 'None') return
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
    // Validate new settings before applying
    const updatedSettings = { ...settings, ...newSettings }
    validateSettings(updatedSettings.expireTime, updatedSettings.evictionInterval)
    
    let settingsChanged = false
    
    for (let key in newSettings) {
      // Allow updating even if the key exists (remove the check for settings[key])
      if (settings[key] !== newSettings[key]) {
        const oldValue = settings[key]
        settings[key] = newSettings[key]
        settingsChanged = true
        
        logger.info(`Cache setting updated: ${key} = ${oldValue} → ${newSettings[key]}`)

        if (key === 'evictionInterval') {
          // Clear existing interval
          if (evictionIntervalId) {
            clearInterval(evictionIntervalId)
            evictionIntervalId = null
            logger.debug('Cleared eviction interval')
          }
          
          // Start new interval if not 'None'
          if (settings[key] !== 'None') {
            evictionIntervalId = setInterval(performEviction, settings[key])
            logger.debug(`Started eviction interval: ${settings[key]}ms`)
          } else {
            logger.debug('Eviction interval disabled (set to "None")')
          }
        }
        
        if (key === 'expireTime') {
          if (newSettings[key] === 'None') {
            logger.debug('Expiration disabled (set to "None")')
          } else {
            logger.debug(`Expiration time updated: ${newSettings[key]}ms`)
          }
        }
      }
    }
    
    // Warn about the new settings if they changed
    if (settingsChanged) {
      warnAboutSettings(settings.expireTime, settings.evictionInterval)
    }
    
    return settings
  }

  // TODO interval to check resource usage and evict if necessary

  function getExpire(expire) {
    return Date.now() + (Number(expire) || settings.expireTime)
  }

  // Start eviction interval ONCE at service creation
  if (settings.evictionInterval !== 'None') {
    evictionIntervalId = setInterval(performEviction, settings.evictionInterval)
  }

  function cacheService(payload) {
    logger.debug(`cache service received payload: ${JSON.stringify(payload)}`)

    if (payload.get === '*') return cache
    else if (payload.get) return cache[payload.get] || null
    else if (payload.getex) return expireCache[payload.getex] || null
    else if (payload.set) for (let key in payload.set) cache[key] = payload.set[key]
    else if (payload.ex) for (let key in payload.ex) expireCache[key] = getExpire(payload.ex[key])
    else if (payload.setex) for (let key in payload.setex) {
      cache[key] = payload.setex[key]
      // expireCache[key] = getExpire()
      expireCache[key] = getExpire(payload.expire)
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
  cacheSystem.setex = (key, value, expire) => cacheService({ setex: { [key]: value }, expire })
  cacheSystem.ex = (key, expire) => cacheService({ ex: { [key]: expire } })
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
  serviceName = 'cache-service',
  expireTime = 60000 * 10,
  evictionInterval = 30000,
  useAuthService = null
} = {}) {
  let { cacheService, evictionIntervalId } = initializeCacheService(expireTime, evictionInterval)

  let server = await createService(serviceName, cacheService, { useAuthService })

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

