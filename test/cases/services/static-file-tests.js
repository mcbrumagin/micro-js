import { assert, assertErr, terminateAfter, startRegistry } from '../../core/index.js'
import { callService, Logger } from '../../../src/index.js'
import createStaticFileService from '../../../src/micro-services/static-file-service.js'
import fs from 'fs'
import path from 'path'
import os from 'os'

const logger = new Logger({
  // logGroup: 'staticFileServiceTests',
  includeLogLineNumbers: true,
  // warnLevel: true
})

// Helper to create temporary test files
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
  fs.mkdirSync(assetsDir)
  fs.writeFileSync(path.join(assetsDir, 'logo.png'), 'fake-png-data')
  fs.writeFileSync(path.join(assetsDir, 'icon.svg'), '<svg></svg>')
  
  return tempDir
}

// Helper to cleanup temp files
function cleanupTempFiles(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

async function testBasicStaticFileService() {
  const tempDir = await createTempTestFiles()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html'
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
        }
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
          '/public/*': 'public/*'
        }
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
        fileMap: 'index.html'
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
        fileMap: 'index.html'
      }, (url) => {
        console.warn({url})
        // Custom resolver for unmatched routes
        return `Custom response for: ${url}`
      }),
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
          fileMap: 'index.html'
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
        fileMap: 'index.html'
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

async function testStaticFileWithNoUrl() {
  const tempDir = await createTempTestFiles()
  try {
    await terminateAfter(
      await startRegistry(),
      await createStaticFileService({
        rootDir: tempDir,
        urlRoot: '/',
        fileMap: 'index.html'
      }),
      async () => {
        await assertErr(
          () => callService('static-file-service', { url: '' }),
          err => err.status === 400,
          err => err.message.includes('url is required')
        )
      }
    )
  } finally {
    cleanupTempFiles(tempDir)
  }
}

export default {
  testBasicStaticFileService,
  testStaticFileWithMultipleRoutes,
  testStaticFileWithWildcardMapping,
  testStaticFileNotFound,
  testStaticFileWithCustomResolver,
  testStaticFileInvalidRootDir,
  testStaticFileUrlSanitization,
  testStaticFileWithNoUrl
}

