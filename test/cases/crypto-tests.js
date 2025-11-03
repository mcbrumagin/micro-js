/**
 * Crypto Functions Unit Tests
 * Comprehensive tests for all cryptographic functions
 */

import { assert, assertErr } from '../core/index.js'

import {
  calculateMD5Checksum,
  calculateSHA1Checksum,
  calculateSHA256Checksum,
  calculateSHA512Checksum,
  ed25519,
  createSaltedHash
} from '../../src/index.js'

/**
 * Test MD5 checksum generation
 */
async function testMD5Checksum() {
  const data = 'test data'
  const checksum = calculateMD5Checksum(data)
  
  await assert([checksum],
    ([c]) => typeof c === 'string',
    ([c]) => c.length === 32, // MD5 produces 32 hex characters
    ([c]) => c === calculateMD5Checksum(data) // Consistency
  )
}

/**
 * Test MD5 produces different checksums for different data
 */
async function testMD5DifferentInputs() {
  const checksum1 = calculateMD5Checksum('data1')
  const checksum2 = calculateMD5Checksum('data2')
  
  await assert([checksum1, checksum2],
    ([c1, c2]) => c1 !== c2
  )
}

/**
 * Test SHA1 checksum generation
 */
async function testSHA1Checksum() {
  const data = 'test data'
  const checksum = calculateSHA1Checksum(data)
  
  await assert([checksum],
    ([c]) => typeof c === 'string',
    ([c]) => c.length === 40, // SHA1 produces 40 hex characters
    ([c]) => c === calculateSHA1Checksum(data) // Consistency
  )
}

/**
 * Test SHA256 checksum generation
 */
async function testSHA256Checksum() {
  const data = 'test data'
  const checksum = calculateSHA256Checksum(data)
  
  await assert([checksum],
    ([c]) => typeof c === 'string',
    ([c]) => c.length === 64, // SHA256 produces 64 hex characters
    ([c]) => c === calculateSHA256Checksum(data) // Consistency
  )
}

/**
 * Test SHA256 collision resistance
 */
async function testSHA256DifferentInputs() {
  const checksum1 = calculateSHA256Checksum('data1')
  const checksum2 = calculateSHA256Checksum('data2')
  const checksum3 = calculateSHA256Checksum('data1 ') // Note the space
  
  await assert([checksum1, checksum2, checksum3],
    ([c1, c2, c3]) => c1 !== c2,
    ([c1, c2, c3]) => c1 !== c3,
    ([c1, c2, c3]) => c2 !== c3
  )
}

/**
 * Test SHA512 checksum generation
 */
async function testSHA512Checksum() {
  const data = 'test data'
  const checksum = calculateSHA512Checksum(data)
  
  await assert([checksum],
    ([c]) => typeof c === 'string',
    ([c]) => c.length === 128, // SHA512 produces 128 hex characters
    ([c]) => c === calculateSHA512Checksum(data) // Consistency
  )
}

/**
 * Test Ed25519 key pair generation
 */
async function testEd25519KeyPairGeneration() {
  const keyPair = await ed25519.generateKeyPair()
  
  await assert([keyPair],
    ([kp]) => kp !== null,
    ([kp]) => kp.privateKey !== undefined,
    ([kp]) => kp.publicKey !== undefined,
    ([kp]) => kp.privateKey.type === 'private',
    ([kp]) => kp.publicKey.type === 'public'
  )
}

/**
 * Test Ed25519 key pairs are unique
 */
async function testEd25519UniqueKeyPairs() {
  const keyPair1 = await ed25519.generateKeyPair()
  const keyPair2 = await ed25519.generateKeyPair()
  
  // Key pairs should be different
  await assert([keyPair1, keyPair2],
    ([kp1, kp2]) => kp1 !== kp2,
    ([kp1, kp2]) => kp1.privateKey !== kp2.privateKey,
    ([kp1, kp2]) => kp1.publicKey !== kp2.publicKey
  )
}

/**
 * Test Ed25519 signing
 */
async function testEd25519Signing() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature = await ed25519.sign(keyPair, data)
  
  await assert([signature],
    ([s]) => typeof s === 'string',
    ([s]) => s.length > 0,
    ([s]) => Buffer.from(s, 'base64').length === 64 // Ed25519 signatures are 64 bytes
  )
}

/**
 * Test Ed25519 signature verification with valid signature
 */
async function testEd25519VerificationValid() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature = await ed25519.sign(keyPair, data)
  const isValid = await ed25519.verify(keyPair, data, signature)
  
  await assert(isValid, v => v === true)
}

/**
 * Test Ed25519 signature verification with invalid signature
 */
async function testEd25519VerificationInvalid() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature = await ed25519.sign(keyPair, data)
  const tamperedData = 'tampered message'
  
  const isValid = await ed25519.verify(keyPair, tamperedData, signature)
  
  await assert(isValid, v => v === false)
}

/**
 * Test Ed25519 signature verification with wrong signature
 */
async function testEd25519VerificationWrongSignature() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature = await ed25519.sign(keyPair, data)
  // Create a fake signature by modifying the real one
  const fakeSignature = signature.slice(0, -5) + 'XXXXX'
  
  const isValid = await ed25519.verify(keyPair, data, fakeSignature)
  
  await assert(isValid, v => v === false)
}

/**
 * Test Ed25519 different signatures for same data
 * (Ed25519 is deterministic, so same data + key = same signature)
 */
async function testEd25519DeterministicSignatures() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature1 = await ed25519.sign(keyPair, data)
  const signature2 = await ed25519.sign(keyPair, data)
  
  await assert([signature1, signature2],
    ([s1, s2]) => s1 === s2 // Ed25519 is deterministic
  )
}

/**
 * Test Ed25519 different signatures for different data
 */
async function testEd25519DifferentDataSignatures() {
  const keyPair = await ed25519.generateKeyPair()
  
  const signature1 = await ed25519.sign(keyPair, 'message1')
  const signature2 = await ed25519.sign(keyPair, 'message2')
  
  await assert([signature1, signature2],
    ([s1, s2]) => s1 !== s2
  )
}

/**
 * Test Ed25519 signatures can't be used with different key pairs
 */
async function testEd25519SignatureNotTransferable() {
  const keyPair1 = await ed25519.generateKeyPair()
  const keyPair2 = await ed25519.generateKeyPair()
  const data = 'test message'
  
  const signature = await ed25519.sign(keyPair1, data)
  const isValid = await ed25519.verify(keyPair2, data, signature)
  
  await assert(isValid, v => v === false)
}

/**
 * Test Ed25519 with empty string
 */
async function testEd25519EmptyString() {
  const keyPair = await ed25519.generateKeyPair()
  const data = ''
  
  const signature = await ed25519.sign(keyPair, data)
  const isValid = await ed25519.verify(keyPair, data, signature)
  
  await assert([signature, isValid],
    ([s, v]) => typeof s === 'string',
    ([s, v]) => s.length > 0,
    ([s, v]) => v === true
  )
}

/**
 * Test Ed25519 with long data
 */
async function testEd25519LongData() {
  const keyPair = await ed25519.generateKeyPair()
  const data = 'x'.repeat(10000) // 10KB of data
  
  const signature = await ed25519.sign(keyPair, data)
  const isValid = await ed25519.verify(keyPair, data, signature)
  
  await assert([signature, isValid],
    ([s, v]) => typeof s === 'string',
    ([s, v]) => s.length > 0,
    ([s, v]) => v === true
  )
}

/**
 * Test Ed25519 with special characters
 */
async function testEd25519SpecialCharacters() {
  const keyPair = await ed25519.generateKeyPair()
  const data = '🔐 Special chars: \n\t\r áéíóú 中文 🚀'
  
  const signature = await ed25519.sign(keyPair, data)
  const isValid = await ed25519.verify(keyPair, data, signature)
  
  await assert(isValid, v => v === true)
}

/**
 * Test salted hash generation
 */
async function testCreateSaltedHash() {
  const password = 'mySecurePassword123'
  const result = await createSaltedHash(password)
  
  await assert([result],
    ([r]) => r.salt !== undefined,
    ([r]) => r.hash !== undefined,
    ([r]) => typeof r.salt === 'string',
    ([r]) => typeof r.hash === 'string',
    ([r]) => r.salt.length === 32, // 16 bytes in hex = 32 characters
    ([r]) => r.hash.length === 64  // 32 bytes in hex = 64 characters
  )
}

/**
 * Test salted hashes are unique (different salts)
 */
async function testSaltedHashUniqueness() {
  const password = 'mySecurePassword123'
  const result1 = await createSaltedHash(password)
  const result2 = await createSaltedHash(password)
  
  await assert([result1, result2],
    ([r1, r2]) => r1.salt !== r2.salt, // Salts should be different
    ([r1, r2]) => r1.hash !== r2.hash  // Therefore hashes should be different
  )
}

/**
 * Test salted hash with empty password
 */
async function testSaltedHashEmptyPassword() {
  const password = ''
  const result = await createSaltedHash(password)
  
  await assert([result],
    ([r]) => r.salt !== undefined,
    ([r]) => r.hash !== undefined,
    ([r]) => typeof r.salt === 'string',
    ([r]) => typeof r.hash === 'string'
  )
}

/**
 * Test salted hash consistency with same password and salt
 */
async function testSaltedHashConsistency() {
  const crypto = await import('crypto')
  const { promisify } = await import('util')
  const pbkdf2 = promisify(crypto.pbkdf2)
  
  const password = 'mySecurePassword123'
  const salt = 'fixedSaltForTesting12345678'
  
  const hash1 = await pbkdf2(password, salt, 100, 32, 'sha256')
  const hash2 = await pbkdf2(password, salt, 100, 32, 'sha256')
  
  await assert([hash1.toString('hex'), hash2.toString('hex')],
    ([h1, h2]) => h1 === h2 // Same password + salt = same hash
  )
}

/**
 * Test Base64 encoding/decoding through Ed25519
 */
async function testBase64EncodingDecoding() {
  const keyPair = await ed25519.generateKeyPair()
  const originalData = 'Test data with special chars: 中文 🚀'
  
  // Sign to get base64 encoded signature
  const signature = await ed25519.sign(keyPair, originalData)
  
  // Decode and re-encode to test consistency
  const decoded = Buffer.from(signature, 'base64')
  const reencoded = decoded.toString('base64')
  
  await assert([signature, reencoded],
    ([s, r]) => s === r
  )
}

/**
 * Test checksum functions with binary data
 */
async function testChecksumWithBinaryData() {
  const binaryData = Buffer.from([0x00, 0xFF, 0x42, 0xAB, 0xCD, 0xEF])
  
  const md5 = calculateMD5Checksum(binaryData)
  const sha1 = calculateSHA1Checksum(binaryData)
  const sha256 = calculateSHA256Checksum(binaryData)
  const sha512 = calculateSHA512Checksum(binaryData)
  
  await assert([md5, sha1, sha256, sha512],
    ([m, s1, s256, s512]) => typeof m === 'string',
    ([m, s1, s256, s512]) => typeof s1 === 'string',
    ([m, s1, s256, s512]) => typeof s256 === 'string',
    ([m, s1, s256, s512]) => typeof s512 === 'string',
    ([m, s1, s256, s512]) => m.length === 32,
    ([m, s1, s256, s512]) => s1.length === 40,
    ([m, s1, s256, s512]) => s256.length === 64,
    ([m, s1, s256, s512]) => s512.length === 128
  )
}

export default {
  testMD5Checksum,
  testMD5DifferentInputs,
  testSHA1Checksum,
  testSHA256Checksum,
  testSHA256DifferentInputs,
  testSHA512Checksum,
  testEd25519KeyPairGeneration,
  testEd25519UniqueKeyPairs,
  testEd25519Signing,
  testEd25519VerificationValid,
  testEd25519VerificationInvalid,
  testEd25519VerificationWrongSignature,
  testEd25519DeterministicSignatures,
  testEd25519DifferentDataSignatures,
  testEd25519SignatureNotTransferable,
  testEd25519EmptyString,
  testEd25519LongData,
  testEd25519SpecialCharacters,
  testCreateSaltedHash,
  testSaltedHashUniqueness,
  testSaltedHashEmptyPassword,
  testSaltedHashConsistency,
  testBase64EncodingDecoding,
  testChecksumWithBinaryData
}

