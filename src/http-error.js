// TODO "overload" with default status
class HttpError extends Error {
  constructor(status, message, stack) {
    // console.log({status, message, stack})

    var [message, ...stack] = message.split('\n')
    stack = '\n' + stack.join('\n')

    if (message.includes('HttpClientError')
    || message.includes('HttpServerError') ) {
      message = message.replace(/^Http.+Error\s\[[0-9]+\]\:/ig,'')
    }
    super(message)

    let isClientError = status >= 400 && status < 500
    let isServerError = status >= 500 && status < 600
    
    this.status = status
    this.name = isClientError ? `HttpClientError [${status}]`
      : isServerError ? `HttpServerError [${status}]`
      : status ? `Error [${status}]`
      : 'Error'
    
    this.stack += '\n' + stack.trim()
  }
}

module.exports = HttpError
