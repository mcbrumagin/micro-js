const callService = require('./src/call-service.js')
const { flags, args: [command, ...args] } = require('./src/cli-parser.js')

async function runCommand() {
  if (command === 'call') {
    let [service, jsonString] = args
    let payload = JSON.parse(jsonString)
    let result = await callService(service, payload)
    console.log(result)
  }
}

runCommand()
.then(result => process.exit(0))
.catch(err => console.error(err) && process.exit(1))
