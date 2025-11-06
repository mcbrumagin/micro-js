#!/usr/bin/env node

const cliArgs = require('./src/utils/cli-parser.cjs')
const { callService, publishMessage } = require('./src/index.js')
const httpRequest = require('./src/index.js').httpRequest

// console.log({cliArgs})

async function main() {
  let [ command, target, payload ] = cliArgs.args

  if (command === 'call') {
    console.log({service: target, payload})

    try {
      payload = JSON.parse(payload)
    } catch (err) {
      try {
        // TODO implement a safer way to parse a shorthand payload
        // as cool as this is, it's a security risk, even for a CLI tool
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
        // TODO
        payload = eval(`payload = ${payload}`) // helper to avoid death by quotes
      } catch (err) { /* ignore */ }
    }

    console.log({message: payload})
    if (!target || !payload) throw new Error('Please provide "channel" and "message" arguments')
    const result = await publishMessage(target, payload)
    console.log('published to', result.results?.length || 0, 'subscriber(s)')
    console.log('result:', result)
  }
  else if (command === 'registry') {
    // console.log({command, target, payload})
    try {
      payload = JSON.parse(payload)
    } catch (err) {
      try {
        // TODO
        payload = eval(`payload = ${payload}`) // helper to avoid death by quotes
      } catch (err) { /* ignore */ }
    }

    let url = `${process.env.MICRO_REGISTRY_URL}${target}`
    console.log({url, payload})
    // const response = await fetch(url, {
    //   method: 'POST',
    //   body: JSON.stringify(payload)
    // })

    let result = await httpRequest(url, {
      payload
    })
    console.log(`registry response [${result?.status}]: ${JSON.stringify(result)}`)

  }
  else throw new Error('Invalid command. Use "call" or "publish"')
}

main().catch(err => console.error(err))
