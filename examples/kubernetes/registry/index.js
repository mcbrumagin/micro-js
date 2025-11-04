const { registryServer } = require('micro-js')
const args = Array.prototype.slice.call(process.argv)
registryServer(args[2] || 10000)
.catch(err => console.error(err))
