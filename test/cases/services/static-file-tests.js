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
  testStaticFileDirectoryTreePopulation
}
