// TODO run on dex with a build/deploy step
// TODO run in parallel on dev

const { callService } = require('../../src/index.js')
const { args, flags } = require('../src/cli-parser.js')


const [serviceNames, amount] = args
const {
  m, message,
  t, threads,
  s, style,
  r, random,
  d, dev,
  l, local
} = flags

const services = serviceNames
  .split(',')
  .map(n => n.trim())
  .filter(n => !!n)

const requestsPerService = Number(amount)
const payload = m || message || 'performance test'
const totalThreads = Number(t || threads || 1)
const requestsPerThreadPerService = requestsPerService / totalThreads
const performanceTestStyle = s || style
// const isSequentialServiceTest = !(r || random)
const isSequentialServiceTest = false
const shouldRunOnDev = d || dev || false
const shouldRunOnLocal = l || local || !shouldRunOnDev

main()
.catch(err => console.log(err.stack))
.then(() => {
  console.timeEnd('TOTAL TIME')
})

async function main() {
  console.time('TOTAL TIME')
  if (shouldRunOnLocal && shouldRunOnDev) {
    console.log('TODO')
  }
  else if (shouldRunOnDev) {
    console.log('TODO')
  }
  else if (shouldRunOnLocal) {
    if (isSequentialServiceTest) {
      console.log('TODO implement isSequentialServiceTest')
    }
    else {
      let t = totalThreads
      while (t--) {
        for (let service of services) {
          let i = requestsPerThreadPerService
          while (i--) await callService(service, payload)
        }
      }
    }
  }
}
