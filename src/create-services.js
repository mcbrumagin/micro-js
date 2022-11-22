const createService = require('./create-service.js')

module.exports = function createServices (...fns) {
  return Promise.all(fns.map(fn => createService(fn)))
}
