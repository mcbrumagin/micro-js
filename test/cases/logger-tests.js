import { assert, assertErr } from '../core/assert.js'
import { Logger } from '../../src/index.js'

const logger = new Logger()

async function testLoggerStringify() {
  let escape = 'escape test'
  let logObj = {a: 1, b: "2", d: true, e: null}
  let logFn = () => logger.log(`hey ${escape}`)
  let logStr = 'hello string'
  let logErr = new Error('test error')
  await assert(
    logger.warn({logObj, logFn, logStr, logErr}),
    s => s.includes('a: 1,'),
    s => s.includes('b: "2",'),
    s => s.includes('d: true,'),
    s => s.includes('e: null,'),
    s => s.includes('`() => logger.log(\\`hey ${escape}\\`)`'),
    s => s.includes('"hello string"'),
    s => s.includes('`Error: test error')
  )
} 

async function testLoggerError() {
  await assert(
    // regular assert since the logger doesn't throw this error
    () => logger.error(new Error('test error log fn')),
    res => res.includes('test error')
  )
}

async function testLoggerNoLevel() {
  // Test creating a logger with limited levels
  const testLogger = new Logger({}, 'info', ['info'])
  await assert(
    testLogger.info('test'),
    s => s === undefined || s.includes('test')
  )
}

async function testLoggerColors() {
  let paintTestColor = color => logger.writeColor(color, ` ${color} |`)
  let paintTestColors = () => paintTestColor('white')
    + paintTestColor('green')
    + paintTestColor('magenta')
    + paintTestColor('red')
    + paintTestColor('blue')
    + paintTestColor('yellow')
    + paintTestColor('cyan')
    + paintTestColor('reset')

  await assert(
    logger.info(paintTestColors()),
    s => s.includes('\x1b[31m'),
    s => s.includes('\x1b[32m'),
    s => s.includes('\x1b[33m'),
    s => s.includes('\x1b[34m'),
    s => s.includes('\x1b[35m'),
    s => s.includes('\x1b[36m'),
    s => s.includes('\x1b[0m'),
    s => s.includes('green'),
    s => s.includes('magenta'),
    s => s.includes('red'),
    s => s.includes('blue'),
    s => s.includes('yellow'),
    s => s.includes('cyan'),
    s => s.includes('reset')
  )
}

async function testLoggerDuplicateLevel() {
  await assertErr(
    () => new Logger({}, null, ['info', 'info']),
    err => err.message.includes('Already created log fn for level info')
  )
}

async function testLoggerDepthLimit() {
  // Test default depth limit of 2
  let deepObj = {
    level0: {
      level1: {
        level2: {
          level3: 'too deep'
        }
      }
    }
  }
  
  let testLogger = new Logger()
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('level2'),
    s => !s.includes('level3'),
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerCustomDepthLimit() {
  // Test custom depth limit of 3
  let deepObj = {
    level0: {
      level1: {
        level2: {
          level3: {
            level4: 'too deep to see'
          }
        }
      }
    }
  }
  
  let testLogger = new Logger({ maxDepth: 3 })
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('level2'),
    s => s.includes('level3'),
    s => !s.includes('level4'),
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerDepthWarning() {
  // Test depth exceeded warning
  let deepObj = {
    level1: {
      level2: {
        level3: 'exceeded'
      }
    }
  }
  
  let testLogger = new Logger({ maxDepth: 1 })
  let result = await testLogger.info(deepObj)
  
  await assert(
    result,
    s => s.includes('level1'),
    s => s.includes('\x1b[33m'), // yellow color code
    s => s.includes('[object depth limit reached]')
  )
}

async function testLoggerEnvironmentConfig() {
  // Test environment variable configuration for log lines
  const originalEnv = process.env.LOG_INCLUDE_LINES
  
  // Test with environment variable enabled
  process.env.LOG_INCLUDE_LINES = 'true'
  let testLogger1 = new Logger({ warnLevel: false })
  await assert(
    testLogger1.options.includeLogLineNumbers,
    val => val === true
  )
  
  // Test with environment variable disabled
  process.env.LOG_INCLUDE_LINES = 'false'
  let testLogger2 = new Logger({ warnLevel: false })
  await assert(
    testLogger2.options.includeLogLineNumbers,
    val => val === false
  )
  
  // Restore original environment
  if (originalEnv !== undefined) {
    process.env.LOG_INCLUDE_LINES = originalEnv
  } else {
    delete process.env.LOG_INCLUDE_LINES
  }
}

export default [
  testLoggerStringify,
  testLoggerError,
  testLoggerNoLevel,
  testLoggerColors,
  testLoggerDuplicateLevel,
  testLoggerDepthLimit,
  testLoggerCustomDepthLimit,
  testLoggerDepthWarning,
  testLoggerEnvironmentConfig
]
