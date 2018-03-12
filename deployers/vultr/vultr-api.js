const { Client } = require('../../../micro-js/src/request.js')

// console.log({env: process.env})
const apiKey = process.env.VULTR_API_KEY

if (!apiKey) throw new Error('Configure VULTR_API_KEY env variable')

// TODO class Vultr extends Client { ... }
const vultrApi = new Client({
    baseUrl: 'https://api.vultr.com/v1',
    baseHeaders: {
        'api-key': apiKey
    }
})

async function getAccountInfo() {
    let { body } = await vultrApi.get('/account/info')
    console.log({ body })
}

// getAccountInfo()

async function listSshKeys() {
  let { body } = await vultrApi.get('/sshkey/list')
  let sshKeys = []
  for (let sshKeyId in body) {
    let name = body[id].name
    sshKeys.push({ sshKeyId, name })
  }
  return sshKeys
}

// listSshKeys().then(console.log.bind(console))

async function getSshKeyIdByName(name) {
  let sshKeys = await listSshKeys()
  let sshKey = sshKeys.find(key => key.name === name)
  if (!sshKey) throw new Error('NOT_FOUND')
  return sshKey.sshKeyId
}

async function createSshKey(sshKey) {
  let {
      body: { SSHKEYID: sshKeyId }
    } = vultrApi.post('/sshkey/create', {
      name: 'deployer-key',
      ssh_key: sshKey
  })
  return sshKeyId
}

async function listRegions() {
    let { body } = await vultrApi.get('/regions/list')
    let regions = []
    for (let dcId in body) {
        let { name } = body[dcId]
        regions.push({ dcId, name })
    }
    return regions
}

async function getRegionDcIdByName(name) {
    let regions = await listRegions()
    let region = regions.find(region => region.name === name)
    // console.log({regions, name})
    if (!region) throw new Error('NOT_FOUND')
    return region.dcId
}

async function listOperatingSystems() {
    let { body } = await vultrApi.get('/os/list')
    let osList = []
    for (let osId in body) {
        let { name, family } = body[osId]
        osList.push({ osId, name, family })
    }
    return osList
}

async function getOsIdByNameOrFamily(nameOrFamily) {
    let osList = await listOperatingSystems()
    // console.log({ osList, nameOrFamily })
    let os = osList.find(os => os.name === nameOrFamily || os.family === nameOrFamily)
    if (!os) throw new Error('NOT_FOUND')
    return os.osId
}

async function listPlans() {
    let { body } = await vultrApi.get('/plans/list')
    let plans = []
    for (let planId in body) {
        let { price_per_month: price, ram, vcpu_count: cpu } = body[planId]
        price = Number(price)
        ram = Number(ram)
        cpu = Number(cpu)
        plans.push({ planId, price, cpu, ram })
    }
    return plans
}

async function getPlanIdByPriceCpuOrRam(price, cpu, ram) {
    let plans = await listPlans()
    let plan = plans.find(plan => (price || cpu || ram)
        && ( price ? plan.price === price : true)
        && ( cpu ? plan.cpu === cpu : true)
        && (ram ? plan.ram === ram : true)
    )
    console.log({plans, price, cpu, ram})
    if (!plan) throw new Error('NOT_FOUND')
    return plan.planId
}

async function createOrUpdateKey() {
    // TODO https://www.vultr.com/api/#sshkey_create
    // may need to run ssh keygen commands
}

async function createInstance() {
    // TODO https://www.vultr.com/api/#server_create // SSHKEYID
    let dcId = await getRegionDcIdByName('New Jersey')
    let osId = await getOsIdByNameOrFamily('Ubuntu 17.10 x64')
    let planId = await getPlanIdByPriceCpuOrRam(10, 1, 2048)
    console.log({ dcId, osId, planId })
    let response = await vultrApi.post('/server/create', {
        DCID: dcId,
        OSID: osId,
        VPSPLANID: planId
    }, {
        'content-type': 'application/x-www-form-urlencoded'
    })
    console.log({response})
    let { SUBID: subId } = response.body
    return subId
}

createInstance()
.then(console.log.bind(console))
.catch(console.error.bind(console))

async function createInstanceAndWaitForCreation() {

}

async function destroyInstance() {
    // TODO https://www.vultr.com/api/#server_destroy
}

async function bundleService() {
    // TODO build a docker image, run webpack, or run a custom bundler script?
}

async function deployService() {
    // TODO rsync bundled app code, or pull docker image
}

async function startService() {
    // TODO remote access and run npm start ???
}

async function listenToRepoChanges(repos) {
    // TODO for all repos: register github webhooks and trigger deployment events
    // on service repo change: deploy new service, run automated tests using that service, rollback or cleanup
    // on config change: publish configuration to running services
    // on deployment config change: deploy full stack, run tests, and teardown bad or old stack
}