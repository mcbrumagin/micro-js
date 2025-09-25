import createService from './create-service.js'

export default function createServices (...fns) {
  return Promise.all(fns.map(fn => createService(fn)))
}
