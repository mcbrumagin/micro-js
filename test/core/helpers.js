import { registryServer, Logger } from '../../src/index.js'

const logger = new Logger()

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
  
  let servers
  try {
    servers = await Promise.all(serverFns)
    for (let server of servers) {
      if (server && server.length > 0) {
        let index = servers.indexOf(server)
        servers.splice(index, 1)
        servers.push(...server)
      }
    }

    let result = await testFn(servers)
    return result
  } finally {
    let registryIndex = servers.findIndex(s => s.isRegistry)
    if (registryIndex > -1) {
      let registryServer = servers[registryIndex]
      servers = servers.slice(0, registryIndex).concat(servers.slice(registryIndex + 1))
      for (let server of servers) {
        await server?.terminate()
        logger.info(`terminated server ${server?.name} at port ${server?.port}`)
      }
      await registryServer?.terminate()
      logger.info(`terminated registry server at port ${registryServer?.port}`)
    } else for (let server of servers) await server?.terminate()
  }
}

export function mergeAllTestsSafely(...testFnObjects) {
  let finalTestFns = {}
  let duplicateNames = []
  for (let testFns of testFnObjects) {
    if (typeof testFns === 'function') {
      if (finalTestFns[testFns.name]) duplicateNames.push(testFns.name)
      finalTestFns[testFns.name] = testFns
    } else if (Array.isArray(testFns)) {
      for (let fn of testFns) {
        if (finalTestFns[fn.name]) duplicateNames.push(fn.name)
        finalTestFns[fn.name] = fn
      }
    } else {
      let testNames = Object.keys(testFns)
      for (let name of testNames) {
        if (finalTestFns[name]) duplicateNames.push(name)
        finalTestFns[name] = testFns[name]
      }
    }
  }
  if (duplicateNames.length > 0) throw new Error(`Duplicate test names: [${duplicateNames.join(', ')}]`)
  return finalTestFns
}
