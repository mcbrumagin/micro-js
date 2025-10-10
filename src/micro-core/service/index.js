/**
 * Service Module Exports
 * Clean exports for all service-related modules
 */

// State management
export {
  createServiceState,
  updateCache,
  updateCacheEntry,
  removeFromCache,
  clearCache
} from './service-state.js'

// Context building
export {
  buildContext,
  buildEnhancedContext,
  updateContext,
  bindServiceFunction,
  createLocalContext
} from './service-context.js'

// Cache handling
export {
  isCacheUpdatePayload,
  createCacheAwareHandler,
  createSecureCacheAwareHandler
} from './cache-handler.js'

// Validation
export {
  getRegistryHost,
  parseUrl,
  determineServiceHome,
  extractPort,
  validatePort,
  checkServiceUrlPort,
  validateServiceLocation,
  validateServiceName
} from './service-validator.js'

// Batch operations
export {
  createSharedCache,
  validateServiceBatch,
  createServiceBatch
} from './service-batch.js'

