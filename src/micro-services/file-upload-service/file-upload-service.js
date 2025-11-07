import createService from '../../micro-core/api/create-service.js'
import Logger from '../../utils/logger.js'
import busboy from 'busboy'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import path from 'path'
import crypto from 'crypto'

const logger = new Logger({ logGroup: 'micro-services' })

/**
 * Handles streaming multipart file upload
 * Files are written to a temporary location with a crypto-generated name,
 * then renamed to the final name once all form fields are received.
 * This allows form fields to come in any order relative to the file.
 * 
 * @param {null} payload - Not used (payload is null when streamPayload: true)
 * @param {Object} req - HTTP request object (raw stream, not pre-read)
 * @param {Object} res - HTTP response object
 * @param {Object} options - Upload configuration
 * @param {string} options.uploadDir - Directory to save files
 * @param {string} options.fileFieldName - Name of the file input field
 * @param {Array<string>} options.textFields - Array of text field names to capture
 * @param {Function} options.getFileName - Function to determine final filename (optional)
 * @param {Function} options.validateFile - Function to validate file before saving (optional)
 * @param {Function} options.onSuccess - Callback on successful upload
 * @param {Function} options.onError - Callback on error
 */
function handleStreamingUpload(_payload, req, res, options) {
  const {
    uploadDir,
    fileFieldName,
    textFields = [],
    getFileName = null,
    validateFile = null,
    onSuccess = null,
    onError = null,
  } = options

  const bb = busboy({ headers: req.headers })
  
  const formData = {}
  let uploadError = null
  let writeStreamPromise = null
  let busboyFinished = false
  let uploadedFileInfo = null
  let tempFilePath = null
  let originalFileInfo = null

  // Rename temp file to final name and send response
  const finishUpload = async () => {
    if (!busboyFinished || !writeStreamPromise) {
      return // Not ready yet
    }

    try {
      // Wait for temp file to be written
      await writeStreamPromise
      
      const { filename, encoding, mimeType } = originalFileInfo
      
      // Determine final filename now that we have all form data
      let finalFileName = filename
      if (getFileName) {
        finalFileName = getFileName(filename, formData)
      }

      const finalPath = path.join(uploadDir, finalFileName)
      
      logger.debug(`Renaming temp file to: ${finalFileName}`)
      
      // Rename temp file to final name
      await fsPromises.rename(tempFilePath, finalPath)
      
      // Get final file stats
      const stats = await fsPromises.stat(finalPath)
      
      uploadedFileInfo = {
        originalName: filename,
        savedName: finalFileName,
        mimeType: mimeType,
        encoding: encoding,
        path: finalPath,
        size: stats.size
      }

      logger.info('Upload completed successfully', { fileName: finalFileName, size: stats.size })
      
      const successData = {
        success: true,
        message: 'File uploaded successfully',
        file: uploadedFileInfo,
        fields: formData
      }

      // Call onSuccess callback (will be the wrapped version from the service)
      if (onSuccess) {
        await onSuccess(successData, req, res)
      } else {
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify(successData))
        }
      }
    } catch (err) {
      logger.error('Error finalizing upload:', err)
      
      // Clean up temp file if it exists
      if (tempFilePath) {
        try {
          await fsPromises.unlink(tempFilePath)
          logger.debug('Cleaned up temp file after error')
        } catch (cleanupErr) {
          logger.error('Failed to clean up temp file:', cleanupErr)
        }
      }
      
      handleError(err, 'Failed to save file')
    }
  }

  // Centralized error handling
  const handleError = (error, message = 'Upload failed') => {
    if (res.headersSent) {
      return
    }

    const errorData = {
      success: false,
      error: message,
      details: error?.message
    }

    if (onError) {
      onError(errorData, error, req, res)
    } else {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
      }
      if (!res.writableEnded) {
        res.end(JSON.stringify(errorData))
      }
    }
  }

  // Handle file fields
  bb.on('file', (fieldname, file, info) => {
    if (fieldname !== fileFieldName) {
      logger.debug(`Ignoring file field: ${fieldname}`)
      file.resume() // Drain unwanted file streams
      return
    }

    const { filename, encoding, mimeType } = info
    logger.info(`Receiving file: ${filename} (${mimeType})`)

    // Validate file if validator provided
    if (validateFile) {
      logger.debug('Validating file')
      const validationResult = validateFile(info, formData)
      if (!validationResult.valid) {
        uploadError = new Error(validationResult.error)
        logger.warn('File validation failed:', validationResult.error)
        file.resume() // Drain the stream
        return
      }
    }

    // Store original file info for later renaming
    originalFileInfo = info

    // Generate unique temporary filename using crypto
    const tempFileName = `upload-${crypto.randomBytes(16).toString('hex')}.tmp`
    tempFilePath = path.join(uploadDir, tempFileName)

    logger.debug(`Writing to temporary file: ${tempFileName}`)

    // Create write stream and pipe directly to temp file
    const writeStream = fs.createWriteStream(tempFilePath)
    
    file.pipe(writeStream)

    // Create a promise that resolves when write stream finishes
    writeStreamPromise = new Promise((resolve, reject) => {
      writeStream.on('error', (err) => {
        logger.error('Error writing temp file:', err)
        uploadError = err
        file.resume() // Drain the stream
        reject(err)
      })

      writeStream.on('finish', () => {
        logger.debug(`Temp file written successfully: ${tempFileName}`)
        resolve()
      })
    })
  })

  // Handle text fields
  bb.on('field', (fieldname, val) => {
    logger.debug(`Field [${fieldname}]: ${val}`)
    
    // Capture all specified text fields (if textFields is empty, capture all)
    if (textFields.length === 0 || textFields.includes(fieldname)) {
      logger.debug(`Capturing field: ${fieldname}`)
      formData[fieldname] = val
    }
  })

  // Handle completion
  bb.on('close', async () => {
    logger.debug('Busboy parsing complete')
    
    if (uploadError) {
      // Clean up temp file if it exists
      if (tempFilePath) {
        try {
          await fsPromises.unlink(tempFilePath)
          logger.debug('Cleaned up temp file after error')
        } catch (cleanupErr) {
          logger.error('Failed to clean up temp file:', cleanupErr)
        }
      }
      return handleError(uploadError, uploadError.message || 'Failed to process file')
    }

    if (!writeStreamPromise) {
      logger.warn('No file uploaded')
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          success: false,
          error: 'No file uploaded'
        }))
      }
      return
    }

    busboyFinished = true
    finishUpload()
  })

  // Handle busboy errors
  bb.on('error', (err) => {
    logger.error('Busboy error:', err)
    handleError(err, 'Failed to parse multipart data')
  })

  // Pipe the request stream directly to busboy
  // When streamPayload: true is set, the request stream is not pre-read
  req.pipe(bb)
}

/**
 * Create upload directory if it doesn't exist
 * @param {string} uploadDir - Directory path to create
 */
async function ensureUploadDir(uploadDir) {
  try {
    await fsPromises.access(uploadDir)
  } catch {
    await fsPromises.mkdir(uploadDir, { recursive: true })
    logger.info(`Created upload directory: ${uploadDir}`)
  }
}

/**
 * Get list of uploaded files in a directory
 * @param {string} uploadDir - Directory to list files from
 * @returns {Promise<Array>} Array of file information objects
 */
async function listUploadedFiles(uploadDir) {
  try {
    const files = await fsPromises.readdir(uploadDir)
    
    const fileList = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(uploadDir, file)
        const stats = await fsPromises.stat(filePath)
        return {
          name: file,
          size: stats.size,
          modified: stats.mtime,
          path: filePath,
          isDirectory: stats.isDirectory()
        }
      })
    )

    return fileList.filter(f => !f.isDirectory)
  } catch (err) {
    logger.error('Error listing uploaded files:', err)
    throw err
  }
}

/**
 * Common file validators
 */
const validators = {
  /**
   * Validate file by mime type
   * @param {Array<string>} allowedTypes - Array of allowed mime types or patterns
   */
  mimeType: (allowedTypes) => {
    return (fileInfo, formData) => {
      const matches = allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          // Pattern match (e.g., 'audio/*', 'image/*')
          const prefix = type.slice(0, -2)
          return fileInfo.mimeType.startsWith(prefix)
        }
        return fileInfo.mimeType === type
      })

      if (!matches) {
        return {
          valid: false,
          error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`
        }
      }

      return { valid: true }
    }
  },

  /**
   * Validate file by extension
   * @param {Array<string>} allowedExtensions - Array of allowed extensions (with or without dot)
   */
  extension: (allowedExtensions) => {
    return (fileInfo, formData) => {
      const ext = path.extname(fileInfo.filename).toLowerCase()
      const normalizedExts = allowedExtensions.map(e => e.startsWith('.') ? e : '.' + e)
      
      if (!normalizedExts.includes(ext)) {
        return {
          valid: false,
          error: `Invalid file extension. Allowed: ${allowedExtensions.join(', ')}`
        }
      }

      return { valid: true }
    }
  },

  /**
   * Combine multiple validators
   * @param {Array<Function>} validatorFns - Array of validator functions
   */
  combine: (...validatorFns) => {
    return (fileInfo, formData) => {
      for (const validator of validatorFns) {
        const result = validator(fileInfo, formData)
        if (!result.valid) {
          return result
        }
      }
      return { valid: true }
    }
  }
}

/**
 * Create a file upload service
 * @param {Object} options - Configuration options
 * @param {string} options.uploadDir - Directory to save uploaded files (default: ./uploads)
 * @param {string} options.fileFieldName - Name of the file input field (default: 'file')
 * @param {Array<string>} options.textFields - Array of text field names to capture (default: [] - capture all)
 * @param {Function} options.getFileName - Function to determine final filename (optional)
 * @param {Function} options.validateFile - Function to validate file before saving (optional)
 * @param {Function} options.onSuccess - Callback on successful upload (optional)
 * @param {Function} options.onError - Callback on error (optional)
 * @returns {Promise<Service>} The created service
 */
export default async function createFileUploadService({
  serviceName = 'file-upload-service',
  uploadDir = path.join(process.cwd(), 'uploads'),
  fileFieldName = 'file',
  textFields = [],
  getFileName = null,
  validateFile = null,
  onSuccess = null,
  onError = null,
  useAuthService = null,
  publishFileEvents = true,  // NEW: auto-publish upload events
  updateChannel = 'micro:file-updated',  // NEW: customizable channel
  deleteChannel = 'micro:file-deleted',  // NEW: customizable channel
  urlPathPrefix = '/uploads'  // NEW: URL path prefix for uploaded files
} = {}) {
  // Ensure upload directory exists
  await ensureUploadDir(uploadDir)
  logger.info(`File upload service configured with uploadDir: ${uploadDir}`)

  const server = await createService(serviceName, async function fileUploadService(payload, request, response) {
    // The service is designed to work with HTTP multipart requests
    // It handles the response internally and returns false to signal this
    
    // Wrap onSuccess to publish file events
    const wrappedOnSuccess = async (successData, req, res) => {
      // Publish file uploaded event
      if (publishFileEvents && this.publish) {
        try {
          const { file } = successData
          const urlPath = path.join(urlPathPrefix, file.savedName).replace(/\\/g, '/')
          
          const fileEvent = {
            urlPath,
            filePath: file.path,
            size: file.size,
            mimeType: file.mimeType,
            originalName: file.originalName,
            savedName: file.savedName,
            timestamp: Date.now()
          }
          
          logger.info('publishing file event:', fileEvent)
          await this.publish(updateChannel, fileEvent)
        } catch (err) {
          logger.error('Failed to publish file event:', err)
        }
      }
      
      // Call original onSuccess if provided
      if (onSuccess) {
        onSuccess(successData, req, res)
      } else {
        // Default success response
        if (!res.headersSent) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify(successData))
        }
      }
    }
    
    handleStreamingUpload(payload, request, response, {
      uploadDir,
      fileFieldName,
      textFields,
      getFileName,
      validateFile,
      onSuccess: wrappedOnSuccess,
      onError
    })
    
    // Return false to indicate that the response is handled by the function itself
    // This prevents the framework from trying to send another response
    return false // TODO return next()? preventDefault()? next({ preventDefault: true })?
    // return next({ reason: 'file upload', file: filePath })
  }, {
    useAuthService,
    streamPayload: true // Don't buffer the request - we need the raw stream for multipart uploads
  })

  // Attach helper functions to the service
  server.ensureUploadDir = ensureUploadDir
  server.listUploadedFiles = () => listUploadedFiles(uploadDir)
  server.getUploadDir = () => uploadDir

  /**
   * Helper to manually upload a file and publish event
   * @param {string} filePath - Full path where file should be written
   * @param {string|Buffer} fileData - File content to write
   */
  server.uploadFile = async function uploadFile(filePath, fileData) {
    await fsPromises.writeFile(filePath, fileData)

    if (publishFileEvents) {
      const fileName = path.basename(filePath)
      const urlPath = path.join(urlPathPrefix, fileName).replace(/\\/g, '/')
      
      await server.context.publish(updateChannel, {
        urlPath,
        filePath,
        fileName,
        timestamp: Date.now()
      })
    }
  }

  /**
   * Helper to manually delete a file and publish event
   * @param {string} filePath - Full path to file to delete
   */
  server.deleteFile = async function deleteFile(filePath) {
    await fsPromises.unlink(filePath)
    
    if (publishFileEvents) {
      const fileName = path.basename(filePath)
      const urlPath = path.join(urlPathPrefix, fileName).replace(/\\/g, '/')
      
      await server.context.publish(deleteChannel, {
        urlPath,
        filePath,
        fileName,
        timestamp: Date.now()
      })
    }
  }

  // Override terminate to log cleanup
  const originalTerminate = server.terminate.bind(server)
  server.terminate = async () => {
    logger.info('Terminating file upload service')
    await originalTerminate()
    logger.info('File upload service terminated')
  }

  return server
}

// Export helper utilities for use in other modules
export { ensureUploadDir, listUploadedFiles, validators }
