/**
 * Media Streaming Example with Range Request Support
 * 
 * This example demonstrates how to serve audio/video files with full
 * seeking support using the static-file-service's range request capabilities.
 * 
 * Features demonstrated:
 * - Audio/video streaming with seeking
 * - Pre-seeking (dragging slider before playback)
 * - Multiple file types (audio, video, images)
 * - Proper MIME type detection
 */

import { 
  createStaticFileService,
  createRoute,
  startRegistry 
} from '../src/index.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Start the registry
const registry = await startRegistry(10000)
console.log('Registry started on port 10000')

// Create a static file service for media files
const mediaService = await createStaticFileService({
  serviceName: 'media-service',
  rootDir: path.join(__dirname, 'media'),
  urlRoot: '/media',
  fileMap: {
    '/audio/*': 'audio',
    '/video/*': 'video',
    '/images/*': 'images'
  },
  externalRootDir: true // Allow serving from outside process.cwd()
})

console.log('Media service started')
console.log('Range request support enabled for all files')

// Create a simple HTML page to test the streaming
const htmlPage = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Media Streaming Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .section {
      background: white;
      padding: 20px;
      margin: 20px 0;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; }
    h2 { color: #666; }
    audio, video {
      width: 100%;
      margin: 10px 0;
    }
    .info {
      background: #e3f2fd;
      padding: 15px;
      border-radius: 4px;
      margin: 10px 0;
    }
    .success {
      color: #2e7d32;
      font-weight: bold;
    }
    code {
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
  </style>
</head>
<body>
  <h1>🎵 Media Streaming with Range Support</h1>
  
  <div class="info">
    <p><strong>Range Request Support is Active!</strong></p>
    <p>Features enabled:</p>
    <ul>
      <li>✅ Seek to any position instantly</li>
      <li>✅ Pre-seek before playback starts</li>
      <li>✅ Proper buffering indicators</li>
      <li>✅ Bandwidth efficient (only requested ranges transferred)</li>
    </ul>
  </div>

  <div class="section">
    <h2>Audio Streaming</h2>
    <p>Try seeking to different positions before or during playback:</p>
    <audio controls preload="metadata">
      <source src="/media/audio/sample.mp3" type="audio/mpeg">
      Your browser does not support the audio element.
    </audio>
    <p><small>Open DevTools Network tab to see range requests in action</small></p>
  </div>

  <div class="section">
    <h2>Video Streaming</h2>
    <p>Drag the playback slider to test seeking:</p>
    <video controls preload="metadata">
      <source src="/media/video/sample.mp4" type="video/mp4">
      Your browser does not support the video element.
    </video>
  </div>

  <div class="section">
    <h2>Technical Details</h2>
    <p>Check your browser's developer console Network tab to see:</p>
    <ul>
      <li><code>Accept-Ranges: bytes</code> header on initial request</li>
      <li><code>Range: bytes=X-Y</code> header on seek requests</li>
      <li><code>206 Partial Content</code> status on range responses</li>
      <li><code>Content-Range: bytes X-Y/Total</code> on range responses</li>
    </ul>
  </div>

  <div class="section">
    <h2>How to Test</h2>
    <ol>
      <li>Open browser DevTools (F12) → Network tab</li>
      <li>Load this page and click on an audio/video request</li>
      <li>Verify initial request returns <code>200 OK</code> with <code>Accept-Ranges: bytes</code></li>
      <li>Drag the seek slider or click ahead in the timeline</li>
      <li>Observe new requests with <code>Range: bytes=...</code> header</li>
      <li>Verify responses return <code>206 Partial Content</code></li>
    </ol>
  </div>

  <script>
    // Log media events to demonstrate range support
    document.querySelectorAll('audio, video').forEach(element => {
      element.addEventListener('loadedmetadata', () => {
        console.log('✅ Media loaded, duration:', element.duration, 'seconds')
      })
      
      element.addEventListener('seeking', () => {
        console.log('⏩ Seeking to:', element.currentTime, 'seconds')
      })
      
      element.addEventListener('seeked', () => {
        console.log('✅ Seek completed at:', element.currentTime, 'seconds')
      })
      
      element.addEventListener('progress', () => {
        if (element.buffered.length > 0) {
          const buffered = element.buffered.end(element.buffered.length - 1)
          console.log('📊 Buffered:', buffered, 'of', element.duration, 'seconds')
        }
      })
    })
  </script>
</body>
</html>
`

// Create a route to serve the test page
await createRoute('/', async () => htmlPage, { contentType: 'text/html' })

console.log('')
console.log('========================================')
console.log('Media Streaming Example Running!')
console.log('========================================')
console.log('')
console.log('Open in browser: http://localhost:10000/')
console.log('')
console.log('To test with actual media files:')
console.log('1. Create this directory structure:')
console.log('   examples/media/audio/')
console.log('   examples/media/video/')
console.log('   examples/media/images/')
console.log('')
console.log('2. Add some media files:')
console.log('   examples/media/audio/sample.mp3')
console.log('   examples/media/video/sample.mp4')
console.log('')
console.log('3. Or test with any URL like:')
console.log('   http://localhost:10000/media/audio/your-file.mp3')
console.log('')
console.log('Press Ctrl+C to stop')
console.log('========================================')

