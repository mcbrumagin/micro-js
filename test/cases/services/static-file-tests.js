import { assert, assertErr, terminateAfter, startRegistry } from '../../core/index.js'

import {
  createStaticFileService,
  callService,
  Logger,
  HEADERS,
  COMMANDS
} from '../../../src/index.js'

import fs from 'fs'
import path from 'path'
import os from 'os'

const logger = new Logger()

async function createTempTestFiles() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'static-file-test-'))
  
  // Create test files
  fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>Index Page</body></html>')
  fs.writeFileSync(path.join(tempDir, 'about.html'), '<html><body>About Page</body></html>')
  
  // Create subdirectory with files
  const publicDir = path.join(tempDir, 'public')
  fs.mkdirSync(publicDir)
  fs.writeFileSync(path.join(publicDir, 'style.css'), 'body { color: red; }')
  fs.writeFileSync(path.join(publicDir, 'script.js'), 'console.log("hello");')
  
  // Create assets directory
  const assetsDir = path.join(publicDir, 'assets')
  console.info('assetsDir:', assetsDir)
  fs.mkdirSync(assetsDir)
  fs.writeFileSync(path.join(assetsDir, 'logo.png'), 'fake-png-data')
  fs.writeFileSync(path.join(assetsDir, 'icon.svg'), '<svg></svg>')
  
  return tempDir
}

function cleanupTempFiles(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function testBasicStaticFileServiceWorkingDir() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        // since we are using default, rootDir should be the current working directory
        // assumes we are running using ./test.sh from the root of the project
        fileMap: 'package.json'
      }),
      async () => {
        let result = await callService('static-file-service', { url: '/' })
        await assert(result || 'no result',
          r => r !== 'no result',
          r => r.name === 'micro-js'
        )
        return result
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testBasicStaticFileServiceExternalTempDir() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }),
      async () => {
        let result = await callService('static-file-service', { url: '/' })
        await assert(result, 
          r => r.includes('Index Page'),
          r => r.includes('<html>')
        )
        return result
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileWithMultipleRoutes() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: {
          '/': 'index.html',
          '/about': 'about.html'
        },
        externalRootDir: true
      }),
      async () => {
        let indexResult = await callService('static-file-service', { url: '/' })
        let aboutResult = await callService('static-file-service', { url: '/about' })
        
        await assert(indexResult, r => r.includes('Index Page'))
        await assert(aboutResult, r => r.includes('About Page'))
        
        return { index: indexResult, about: aboutResult }
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileWithWildcardMapping() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: {
          '/': 'index.html',
          '/public/*': 'public'
        },
        externalRootDir: true
      }),
      async () => {
        let styleResult = await callService('static-file-service', { url: '/public/style.css' })
        let scriptResult = await callService('static-file-service', { url: '/public/script.js' })
        
        await assert(styleResult, r => r.includes('body { color: red; }'))
        await assert(scriptResult, r => r.includes('console.log'))
        
        return { style: styleResult, script: scriptResult }
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileNotFound() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }),
      async () => {
        await assertErr(
          () => callService('static-file-service', { url: '/nonexistent.html' }),
          err => err.status === 404,
          err => err.message.includes('Not found')
        )
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileWithCustomResolver() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }, (url) => `Custom response for: ${url}`),
      async () => {
        let result = await callService('static-file-service', { url: 'custom-route' })
        await assert(result, r => r.includes('Custom response for: custom-route'))
        return result
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileInvalidRootDir() {
  await terminateAfter(
    await startRegistry(),
    async () => {
      await assertErr(
        () => createStaticFileService({
          rootDir: '/nonexistent/directory/path',
          fileMap: 'index.html',
          externalRootDir: true
        }),
        err => err.message.includes('does not exist')
      )
    }
  )
}

async function testStaticFileUrlSanitization() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }),
      async () => {
        // Test with trailing slash
        let result1 = await callService('static-file-service', { url: '/' })
        // Test without leading slash
        let result2 = await callService('static-file-service', { url: 'index.html/' })
        
        await assert(result1, r => r.includes('Index Page'))
        await assert(result2, r => r.includes('Index Page'))
        
        return { withSlash: result1, withoutSlash: result2 }
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileWithDefaultRequestUrl() {
  const tempDir = await createTempTestFiles()
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }),
      async () => {
        let result = await callService('static-file-service')
        await assert(
          result,
          r => r.includes('Index Page'),
          r => r.includes('<html>'),
        )
        return result
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileResponseHeaders() {
  const tempDir = await createTempTestFiles()
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html',
        externalRootDir: true
      }),
      async () => {
        let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/index.html`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service'
          }
        })
        
        await assert(response,
          r => r.status === 200,
          r => r.headers.get('content-type') === 'text/html',
          r => !!r.headers.get('content-length'),
          r => !!r.headers.get('last-modified')
        )
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileDirectoryTreePopulation() {
  const tempDir = await createTempTestFiles()
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: {
          '/': 'index.html',
          '/public/*': 'public'
        },
        externalRootDir: true
      }),
      async () => {
        let result = await callService('static-file-service', { url: '/public/assets/logo.png' })
        await assert(result, r => r.includes('fake-png-data'))
        return result
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileRangeHeaderAdvertisement() {
  const tempDir = await createTempTestFiles()
  
  // Create a test audio file
  const audioContent = Buffer.alloc(1000, 'audio-data-')
  fs.writeFileSync(path.join(tempDir, 'test.mp3'), audioContent)
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: { '/audio.mp3': 'test.mp3' },
        externalRootDir: true
      }),
      async () => {
        // Test that Accept-Ranges header is present on initial request
        let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service'
          }
        })
        
        await assert(response,
          r => r.status === 200,
          r => r.headers.get('accept-ranges') === 'bytes',
          r => r.headers.get('content-length') === '1000',
          r => !!r.headers.get('last-modified')
        )
        
        logger.info('✓ Accept-Ranges header properly advertised')
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileRangeRequest() {
  const tempDir = await createTempTestFiles()
  
  // Create a test audio file with known content
  const audioContent = Buffer.from('0123456789'.repeat(100)) // 1000 bytes
  fs.writeFileSync(path.join(tempDir, 'test.mp3'), audioContent)
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: { '/audio.mp3': 'test.mp3' },
        externalRootDir: true
      }),
      async () => {
        // Test partial content request (bytes 100-199)
        let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service',
            'Range': 'bytes=100-199'
          }
        })
        
        await assert(response,
          r => r.status === 206, // Partial Content
          r => r.headers.get('content-range') === 'bytes 100-199/1000',
          r => r.headers.get('content-length') === '100',
          r => r.headers.get('accept-ranges') === 'bytes'
        )
        
        const body = await response.arrayBuffer()
        const bodyString = Buffer.from(body).toString()
        
        // Verify we got the correct byte range
        await assert(bodyString,
          s => s.length === 100,
          s => s === '0123456789'.repeat(10) // bytes 100-199 should be this pattern
        )
        
        logger.info('✓ Range request properly handled (206 Partial Content)')
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileInvalidRangeRequest() {
  const tempDir = await createTempTestFiles()
  
  const audioContent = Buffer.alloc(1000, 'x')
  fs.writeFileSync(path.join(tempDir, 'test.mp3'), audioContent)
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: { '/audio.mp3': 'test.mp3' },
        externalRootDir: true
      }),
      async () => {
        // Test invalid range (beyond file size)
        let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service',
            'Range': 'bytes=2000-3000' // File is only 1000 bytes
          }
        })
        
        await assert(response,
          r => r.status === 416, // Range Not Satisfiable
          r => r.headers.get('content-range') === 'bytes */1000'
        )
        
        logger.info('✓ Invalid range request properly rejected (416)')
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileRangeWithIfRange() {
  const tempDir = await createTempTestFiles()
  
  const audioContent = Buffer.from('0123456789'.repeat(100))
  const filePath = path.join(tempDir, 'test.mp3')
  fs.writeFileSync(filePath, audioContent)
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: { '/audio.mp3': 'test.mp3' },
        externalRootDir: true
      }),
      async () => {
        // First, get the Last-Modified header
        let initialResponse = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service'
          }
        })
        
        const lastModified = initialResponse.headers.get('last-modified')
        await assert(lastModified, lm => !!lm)
        
        // Test If-Range with matching Last-Modified (should return partial content)
        let rangeResponse = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service',
            'Range': 'bytes=100-199',
            'If-Range': lastModified
          }
        })
        
        await assert(rangeResponse,
          r => r.status === 206, // Should return partial content
          r => r.headers.get('content-range') === 'bytes 100-199/1000'
        )
        
        // Test If-Range with non-matching date (should return full file)
        let fullResponse = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service',
            'Range': 'bytes=100-199',
            'If-Range': 'Wed, 01 Jan 2020 00:00:00 GMT' // Old date
          }
        })
        
        await assert(fullResponse,
          r => r.status === 200, // Should return full file
          r => r.headers.get('content-length') === '1000'
        )
        
        logger.info('✓ If-Range conditional requests properly handled')
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

async function testStaticFileOpenEndedRangeRequest() {
  const tempDir = await createTempTestFiles()
  
  const audioContent = Buffer.from('0123456789'.repeat(100)) // 1000 bytes
  fs.writeFileSync(path.join(tempDir, 'test.mp3'), audioContent)
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: { '/audio.mp3': 'test.mp3' },
        externalRootDir: true
      }),
      async () => {
        // Test open-ended range request (bytes 900- means from 900 to end)
        let response = await fetch(`${process.env.MICRO_REGISTRY_URL}/audio.mp3`, {
          headers: {
            [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
            [HEADERS.SERVICE_NAME]: 'static-file-service',
            'Range': 'bytes=900-'
          }
        })
        
        await assert(response,
          r => r.status === 206,
          r => r.headers.get('content-range') === 'bytes 900-999/1000',
          r => r.headers.get('content-length') === '100'
        )
        
        const body = await response.arrayBuffer()
        await assert(body, b => b.byteLength === 100)
        
        logger.info('✓ Open-ended range request properly handled')
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

// TODO write a new file and test that it can be found (and added to quicklookup?)
// async function testStaticFileWithEagerLookup() {}

export default {
  testBasicStaticFileServiceWorkingDir,
  testBasicStaticFileServiceExternalTempDir,
  testStaticFileWithMultipleRoutes,
  testStaticFileWithWildcardMapping,
  testStaticFileNotFound,
  testStaticFileWithCustomResolver,
  testStaticFileInvalidRootDir,
  testStaticFileUrlSanitization,
  testStaticFileWithDefaultRequestUrl,
  testStaticFileResponseHeaders,
  testStaticFileDirectoryTreePopulation,
  testStaticFileRangeHeaderAdvertisement,
  testStaticFileRangeRequest,
  testStaticFileInvalidRangeRequest,
  testStaticFileRangeWithIfRange,
  testStaticFileOpenEndedRangeRequest
}
