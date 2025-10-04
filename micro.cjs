#!/usr/bin/env node

const cliArgs = require('./src/utils/cli-parser.cjs')
const { callService, publishMessage } = require('./src/index.js')

// console.log({cliArgs})

async function main() {
  let [ command, target, payload ] = cliArgs.args

  if (command === 'call') {
    console.log({service: target, payload})

    try {
      payload = JSON.parse(payload)
    } catch (err) {
      try {
        payload = eval(`payload = ${payload}`) // helper to avoid death by quotes
      } catch (err) { /* ignore */ }
    }

    console.log({payload})
    if (!target || !payload) throw new Error('Please provide "service" and "payload" arguments')
    console.log('result:', await callService(target, payload))
  }
  else if (command === 'publish' || command === 'pub') {
    console.log({channel: target, message: payload})

    try {
      payload = JSON.parse(payload)
    } catch (err) {
      try {
        payload = eval(`payload = ${payload}`) // helper to avoid death by quotes
      } catch (err) { /* ignore */ }
    }

    console.log({message: payload})
    if (!target || !payload) throw new Error('Please provide "channel" and "message" arguments')
    const result = await publishMessage(target, payload)
    console.log('published to', result.results?.length || 0, 'subscriber(s)')
    console.log('result:', result)
  }
  else throw new Error('Invalid command. Use "call" or "publish"')
}

main().catch(err => console.error(err))
