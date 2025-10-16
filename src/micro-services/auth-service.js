import createService from '../micro-core/create-service.js'
import Logger from '../utils/logger.js'

export default async function createAuthService({
  authType = 'basic',
  authConfig = {},
} = {}) {
  const logger = new Logger('auth-service')

  const authenticate = async (payload) => {
    return payload
  }

  const generateToken = async (payload) => {
    return payload
  }

  const verifyToken = async (payload) => {
    return payload
  }

  const server = await createService('auth-service', async function authService(payload) {
    return payload
  })

  // TODO helper fns
  // server

  return server
}