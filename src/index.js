import createService from './create-service.js'
import createServices from './create-services.js'
import createRoute from './create-route.js'
import callService from './call-service.js'
import registryServer from './registry-server.js'
import Logger, { overrideConsoleGlobally } from './logger.js'
import HttpError from './http-error.js'

// Named exports
export {
  createService,
  createServices,
  createRoute,
  callService,
  registryServer,
  HttpError,
  Logger,
  overrideConsoleGlobally
}

// Default export for backward compatibility
export default {
  createService,
  createServices,
  createRoute,
  callService,
  registryServer,
  HttpError,
  Logger,
  overrideConsoleGlobally
}
