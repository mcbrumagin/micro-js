import HttpError from '../../http-primitives/http-error.js'
import Logger from '../../utils/logger.js'

const logger = new Logger()

/**
 * Get registry API documentation
 * Returns information about available commands and required headers
 */
export default async function getRegistryApiDocumentation() {
  // TODO lookup version, links, etc from package.json
  // update package.json to include useful metadata
  // TODO check if micro is installed as a module, global command,
  //   or running directly in the dev environment

  try {
    if (!process.env.ENVIRONMENT?.toLowerCase().includes('dev')) {
      if (process.env.ENVIRONMENT?.toLowerCase().includes('prod')) {
        // TODO should this error be even less revealing?
        return new HttpError(404, 'Documentation disabled in production environment')
      } else return {
        // if not prod or dev, return a generic documentation link
        documentation: 'https://github.com/mcbrumagin/micro-js'
      }
    } else {
      // TODO make sure this works when it is installed as a module
      // for dev, return detailed documentation
      const packageJson = await import(process.cwd() + '/package.json', { with: { type: 'json' } })
      return {
        name: packageJson.default.name,
        version: packageJson.default.version,
        description: packageJson.default.description,
        documentation: packageJson.default.homepage,
        
        // TODO generate examples dynamically using header helper functions
        commands: {
          health: {
            header: 'micro-command: health',
            description: 'Check registry health status',
            requiredHeaders: ['micro-command'],
            example: {
              headers: { 'micro-command': 'health' }
            }
          },
          
          'service-setup': {
            header: 'micro-command: service-setup',
            description: 'Allocate a port for a new service',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-home'],
            example: {
              headers: {
                'micro-command': 'service-setup',
                'micro-service-name': 'myService',
                'micro-service-home': 'http://localhost'
              }
            }
          },
          
          'service-register': {
            header: 'micro-command: service-register',
            description: 'Register a service instance',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-location'],
            example: {
              headers: {
                'micro-command': 'service-register',
                'micro-service-name': 'myService',
                'micro-service-location': 'http://localhost:10001'
              }
            }
          },
          
          'service-unregister': {
            header: 'micro-command: service-unregister',
            description: 'Unregister a service instance',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-service-location']
          },
          
          'service-lookup': {
            header: 'micro-command: service-lookup',
            description: 'Find the location of a service',
            requiredHeaders: ['micro-command', 'micro-service-name']
          },
          
          'service-call': {
            header: 'micro-command: service-call',
            description: 'Call a registered service',
            requiredHeaders: ['micro-command', 'micro-service-name'],
            note: 'Request body is forwarded to the service'
          },
          
          'route-register': {
            header: 'micro-command: route-register',
            description: 'Register an HTTP route',
            requiredHeaders: ['micro-command', 'micro-service-name', 'micro-route-path'],
            optionalHeaders: ['micro-route-datatype', 'micro-route-type']
          },
          
          'pubsub-publish': {
            header: 'micro-command: pubsub-publish',
            description: 'Publish a message to a channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel'],
            note: 'Message body is sent to all subscribers'
          },
          
          'pubsub-subscribe': {
            header: 'micro-command: pubsub-subscribe',
            description: 'Subscribe to a pub/sub channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel', 'micro-service-location']
          },
          
          'pubsub-unsubscribe': {
            header: 'micro-command: pubsub-unsubscribe',
            description: 'Unsubscribe from a pub/sub channel',
            requiredHeaders: ['micro-command', 'micro-pubsub-channel', 'micro-service-location']
          }
        },
        
        routes: {
          description: 'HTTP routes take priority over command headers',
          note: 'Access registered routes directly via their URL path (e.g., /api/users)'
        },
        
        usage: {
          curl: 'curl -H "micro-command: health" http://localhost:9000',
          fetch: 'fetch("http://localhost:9000", { headers: { "micro-command": "health" } })'
        }
      }
    }
  } catch (error) {
    logger.error('Error getting registry API documentation:', error)
    // TODO remove try/catch after dev/installed/global edge-cases are covered
    if (!process.env.ENVIRONMENT?.toLowerCase().includes('prod')) {
      throw new HttpError(404, 'Documentation disabled in development environment')
    } else {
      throw new HttpError(500, 'Error getting registry API documentation')
    }
  }
}
