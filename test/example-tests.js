import {
  assert, // expects a test function and then any number of assertion functions
  assertErr, // expects a test function that is expected to throw, and any number of error assertions
  MultiAssertError, // custom multiple-error object/stack for assert fns
  sleep, // in ms
  startRegistry, // registryServer wrapper; pulls the port off your env or picks a default
  terminateAfter, // expects a registry, any number of services/routes, and a meta-test function (usually assert)
  runTests // expects an array of test fns; each is successful if no errors are thrown 
} from './core/index.js' // or wherever test/core/index.js is located

// see base project README for more details on micro-js core functionality
import {
  createRoute,
  createService,
  callService,
  HttpError,
  overrideConsoleGlobally
} from '../src/index.js'

overrideConsoleGlobally({
  includeLogLineNumbers: true
})


// --- Basic Assert Usage ---

// the runner will print this function name as the test case
function basicAssertTest() {
  assert(1, r => r === 1)
}

// using anonymous single-expression functions, still gets the name
const basicAnonymousAssertTest = () => assert(2, r => r === 2)

// you can also just use async/await for consistency
async function basicAsyncAssertTest() {
  await assert(3, r => r === 3)
}

async function basicAssertErrTest() {
  await assertErr(new Error('test'), e => e.message === 'test')
}

async function basicFailingAssertTest() {
  await assert(1, r => r === 2) // prints your anonymous assert function in full
}

async function basicFailingMultiAssertTest() {
  await assert(1, r => r === 2, r => r === 3) // prints both failures!
}

async function basicFailingMultiAssertErrTest() {
  await assertErr(new Error('test'),
    e => e.message === 'test', // doesn't print this
    e => e.message === 'test2' // not true, so prints
  )
}


// --- Custom Service Testing ---

// very useful function that we will create services with
async function customService({ isUseful }) {
  if (!isUseful) throw new HttpError(400, 'nah, this is a useful service')
  return `wow this is such a useful service: ${isUseful}`
}


// an actual async example, with the terminateAfter helper
async function customServiceTest() {
  // setup
  await terminateAfter(
    // always do your registry first
    await startRegistry(), // helper terminates this in a finally block after the assertions
    await createService(customService), // also this
    () => assert(

      // act
      async () => await callService('customService', { isUseful: true }),

      // assert
      result => result.includes('wow'),
      result => result.includes('useful'),
      result => result.includes('true')
    )
  )
}

async function customServiceNegativeTest() {
  // setup
  await terminateAfter(
    await startRegistry(),
    await createService(customService),

    // terminateAfter passes the servers as arguments to the test function
    ([registry, service]) => assertErr(

      // act
      async () => await callService('customService', { isUseful: false }),

      // assert
      // err => console.log('\n\nmessage\n\n', err.message),
      // () => process.exit(1),
      err => err.stack.includes('HttpClientError [400]'),
      err => err.message.includes('nah'),
      err => err.message.includes('this is a useful service')
      /* assertErr will automatically fail the test if no error is thrown */
    )
  )
}

async function customServiceFailingTest() {
  // setup
  await terminateAfter(
    await startRegistry(),
    await createService(customService),
    
    // act, but with different composition
    async () => {
      
      // null will break the customService (no default payload)
      let result = await callService('customService', null)

      // assert can also be used directly on a value
      assert(result,
        r => 'not gonna reach this though.. accessing isUseful from empty payload',
        r => 'just an example for you to see the runTests failed case output',
        r => 'if you want to see these failed assertions, fix the service'
      )
    }
  )
}

// uncomment this in the testCases below to break the test runner
async function customServiceBadlyWrittenTest() {
  // setup
  await terminateAfter(
    await startRegistry(),
    await createService(customService),
    
    // act, but you did it wrong accidentally by not passing a function
    assert(async () => {},

      // assert... never happens :'(
      r => 'not gonna reach this.. assert does not return a function to terminateAfter',
      r => 'in fact, this will exit early to prevent EADDRESSINUSE errors on subsequent tests',
      r => 'see these assertion errors by adding "() =>" before assert'
    )
  )
}


// you could export this array from a separate test suite file
let customServiceTests = [
  customServiceTest,
  customServiceNegativeTest,
  customServiceFailingTest,
]

const testCases = [
  // normal test registration
  basicAssertTest,
  basicAnonymousAssertTest,
  basicAsyncAssertTest,
  basicAssertErrTest,
  basicFailingAssertTest,
  basicFailingMultiAssertTest,
  basicFailingMultiAssertErrTest,
  
  // use spreads if you have multiple test suites imported
  ...customServiceTests,

  // uncomment this to break the test runner
  // customServiceBadlyWrittenTest,
  // take solace in the fact that these print loud instructions on how to fix them!
]


/*
  The test runner defers printing error details until all tests are complete.
  No need to scroll back up... unless you need debug logs
*/
runTests(testCases)
.then(() => process.exit(0))
.catch(err => {
  console.error(err.stack)
  process.exit(1)
})
