import createService from '../micro-core/create-service.js'
import { createInMemoryCache } from './cache-service.js'
import { calculateSHA256Checksum } from '../utils/crypto.js'
import HttpError from '../http-primitives/http-error.js'
import envConfig from '../micro-core/env-config.js'

import Logger from '../utils/logger.js'


const logger = new Logger('auth-service')

// eventually will be backed by a database

export default async function createAuthService({
  authType = 'basic',
  crypto = 'sha256',
  options = {},
} = {}) {

  // for now we hardcode a single admin user
  const config = {
    ADMIN_USER: envConfig.getRequired('ADMIN_USER'),
    ADMIN_SECRET: envConfig.getRequired('ADMIN_SECRET'),
  }

  // should use an internal memory-only cache for security
  const cache = createInMemoryCache({ expireTime: 60000 * 30, evictionInterval: 60000 })

  const authenticate = async (payload) => {
    // TODO accept user/pass or refresh token
    if (payload.user !== config.ADMIN_USER || payload.password !== config.ADMIN_SECRET) {
      return new HttpError(401, 'Invalid credentials')
    }
    const token = calculateSHA256Checksum(`${payload.user}:${payload.password}`)
    cache.set(`token:${token}`, {
      user: payload.user,
      expires: Date.now() + 60000 * 30
    })

    return { token }
  }

  const generateToken = async (payload) => {
    return payload
  }

  const verifyToken = async (payload) => {
    const token = cache.get(`token:${payload.token}`)
    if (!token) {
      return new HttpError(401, 'Invalid token')
    }
    if (token.expires < Date.now()) {
      return new HttpError(401, 'Token expired')
    }
    return token
    return payload
  }

  const server = await createService('auth-service', async function authService(payload) {
    if (payload.authenticate) return authenticate(payload)
    else if (payload.generateToken) return generateToken(payload)
    else if (payload.verifyToken) return verifyToken(payload)
    return new HttpError(400, 'Invalid payload')
  })

  // TODO helper fns
  // server

  return server
}
