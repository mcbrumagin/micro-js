import crypto from 'crypto'
import { promisify } from 'util'

// --- simple fast checking for uniqueness ------------------------------------

export function calculateMD5Checksum(data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

export function calculateSHA1Checksum(data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}


// --- safe from collision attacks --------------------------------------------

export function calculateSHA256Checksum(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function calculateSHA512Checksum(data) {
  return crypto.createHash('sha512').update(data).digest('hex')
}

// --- Ed25519 key pair generation and signing --------------------------------
export async function generateAndSignEd25519() {

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'Ed25519',
      namedCurve: 'Ed25519' // Specify the curve
    },
    true, // extractable
    ['sign', 'verify']
  )

  const message = new TextEncoder().encode('This is a test message.')

  // Sign the message
  const signature = await crypto.subtle.sign(
    {
      name: 'Ed25519'
    },
    keyPair.privateKey,
    message
  )

  // Verify the signature
  const isValid = await crypto.subtle.verify(
    {
      name: 'Ed25519'
    },
    keyPair.publicKey,
    signature,
    message
  )

  console.log('Signature valid:', isValid)
}

// --- Ed25519 key pair generation, signing, and verification ----------------

export const ed25519 = {

  generateKeyPair: async function() {
    return await crypto.subtle.generateKey(
      {
        name: 'Ed25519',
        namedCurve: 'Ed25519' // Specify the curve
      },
      true, // extractable
      ['sign', 'verify']
    )
  },

  sign: async function(keyPair, data) {
    return Buffer.from(await crypto.subtle.sign(
      {
        name: 'Ed25519'
      },
      keyPair.privateKey,
      Buffer.from(data, 'utf8')
    )).toString('base64')
  },

  verify: async function(keyPair, data, signature) {
    console.info(`signature: ${signature}`)
    return await crypto.subtle.verify(
      { name: 'Ed25519' },
      keyPair.publicKey,
      Buffer.from(signature, 'base64'),
      Buffer.from(data, 'utf8')
    )
  }
}


// --- password hash and salt generation -------------------------------------
const pbkdf2 = promisify(crypto.pbkdf2)
const HASH_ITERATIONS = 100
const SALT_LENGTH = 16
const KEY_LENGTH = 32
const HASH_DIGEST = 'sha256'
export async function createSaltedHash(password) {

  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex')
  const derivedKey = await pbkdf2(password, salt, HASH_ITERATIONS, KEY_LENGTH, HASH_DIGEST)
  const hash = derivedKey.toString('hex')
  return { salt, hash }
}

// --- AES-256-GCM encryption/decryption -------------------------------------

export function encryptAES256GCM(plaintext, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  }
}

export function decryptAES256GCM(encryptedData, ivHex, authTagHex) {
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)

  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/* ----- Example usage: ---------------------------------------------
const message = 'This is a secret message for the encrypted session!'
const encryptedSession = encryptAES256GCM(message)

console.log('Encrypted Data:', encryptedSession.encryptedData)
console.log('IV:', encryptedSession.iv)
console.log('Auth Tag:', encryptedSession.authTag)

try {
  const decryptedMessage = decryptAES256GCM(
    encryptedSession.encryptedData,
    encryptedSession.iv,
    encryptedSession.authTag
  )
  console.log('Decrypted Message:', decryptedMessage)
} catch (error) {
  console.error('Decryption failed:', error.message)
}

------------------------------------------------------------------- */
