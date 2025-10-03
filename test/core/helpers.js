import { registryServer, Logger } from '../../src/index.js'

const logger = new Logger({
  // logGroup: 'helpers', // TODO override per function
  // includeLogLineNumbers: true,
  // warnLevel: true
})

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function startRegistry() {
  let port = process.env.MICRO_REGISTRY_URL?.split(':')[2] || 10000
  let server = await registryServer(port)
  logger.info(`waited for registry server in test helper, at port: ${port}`)
  return server
}

export async function terminateAfter(...args /* ...serverFns, testFn */) {
  args.unshift(args.pop()) // rearrange for spread
  let [testFn, ...serverFns] = args
  if (typeof testFn !== 'function') throw new Error('terminateAfter last argument must be a function')
    
  let servers = await Promise.all(serverFns)
  try {
    let result = await testFn(servers)
    return result
  } finally {
    let registryIndex = servers.findIndex(s => s.isRegistry)
    if (registryIndex > -1) {
      let registryServer = servers[registryIndex]
      servers = servers.slice(0, registryIndex).concat(servers.slice(registryIndex + 1))
      for (let server of servers) await server.terminate()
      await registryServer.terminate()
    } else for (let server of servers) await server.terminate()
  }
}
