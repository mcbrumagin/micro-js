// TODO "overload" with default status
class HttpError extends Error {
  constructor(status, message) {
    // TODO: This split truncates multiline error messages (only keeps first line)
    // This affects validation errors and other multiline messages passed between services
    // Consider preserving full multiline messages or using a different delimiter
    var [message, ...stack] = message ? message.split('\n') : ['']
    
    stack = '\n' + stack.join('\n') // TODO only first line for prod?

    // clean up the beginning of the message for cascading errors
    if (message.includes('HttpClientError')
    || message.includes('HttpServerError') ) {
      message = message.replace(/^Http.+Error\s\[[0-9]+\]\:/ig,'')
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

    // Mute error stack in anything but dev
    if (!(process.env.ENVIRONMENT?.toLowerCase().includes('dev'))) this.stack = `${this.name}: ${message.trim()}`
    else this.stack += '\n' + stack.trim()
  }
}

export default HttpError
