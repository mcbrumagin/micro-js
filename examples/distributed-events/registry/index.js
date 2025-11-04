const { registryServer } = require('micro-js')

console.log({env: process.env})

registryServer()
.then(() => console.log('Registry server started'))
.catch(err => console.error(err))
