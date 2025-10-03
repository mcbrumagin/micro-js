#!/usr/bin/env node

const cliArgs = require('./src/utils/cli-parser.cjs')
const { callService } = require('./src/index.js')

// console.log({cliArgs})

async function main() {
  let [ command, service, payload ] = cliArgs.args

  if (command === 'call') {
    console.log({service, payload})

    try {
      payload = JSON.parse(payload)
    } catch (err) {
      try {
        payload = eval(`payload = ${payload}`) // helper to avoid death by quotes
      } catch (err) { /* ignore */ }
    }

    console.log({payload})
    if (!service || !payload) throw new Error('Please provide "service" and "payload" arguments')
    console.log('result:', await callService(service, payload))
  }
  else throw new Error('Invalid command')
}

main().catch(err => console.error(err))
