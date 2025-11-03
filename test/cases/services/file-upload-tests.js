import { assert, assertErr, terminateAfter, startRegistry } from '../../core/index.js'

import {
  createFileUploadService,
  callService,
  Logger,
  HEADERS,
  COMMANDS
} from '../../../src/index.js'

import { validators } from '../../../src/micro-services/file-upload-service/file-upload-service.js'
import FormData from 'form-data'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import path from 'path'
import os from 'os'
import http from 'http'

const logger = new Logger()

async function createTempUploadDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-upload-test-'))
  return tempDir
}

function cleanupTempFiles(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * Create a multipart form request through the registry
 * This ensures the registry proxy can handle streaming multipart data
 */
async function createMultipartRequest(formData, serviceName = 'file-upload-service') {
  return new Promise((resolve, reject) => {
    const registryUrl = new URL(process.env.MICRO_REGISTRY_URL || 'http://localhost:10000')
    
    // Add service-call header to route through registry
    const headers = {
      ...formData.getHeaders(),
      [HEADERS.COMMAND]: COMMANDS.SERVICE_CALL,
      [HEADERS.SERVICE_NAME]: serviceName
    }

    const options = {
      hostname: registryUrl.hostname,
      port: registryUrl.port,
      path: '/',
      method: 'POST',
      headers: headers
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        logger.debug('Response received:', { status: res.statusCode, dataLength: data.length, data: data.substring(0, 200) })
        try {
          resolve(JSON.parse(data))
        } catch (err) {
          logger.error('Failed to parse response as JSON:', err, 'Raw data:', data)
          resolve(data)
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    formData.pipe(req)
  })
}

async function testBasicFileUpload() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file'
      }),
      async (registry, uploadService) => {
        // Create a test file
        const testFilePath = path.join(uploadDir, 'test-input.txt')
        await fsPromises.writeFile(testFilePath, 'Hello, World!')
        
        // Create form data
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test-input.txt')
        
        // Upload the file through the registry
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.success === true,
          r => r.message === 'File uploaded successfully',
          r => r.file.originalName === 'test-input.txt',
          r => r.file.savedName === 'test-input.txt',
          r => r.file.size > 0
        )
        
        // Verify file was uploaded
        const uploadedFile = path.join(uploadDir, 'test-input.txt')
        const uploadedContent = await fsPromises.readFile(uploadedFile, 'utf-8')
        await assert(uploadedContent, c => c === 'Hello, World!')
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithTextFields() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        textFields: ['title', 'description']
      }),
      async (registry, uploadService) => {
        const testFilePath = path.join(uploadDir, 'test-with-fields.txt')
        await fsPromises.writeFile(testFilePath, 'Test content')
        
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test-with-fields.txt')
        form.append('title', 'Test Title')
        form.append('description', 'Test Description')
        form.append('ignored', 'This should not be captured')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.success === true,
          r => r.fields.title === 'Test Title',
          r => r.fields.description === 'Test Description',
          r => r.fields.ignored === undefined // Should not be captured
        )
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithAllTextFields() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        textFields: [] // Empty array = capture all
      }),
      async (registry, uploadService) => {
        const testFilePath = path.join(uploadDir, 'test-all-fields.txt')
        await fsPromises.writeFile(testFilePath, 'Test content')
        
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test-all-fields.txt')
        form.append('field1', 'Value 1')
        form.append('field2', 'Value 2')
        form.append('field3', 'Value 3')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.success === true,
          r => r.fields.field1 === 'Value 1',
          r => r.fields.field2 === 'Value 2',
          r => r.fields.field3 === 'Value 3'
        )
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithCustomFileName() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        textFields: ['userId'],
        getFileName: (originalName, formData) => {
          const ext = path.extname(originalName)
          return `user-${formData.userId}-file${ext}`
        }
      }),
      async (registry, uploadService) => {
        const testFilePath = path.join(uploadDir, 'original.txt')
        await fsPromises.writeFile(testFilePath, 'Test content')
        
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'original.txt')
        form.append('userId', '12345')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.success === true,
          r => r.file.originalName === 'original.txt',
          r => r.file.savedName === 'user-12345-file.txt'
        )
        
        // Verify file was saved with custom name
        const uploadedFile = path.join(uploadDir, 'user-12345-file.txt')
        const exists = fs.existsSync(uploadedFile)
        await assert(exists, e => e === true)
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithMimeTypeValidation() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        validateFile: validators.mimeType(['text/plain', 'text/html'])
      }),
      async (registry, uploadService) => {
        // Valid upload - text/plain
        const validFilePath = path.join(uploadDir, 'valid.txt')
        await fsPromises.writeFile(validFilePath, 'Valid content')
        
        const validForm = new FormData()
        validForm.append('file', fs.createReadStream(validFilePath), 'valid.txt')
        
        const validResult = await createMultipartRequest(validForm)
        
        await assert(validResult,
          r => r.success === true,
          r => r.file.mimeType === 'text/plain'
        )
        
        return validResult
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithExtensionValidation() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        validateFile: validators.extension(['.txt', '.md'])
      }),
      async (registry, uploadService) => {
        // Valid upload
        const validFilePath = path.join(uploadDir, 'valid.txt')
        await fsPromises.writeFile(validFilePath, 'Valid content')
        
        const validForm = new FormData()
        validForm.append('file', fs.createReadStream(validFilePath), 'valid.txt')
        
        const validResult = await createMultipartRequest(validForm)
        
        await assert(validResult,
          r => r.success === true,
          r => r.file.originalName === 'valid.txt'
        )
        
        return validResult
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadValidationFailure() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        validateFile: validators.extension(['.pdf', '.doc'])
      }),
      async (registry, uploadService) => {
        // Invalid upload - wrong extension
        const invalidFilePath = path.join(uploadDir, 'invalid.txt')
        await fsPromises.writeFile(invalidFilePath, 'Invalid content')
        
        const invalidForm = new FormData()
        invalidForm.append('file', fs.createReadStream(invalidFilePath), 'invalid.txt')
        
        const invalidResult = await createMultipartRequest(invalidForm)
        
        await assert(invalidResult,
          r => r.success === false,
          r => r.error.includes('Invalid file extension')
        )
        
        return invalidResult
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadWithCombinedValidators() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        validateFile: validators.combine(
          validators.extension(['.txt', '.md']),
          validators.mimeType(['text/plain', 'text/markdown'])
        )
      }),
      async (registry, uploadService) => {
        const validFilePath = path.join(uploadDir, 'valid.txt')
        await fsPromises.writeFile(validFilePath, 'Valid content')
        
        const validForm = new FormData()
        validForm.append('file', fs.createReadStream(validFilePath), 'valid.txt')
        
        const validResult = await createMultipartRequest(validForm)
        
        await assert(validResult,
          r => r.success === true
        )
        
        return validResult
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadNoFile() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file'
      }),
      async (registry, uploadService) => {
        // Send form without file
        const form = new FormData()
        form.append('someField', 'someValue')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.success === false,
          r => r.error === 'No file uploaded'
        )
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadListFiles() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file'
      }),
      async ([registry, uploadService]) => {
        // Upload multiple files
        for (let i = 1; i <= 3; i++) {
          const testFilePath = path.join(uploadDir, `input-${i}.txt`)
          await fsPromises.writeFile(testFilePath, `Content ${i}`)
          
          const form = new FormData()
          form.append('file', fs.createReadStream(testFilePath), `file-${i}.txt`)
          
          await createMultipartRequest(form)
        }
        
        // List uploaded files
        const files = await uploadService.listUploadedFiles()
        
        await assert(files,
          f => f.length >= 3,
          f => f.every(file => file.name && file.size && file.path)
        )
        
        return files
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadCustomSuccessHandler() {
  const uploadDir = await createTempUploadDir()
  let customHandlerCalled = false
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        onSuccess: (data, req, res) => {
          customHandlerCalled = true
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            customResponse: true,
            fileName: data.file.savedName,
            message: 'Custom success!',
            status: 200
          }))
        }
      }),
      async ([registry, uploadService]) => {
        const testFilePath = path.join(uploadDir, 'test.txt')
        await fsPromises.writeFile(testFilePath, 'Test content')
        
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test.txt')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.customResponse === true,
          r => r.message === 'Custom success!',
          r => r.fileName === 'test.txt'
        )
        
        await assert(customHandlerCalled, c => c === true)
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testFileUploadCustomErrorHandler() {
  const uploadDir = await createTempUploadDir()
  let customErrorHandlerCalled = false
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file',
        validateFile: validators.extension(['.pdf']),
        onError: (errorData, error, req, res) => {
          customErrorHandlerCalled = true
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            customError: true,
            message: 'Upload rejected by custom handler',
            originalError: errorData.error,
            status: 400
          }))
        }
      }),
      async (registry, uploadService) => {
        const testFilePath = path.join(uploadDir, 'test.txt')
        await fsPromises.writeFile(testFilePath, 'Test content')
        
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test.txt')
        
        const result = await createMultipartRequest(form)
        
        await assert(result,
          r => r.customError === true,
          r => r.message === 'Upload rejected by custom handler'
        )
        
        await assert(customErrorHandlerCalled, c => c === true)
        
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testLargeFileUpload() {
  const uploadDir = await createTempUploadDir()
  
  try {
    await terminateAfter(
      await startRegistry(),
      await createFileUploadService({
        uploadDir,
        fileFieldName: 'file'
      }),
      async (registry, uploadService) => {
        const testFilePath = path.join(process.cwd(), 'test/data/test-track.wav')
        const form = new FormData()
        form.append('file', fs.createReadStream(testFilePath), 'test-track.wav')
        const result = await createMultipartRequest(form)
        await assert(result,
          r => r.success === true,
          r => r.file.originalName === 'test-track.wav',
          r => r.file.savedName === 'test-track.wav',
          r => r.file.size === 9098142
        )
        return result
      }
    )
  } finally {
    cleanupTempFiles(uploadDir)
  }
}

async function testValidatorMimeTypeWildcard() {
  const validator = validators.mimeType(['image/*', 'video/*'])
  
  // Test image/* pattern
  const imageResult = validator({ filename: 'test.png', mimeType: 'image/png' }, {})
  await assert(imageResult, r => r.valid === true)
  
  // Test video/* pattern
  const videoResult = validator({ filename: 'test.mp4', mimeType: 'video/mp4' }, {})
  await assert(videoResult, r => r.valid === true)
  
  // Test rejection
  const textResult = validator({ filename: 'test.txt', mimeType: 'text/plain' }, {})
  await assert(textResult,
    r => r.valid === false,
    r => r.error.includes('Invalid file type')
  )
}

async function testValidatorExtensionNormalization() {
  // Test with and without leading dot
  const validator1 = validators.extension(['.txt', 'md'])
  const validator2 = validators.extension(['txt', '.md'])
  
  const result1 = validator1({ filename: 'test.txt', mimeType: 'text/plain' }, {})
  const result2 = validator2({ filename: 'test.md', mimeType: 'text/markdown' }, {})
  
  await assert(result1, r => r.valid === true)
  await assert(result2, r => r.valid === true)
}

export default {
  testBasicFileUpload,
  testFileUploadWithTextFields,
  testFileUploadWithAllTextFields,
  testFileUploadWithCustomFileName,
  testFileUploadWithMimeTypeValidation,
  testFileUploadWithExtensionValidation,
  testFileUploadValidationFailure,
  testFileUploadWithCombinedValidators,
  testFileUploadNoFile,
  testFileUploadListFiles,
  testFileUploadCustomSuccessHandler,
  testFileUploadCustomErrorHandler,
  testLargeFileUpload,
  testValidatorMimeTypeWildcard,
  testValidatorExtensionNormalization
}
