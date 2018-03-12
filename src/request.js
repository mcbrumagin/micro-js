const vanillaRequest = require('request')
const request = require('request-promise-native')
const errors = require('request-promise-native/errors')

async function req(method, endpoint, body, headers, isJson = true) {
    let url = `${this.baseUrl}${endpoint}`
    headers = Object.assign({}, this.baseHeaders, headers)
    let contentType = headers['content-type'] || headers['Content-Type']
    if (contentType != null && contentType !== 'application/json') isJson = false
    let errorPlaceholder = new Error()
    let options = {
        method,
        url,
        body,
        headers,
        json: isJson,
        transform: (body, response, resolveWithFullResponse) => {
            let { statusCode } = response
            if (statusCode >= 400 && statusCode < 600) {
                throw new Error(`[${statusCode}] at ${method.toUpperCase()} ${url}\n${body}`)
            }
            return { response, statusCode, body }
        }
    }

    if (contentType === 'application/x-www-form-urlencoded') {
        options.form = body
        delete options.body
    }
    
    return request(options).catch(err => {
        if (err instanceof errors.TransformError) {
            response = err.response
            err = err.error
            errorPlaceholder.message = err.message
            errorPlaceholder.statusCode = response.statusCode
            errorPlaceholder.body = response.body
            throw errorPlaceholder
        } else throw err
    })
}

class Client {
    constructor({ baseUrl, baseHeaders }) {
        this.baseUrl = baseUrl
        this.baseHeaders = baseHeaders

        this.req = req.bind(this)
        this.get = req.bind(this, 'get')
        this.post = req.bind(this, 'post')
        this.put = req.bind(this, 'put')
        this.del = req.bind(this, 'delete')
    }
}

module.exports = {
    Client,
    vanillaRequest
}