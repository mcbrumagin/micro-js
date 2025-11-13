import createService from '../micro-core/api/create-service.js'
import Logger from '../utils/logger.js'
import { HttpError } from '../micro-core/http-primitives/index.js'

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
    throw new HttpError(400, `Cache service validation failed: ${errors.join(' - ')}`)
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

    // Validate payload
    if (!payload || typeof payload !== 'object') {
      throw new HttpError(400, 'Cache service requires a valid payload object')
    }

    // Dynamic action handling with validation and proper return values
    
    // GET operations - return requested data
    if (payload.get !== undefined) {
      if (payload.get === '*') {
        return cache
      } else if (typeof payload.get === 'string') {
        return cache[payload.get] || null
      } else {
        throw new HttpError(400, 'get action requires a string key or "*"')
      }
    }
    
    if (payload.getex !== undefined) {
      if (typeof payload.getex !== 'string') {
        throw new HttpError(400, 'getex action requires a string key')
      }
      return expireCache[payload.getex] || null
    }
    
    // SET operations - return success status
    if (payload.set !== undefined) {
      if (typeof payload.set !== 'object' || payload.set === null) {
        throw new HttpError(400, 'set action requires an object with key-value pairs')
      }
      const keys = []
      for (let key in payload.set) {
        cache[key] = payload.set[key]
        keys.push(key)
      }
      return { success: true, action: 'set', keys }
    }
    
    if (payload.ex !== undefined) {
      if (typeof payload.ex !== 'object' || payload.ex === null) {
        throw new HttpError(400, 'ex action requires an object with key-expire pairs')
      }
      const keys = []
      for (let key in payload.ex) {
        expireCache[key] = getExpire(payload.ex[key])
        keys.push(key)
      }
      return { success: true, action: 'ex', keys }
    }
    
    if (payload.setex !== undefined) {
      if (typeof payload.setex !== 'object' || payload.setex === null) {
        throw new HttpError(400, 'setex action requires an object with key-value pairs')
      }
      const keys = []
      for (let key in payload.setex) {
        cache[key] = payload.setex[key]
        expireCache[key] = getExpire(payload.expire)
        keys.push(key)
      }
      return { success: true, action: 'setex', keys }
    }
    
    if (payload.rex !== undefined) {
      if (typeof payload.rex !== 'string' && !Array.isArray(payload.rex)) {
        throw new HttpError(400, 'rex action requires a key-string or array of strings')
      }
      if (typeof payload.rex === 'string') {
        payload.rex = [payload.rex]
      }
      const deletedKeys = []
      for (let key of payload.rex) {
        deletedKeys[key] = cache[key] ? 1 : 0
        delete expireCache[key]
      }
      return { success: true, action: 'rex', keys: deletedKeys }
    }
    
    // DELETE operations - return success status
    if (payload.del !== undefined) {
      if (typeof payload.del !== 'string' && !Array.isArray(payload.del)) {
        throw new HttpError(400, 'del action requires a key-string or array of strings')
      }
      if (typeof payload.del === 'string') {
        payload.del = [payload.del]
      }
      const deletedKeys = {}
      for (let key of payload.del) {
        deletedKeys[key] = cache[key] ? 1 : 0
        delete cache[key]
        delete expireCache[key]
      }
      return { success: true, action: 'del', keys: deletedKeys }
    }
    
    if (payload.clear !== undefined) {
      const keyCount = Object.keys(cache).length
      cache = {}
      expireCache = {}
      return { success: true, action: 'clear', keysCleared: keyCount }
    }
    
    // SETTINGS operations - return updated settings
    if (payload.settings !== undefined) {
      if (typeof payload.settings !== 'object' || payload.settings === null) {
        throw new HttpError(400, 'settings action requires an object')
      }
      return reloadSettings(payload.settings)
    }
    
    // No valid action found
    logger.warn(`cache service received unknown action: ${JSON.stringify(payload)}`)
    throw new HttpError(400, `Unknown cache action. Valid actions: get, getex, set, setex, ex, rex, del, clear, settings`)
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

