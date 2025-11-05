/**
 * Auto-Refresh Tests
 * Tests for static-file-service auto-refresh functionality
 */

import { assert, terminateAfter, startRegistry, sleep } from '../../core/index.js'
import { callService, createStaticFileService, createFileUploadService, publishMessage, Logger } from '../../../src/index.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const logger = new Logger()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const testDir = path.join(__dirname, '../../')

/**
 * Test manual file addition to index
 */
async function testManualFileAddition() {
  await terminateAfter(
    await startRegistry(),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },
      autoRefresh: false
    }),
    async ([registry, staticService]) => {
      // Check initial state
      const initialStats = staticService.getIndexStats()
      const initialCount = initialStats.totalFiles
      
      await assert(initialStats,
        s => s.mode === 'manual',
        s => s.totalFiles >= 0
      )

      const testFilePath = path.join(testDir, 'data/test-refresh.html')
      fs.writeFileSync(testFilePath, '<html>test</html>')
      
      try {
        // Manually add a file
        console.info('testFilePath:', testFilePath)
        staticService.addFile('test-refresh.html', testFilePath)

        // Verify stats updated
        const newStats = staticService.getIndexStats()
        await assert(newStats,
          s => s.totalFiles === initialCount + 1
        )

        await assert(staticService.quickLookup,
          q => q['/test-refresh.html'] === testFilePath
        )

        // Remove the file
        const removed = staticService.removeFile('test-refresh.html')
        await assert(removed, r => r === true)

        // Verify removal
        const finalStats = staticService.getIndexStats()
        await assert(finalStats,
          s => s.totalFiles === initialCount
        )
      } finally {
        fs.unlinkSync(testFilePath)
      }
      
    }
  )
}

/**
 * Test pubsub mode - file events trigger index updates
 */
async function testPubSubMode() {
  let fileAddedCalled = false
  
  await terminateAfter(
    await startRegistry(),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },
      autoRefresh: {
        mode: 'pubsub',
        pubsubChannel: 'test:file-uploaded',
        onFileAdded: (fileInfo) => {
          fileAddedCalled = true
        }
      }
    }),
    async ([registry, staticService]) => {
      // Call the service to set up subscriptions
      // await staticService.context.call('static-file-service')
      // TODO support for service paths?
      // await callService('static-file-service/index.html')
      // await sleep(100)
      
      const initialCount = staticService.getIndexStats().totalFiles
      
      // Publish a file uploaded event
      const testFilePath = path.join(testDir, 'data/test-pubsub.html')

      await fs.writeFileSync(testFilePath, '<html>test</html>')
      try {
        await publishMessage('test:file-uploaded', {
          urlPath: '/test-pubsub.html',
          filePath: testFilePath
        })
        
        await sleep(100)
        
        // Verify file was added
        await assert(staticService.quickLookup,
          q => q['/test-pubsub.html'] === testFilePath
        )
        
        await assert(fileAddedCalled, called => called === true)
        
        const newCount = staticService.getIndexStats().totalFiles
        await assert(newCount, c => c === initialCount + 1)
      } finally {
        fs.unlinkSync(testFilePath)
      }
    }
  )
}

/**
 * Test file deletion events
 */
async function testFileDeletionEvent() {
  let fileRemovedCalled = false
  
  await terminateAfter(
    await startRegistry(),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },
      autoRefresh: {
        mode: 'pubsub',
        pubsubChannel: 'test:file-uploaded',
        deletionChannel: 'test:file-deleted',
        onFileRemoved: (fileInfo) => {
          fileRemovedCalled = true
        }
      }
    }),
    async ([registry, staticService]) => {
      // Call the service to set up subscriptions
      // await staticService.context.call('static-file-service')
      // await sleep(100)
      
      // First add a file
      const testFilePath = path.join(testDir, 'data/test-delete.html')

      fs.writeFileSync(testFilePath, '<html>test</html>')

      try {
        staticService.addFile('/test-delete.html', testFilePath)
      
        logger.info('staticService.quickLookup:', staticService.quickLookup)
        await assert(staticService.quickLookup,
          q => q['/test-delete.html'] === testFilePath
        )
        
        // Publish deletion event
        await publishMessage('test:file-deleted', {
          urlPath: '/test-delete.html',
          filePath: testFilePath
        })
        
        await sleep(100)
        
        // Verify file was removed
        logger.info('staticService.quickLookup:', staticService.quickLookup)
        await assert(staticService.quickLookup,
          q => !q['/test-delete.html']
        )
        
        await assert(fileRemovedCalled, called => called === true)
      } finally {
        fs.unlinkSync(testFilePath)
      }
    }
  )
}

/**
 * Test full index refresh
 */
async function testFullIndexRefresh() {
  await terminateAfter(
    await startRegistry(),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },
      autoRefresh: false
    }),
    async ([registry, staticService]) => {
      // Add a file manually (simulating a file that wasn't in initial scan)
      const testFilePath = path.join(testDir, 'data/new-file.html')
      
      fs.writeFileSync(testFilePath, '<html>test</html>')

      try {
        // Get initial count
        const initialCount = staticService.getIndexStats().totalFiles
        
        // Refresh index
        const result = await staticService.refreshIndex()
        
        await assert(result,
          r => typeof r.added === 'number',
          r => typeof r.removed === 'number',
          r => typeof r.duration === 'number',
          r => r.duration >= 0
        )
        
        // Verify stats were updated
        const stats = staticService.getIndexStats()
        await assert(stats,
          s => s.refreshCount === 1,
          s => s.lastRefresh > 0
        )
      } finally {
        fs.unlinkSync(testFilePath)
      }
    }
  )
}

/**
 * Test pause/resume autoRefresh
 */
async function testPauseResumeAutoRefresh() {
  await terminateAfter(
    await startRegistry(),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },
      autoRefresh: {
        mode: 'interval',
        intervalMs: 5000
      }
    }),
    async ([registry, staticService]) => {
      let stats = staticService.getIndexStats()
      await assert(stats,
        s => s.isPaused === false,
        s => s.hasInterval === true
      )
      
      // Pause
      staticService.pauseAutoRefresh()
      stats = staticService.getIndexStats()
      await assert(stats, s => s.isPaused === true)
      
      // Resume
      staticService.resumeAutoRefresh()
      stats = staticService.getIndexStats()
      await assert(stats, s => s.isPaused === false)
    }
  )
}

/**
 * Test integrated upload service with static service
 */
async function testIntegratedUploadAndStatic() {
  let fileAddedCount = 0
  
  await terminateAfter(
    await startRegistry(),
    await createFileUploadService({
      uploadDir: path.join(testDir, 'data'),  // Upload directly to data dir
      publishFileEvents: true,
      eventChannel: 'test:upload-event',
      urlPathPrefix: '/'  // URLs will be like /uploaded.txt
    }),
    await createStaticFileService({
      rootDir: testDir,
      fileMap: { '/*': 'data' },  // Maps /* to data directory
      autoRefresh: {
        mode: 'pubsub',
        pubsubChannel: 'test:upload-event',
        onFileAdded: () => fileAddedCount++
      }
    }),
    async ([registry, uploadService, staticService]) => {
      const testFilePath = path.join(testDir, 'data/uploaded.txt')
      
      await uploadService.uploadFile(testFilePath, 'test-upload-1234')
      await sleep(150)  // Give time for event propagation
      
      try {
        // Verify file was added to static service index
        await assert(staticService.quickLookup,
          q => q['/uploaded.txt'] !== undefined,
          q => q['/uploaded.txt'] === testFilePath
        )
        
        await assert(fileAddedCount, count => count === 1)
      } finally {
        await uploadService.deleteFile(testFilePath)
        await sleep(100)
      }
    }
  )
}

export default {
  testManualFileAddition,
  testPubSubMode,
  testFileDeletionEvent,
  testFullIndexRefresh,
  testPauseResumeAutoRefresh,
  testIntegratedUploadAndStatic
}
