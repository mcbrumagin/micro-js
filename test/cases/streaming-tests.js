import { assert, assertErr, sleep, terminateAfter, startRegistry } from '../core/index.js'
import { createService, callService, Logger } from '../../src/index.js'
import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'

const logger = new Logger({
  // logGroup: 'streamingTests',
  includeLogLineNumbers: true,
  // warnLevel: true
})

/**
 * Test that JSON payloads still work (backward compatibility)
 */
async function testJsonPayloadStillWorks() {
  await terminateAfter(
    await startRegistry(),
    await createService('jsonEcho', function jsonEchoService(payload) {
      return payload
    }),
    async () => {
      const result = await callService('jsonEcho', { test: 'data', nested: { value: 123 } })
      
      await assert(result,
        r => typeof r === 'object',
        r => r.test === 'data',
        r => r.nested.value === 123
      )
      
      logger.debug('✓ JSON payloads work')
      return result
    }
  )
}

/**
 * Test that buffers can be sent and received
 */
async function testBufferStreaming() {
  await terminateAfter(
    await startRegistry(),
    await createService('bufferEcho', function bufferEchoService(payload) {
      // Service should receive the buffer as-is
      if (!Buffer.isBuffer(payload)) {
        throw new Error(`Expected buffer, got ${typeof payload}`)
      }
      return payload
    }),
    async () => {
      const testData = Buffer.from('Hello binary world!')
      const result = await callService('bufferEcho', testData)
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === testData.length,
        r => Buffer.compare(r, testData) === 0
      )
      
      logger.debug('✓ Buffer streaming works')
      return result
    }
  )
}

/**
 * Test that binary file data can be streamed through registry
 */
async function testBinaryFileStreaming() {
  await terminateAfter(
    await startRegistry(),
    await createService('fileProcessor', function fileProcessorService(payload) {
      // Verify we received a buffer
      if (!Buffer.isBuffer(payload)) {
        throw new Error(`Expected buffer, got ${typeof payload}`)
      }
      
      // Echo it back
      return payload
    }),
    async () => {
      const testFilePath = path.join(process.cwd(), 'test/services/files/test-track.wav')
      const fileData = fs.readFileSync(testFilePath)
      
      logger.debug(`Sending file of size: ${fileData.length} bytes`)
      
      const result = await callService('fileProcessor', fileData)
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === fileData.length,
        r => r.length > 0,
        r => Buffer.compare(r, fileData) === 0
      )
      
      logger.debug(`✓ Binary file streaming works (${result.length} bytes)`)
      return result
    }
  )
}

/**
 * Test that service can process and modify binary data
 */
async function testBinaryDataProcessing() {
  await terminateAfter(
    await startRegistry(),
    await createService('binaryProcessor', function binaryProcessorService(payload) {
      if (!Buffer.isBuffer(payload)) {
        throw new Error(`Expected buffer, got ${typeof payload}`)
      }
      
      // Process: reverse the buffer
      const reversed = Buffer.from(payload).reverse()
      return reversed
    }),
    async () => {
      const testData = Buffer.from('ABCDEF')
      const result = await callService('binaryProcessor', testData)
      const expected = Buffer.from('FEDCBA')
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === testData.length,
        r => Buffer.compare(r, expected) === 0,
        r => r.toString() === 'FEDCBA'
      )
      
      logger.debug('✓ Binary data processing works')
      return result
    }
  )
}

/**
 * Test mixed content types in sequence
 */
async function testMixedContentTypes() {
  await terminateAfter(
    await startRegistry(),
    await createService('polyglot', function polyglotService(payload) {
      if (Buffer.isBuffer(payload)) {
        return Buffer.from('GOT BUFFER')
      } else if (typeof payload === 'object') {
        return { type: 'object', received: payload }
      } else {
        return { type: 'unknown', received: payload }
      }
    }),
    async () => {
      // Test 1: Send JSON
      const jsonResult = await callService('polyglot', { test: 'json' })
      await assert(jsonResult,
        r => r.type === 'object',
        r => r.received.test === 'json'
      )
      
      // Test 2: Send Buffer
      const bufferResult = await callService('polyglot', Buffer.from('test'))
      await assert(bufferResult,
        r => Buffer.isBuffer(r),
        r => r.toString() === 'GOT BUFFER'
      )
      
      // Test 3: Send JSON again (ensure state is clean)
      const jsonResult2 = await callService('polyglot', { test: 'json2' })
      await assert(jsonResult2,
        r => r.type === 'object',
        r => r.received.test === 'json2'
      )
      
      logger.debug('✓ Mixed content types work')
      return jsonResult2
    }
  )
}

/**
 * Test large buffer transfer
 */
async function testLargeBufferTransfer() {
  await terminateAfter(
    await startRegistry(),
    await createService('largeBufferEcho', function largeBufferEchoService(payload) {
      if (!Buffer.isBuffer(payload)) {
        throw new Error(`Expected buffer, got ${typeof payload}`)
      }
      return payload
    }),
    async () => {
      // Create a 1MB buffer with pattern
      const size = 1024 * 1024 // 1MB
      const largeBuffer = Buffer.alloc(size)
      for (let i = 0; i < size; i++) {
        largeBuffer[i] = i % 256
      }
      
      logger.debug(`Sending large buffer: ${size} bytes`)
      
      const result = await callService('largeBufferEcho', largeBuffer)
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === size,
        r => Buffer.compare(r, largeBuffer) === 0
      )
      
      logger.debug(`✓ Large buffer transfer works (${result.length} bytes)`)
      return result
    }
  )
}

/**
 * Test empty buffer
 */
async function testEmptyBuffer() {
  await terminateAfter(
    await startRegistry(),
    await createService('emptyBufferEcho', function emptyBufferEchoService(payload) {
      return payload
    }),
    async () => {
      const emptyBuffer = Buffer.alloc(0)
      const result = await callService('emptyBufferEcho', emptyBuffer)
      
      await assert(result,
        r => Buffer.isBuffer(r),
        r => r.length === 0
      )
      
      logger.debug('✓ Empty buffer works')
      return result
    }
  )
}

export default {
  testJsonPayloadStillWorks,
  testBufferStreaming,
  testBinaryFileStreaming,
  testBinaryDataProcessing,
  testMixedContentTypes,
  testLargeBufferTransfer,
  testEmptyBuffer
}

