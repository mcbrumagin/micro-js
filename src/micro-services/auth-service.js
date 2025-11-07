import createService from '../micro-core/api/create-service.js'
import { createInMemoryCache } from './cache-service.js'
import { calculateSHA256Checksum, ed25519 } from '../micro-core/shared/crypto.js'
import HttpError from '../micro-core/http-primitives/http-error.js'
import envConfig from '../micro-core/shared/env-config.js'

import Logger from '../utils/logger.js'
import { next } from '../micro-core/http-primitives/next.js'
import { ref } from 'process'
import readStream from '../micro-core/http-primitives/read-stream.js'


const logger = new Logger({ logGroup: 'micro-services' })


/*




  hybrid JWT-lite w/ optional sessions 
  - opinionated ed25519 assymetric signing/verification, so no need for JWT header
  - expiration data is stored in refresh/access tokens that are part of the signature
  - expirations can also be saved in memory, if revocation is needed
  - on login, a refresh token will be returned to the client, along with an access token
  - the auth service will handle signing/authentication with the private key
  - the refresh token will be used by a client on landing to generate a new access token
  - [unimplemnted]access tokens can be verified by services that have the public key

  TODO: public key will be sent on a pubsub channel so other services can subscribe to it
  TODO: brute force protection for authentication endpoints (rate limiting, IP-based restrictions, CAPTCHAs)
*/


// eventually will be backed by a database
export default async function createAuthService({
  serviceName = 'auth-service',
  useSessions = false
} = {}) {
  if (useSessions && useSessions !== true && useSessions !== 'refresh-only') {
    throw new Error('useSessions must be true or "refresh-only"')
  }

  // for now we hardcode a single admin user
  const config = {
    ADMIN_USER: envConfig.getRequired('ADMIN_USER'),
    ADMIN_SECRET: envConfig.getRequired('ADMIN_SECRET'),
  }

  const keyPair = await ed25519.generateKeyPair()
  // console.log('keyPair:', keyPair)

  // should use an internal memory-only cache for security
  const defaultAccessTokenExpireTime = 60000 * 30
  const defaultRefreshTokenExpireTime = 60000 * 60 * 24


  const createToken = async (user, type = 'access') => {
    let expire = Date.now() + (type === 'access' ? defaultAccessTokenExpireTime : defaultRefreshTokenExpireTime)
    const payload = JSON.stringify({ user, expire })
    const signature = await ed25519.sign(keyPair, payload)
    logger.debug(`signature: ${signature}`)
    return encodeBase64(`${payload}.${signature}`)
  }

  const encodeBase64 = (data) => {
    return Buffer.from(data).toString('base64')
  }

  const decodeBase64 = (data) => {
    return Buffer.from(data, 'base64').toString('utf8')
  }

  const cache = !useSessions ? null :createInMemoryCache({
    expireTime: defaultAccessTokenExpireTime,
    evictionInterval: defaultAccessTokenExpireTime / 30
  })

  const authenticate = async (payload, request, response) => {
    logger.debug(`authenticating user ${payload.user}`)
    
    if (payload.user !== config.ADMIN_USER || payload.password !== config.ADMIN_SECRET) {
      throw new HttpError(401, 'Invalid credentials')
    }

    const refreshToken = await createToken(payload.user, 'refresh')
    const accessToken = await createToken(payload.user, 'access')
    
    if (useSessions) {
      cache.setex(`${payload.user}:refresh-token`, refreshToken, defaultRefreshTokenExpireTime)
      if (useSessions !== 'refresh-only') {
        cache.setex(`${payload.user}:access-token`, accessToken)
      }
    }

    // TODO different security settings for production/development
    response.writeHead(200, {
      'Set-Cookie': `refresh-token=${refreshToken}; Path=/; HttpOnly; Secure; SameSite=Strict`,
      'content-type': 'application/json'
    })
    response.end(JSON.stringify({ accessToken }))
    return next()
  }

  const getNewAccessToken = async (payload, request) => {
    logger.info(`checking cookie for refresh token ${request.headers.cookie}`)

    // TODO error if payload is not null? we are using the refresh token header
    if (!request.headers.cookie) {
      throw new HttpError(400, 'Invalid auth request')
    }

    let refreshTokenEncoded = request.headers.cookie.split('refresh-token=')[1]
    logger.info(`refresh token header: ${refreshTokenEncoded}`)
    let refreshToken = decodeBase64(refreshTokenEncoded)
    logger.info(`refresh token decoded: ${refreshToken}`)
    const [tokenPayload, signature] = refreshToken.split('.')

    payload = JSON.parse(tokenPayload)

    let isValid = await ed25519.verify(keyPair, tokenPayload, signature)

    if (!isValid) {
      throw new HttpError(400, 'Invalid auth request')
    } else if (payload.expire < Date.now()) {
      throw new HttpError(401, 'Expired refresh token')
    }

    if (useSessions) {
      let cacheToken = cache.get(`${payload.user}:refresh-token`)
      if (!cacheToken || cacheToken !== refreshTokenEncoded) {
        throw new HttpError(401, 'Invalid session')
      }
    }

    const accessToken = await createToken(payload.user, 'access')
    if (useSessions && useSessions !== 'refresh-only') {
      cache.setex(`${payload.user}:access-token`, accessToken)
    }

    return { accessToken }
  }

  const verifyAccessToken = async (accessToken) => {
    let decodedToken, tokenPayload, signature
    try {
      decodedToken = decodeBase64(accessToken)
      const parts = decodedToken.split('.')
      if (parts.length !== 2) {
        throw new Error('Invalid token format')
      }
      tokenPayload = parts[0]
      signature = parts[1]
    } catch (err) {
      throw new HttpError(401, 'Invalid access token')
    }

    let payload
    try {
      payload = JSON.parse(tokenPayload)
    } catch (err) {
      throw new HttpError(401, 'Invalid access token')
    }

    let isValid = await ed25519.verify(keyPair, tokenPayload, signature)
    if (!isValid) {
      throw new HttpError(401, 'Invalid access token')
    } else if (payload.expire < Date.now()) {
      throw new HttpError(401, 'Expired access token')
    }

    if (useSessions && useSessions !== 'refresh-only') {
      let cacheToken = cache.get(`${payload.user}:access-token`)
      if (!cacheToken || cacheToken !== accessToken) {
        throw new HttpError(401, 'Invalid session')
      }
    }
    return { isValid, status: 'valid access token' }
  }

  const server = await createService(serviceName, async function authService(payload, request, response) {
    // TODO bearer token?
    if (payload.authenticate) return authenticate(payload.authenticate, request, response)
    else if (payload.verifyAccess) return verifyAccessToken(payload.verifyAccess, request, response)
    else return getNewAccessToken(payload, request, response)
  })

  // TODO helper fns
  // server

  return server
}
