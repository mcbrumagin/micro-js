import { Logger } from '../../src/index.js'

const logger = new Logger({
  // logGroup: 'runTests',
  includeLogLineNumbers: true,
  // warnLevel: true
})

function formatErrorDetails(failedCases) {
  return failedCases.map(({name, err}) => {
    return `\n${name} failed with error: ${err.assertMessage ||err.stack}`
  }).join('\n')
}

export async function runTests(testFns) {

  process.on('unhandledRejection', (reason, promise) => {
    console.error(logger.writeColor('magenta', 'Exiting early due to Unhandled Promise Rejection'))
    console.warn(logger.removeExtraWhitespace(
      `This likely means your assert function is being \
        called synchronously without a return statement.
      Either add await before every assert/assertErr, \
        or make sure its promise is returned by the test function.`
    ))
    process.exit(1)
  })

  let testSuccess = 0
  let successCases = []
  let testFail = 0
  let failedCases = []
  testFns = testFns.map(fn => {
    // TODO if not async?
    if (fn.constructor.name !== 'AsyncFunction') {
      let originalFn = fn
      fn = async () => originalFn()

      // preserve the name of the original function for test results
      Object.defineProperty(fn, 'name', { value: originalFn.name })
    }
    return async () => {
      logger.info(`\n- - - RUNNING ${fn.name} - - -`)
      try {
        let result = await fn()
        logger.info(logger.writeColor('green', `+ + + ${fn.name} SUCCEEDED ${
          result !== undefined ? `WITH RESULT: ${JSON.stringify(result)}` : ''
        } + + +\n`))
        testSuccess++
        successCases.push(fn.name)
      } catch (err) {
        logger.error(logger.writeColor('red', `\n\nx x x ${fn.name} FAILED WITH ERROR: ${err.message} x x x\n`))
        if (err.message.includes('terminateAfter')) {
          logger.error(logger.writeColor('magenta', 'Exiting early due to failure in terminateAfter: ', err.stack))
          process.exit(1)
        }
        testFail++
        failedCases.push({name: fn.name, err})
      }
    }
  })

  for (let test of testFns) await test()

  logger.info('\n')
  logger.info(`| - - - - -  TESTING COMPLETE  - - - - - |`)
  logger.info(`    TOTAL: ${testSuccess + testFail}`
    + logger.writeColor('green', `    SUCCESS: ${testSuccess}`)
    + logger.writeColor('red', `    FAIL: ${testFail}`))
  logger.info('')

  if (testSuccess > 0) {
    logger.info(logger.writeColor('green', '+ + +  SUCCESS CASES  + + +'))
    logger.info(logger.writeColor('green', '\n  ' + successCases.join('\n  ')))
    logger.info('')
  }

  if (testFail) {
    logger.info(logger.writeColor('red', 'x x x  FAILURE CASES  x x x'))
    logger.info(logger.writeColor('red', '\n  ' + failedCases.map(f => f.name).join('\n  ')))
    logger.info(logger.writeColor('red', '\n' + formatErrorDetails(failedCases)))
  }
}
