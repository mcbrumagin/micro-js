// TODO "overload" with default status
class HttpError extends Error {
  constructor(status, message) {
    var [message, ...stack] = message.split('\n')
    stack = '\n' + stack.join('\n')
    // console.log({status, message, stack})

    // clean up the beginning of the message for cascading errors
    if (message.includes('HttpClientError')
    || message.includes('HttpServerError') ) {
      message = message.replace(/^Http.+Error\s\[[0-9]+\]\:/ig,'')
    } else if (message.includes('Error [')) {
      message = message.replace(/^Error\s\[[0-9]+\]\:/ig,'')
    } else if (message.includes('Error:')) {
      message = message.replace(/^Error:\s/ig,'')
    }

    super(message.trim())

    if (!status) status = 500
    let isClientError = status >= 400 && status < 500
    let isServerError = status >= 500 && status < 600
    
    this.status = status
    this.name = isServerError
      ? `HttpServerError [${status}]`
      : `HttpClientError [${status}]`
    
    this.isServerError = isServerError
    this.isClientError = isClientError

    this.stack += '\n' + stack.trim()
  }
}

module.exports = HttpError
