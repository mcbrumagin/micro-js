// create our own copy of log fns so we can override console safely
const consol = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

// TODO handle other js built-ins such as Error more gracefully
// handle up to a certain object depth with recursion (default 3?)
// other objects?
// create custom stringify fn

function stringify(obj) {
  let string = ''
  for (let prop in obj) {
    if (obj[prop] instanceof Error) string += obj[prop].stack
    else if (typeof obj[prop] === 'object') string += JSON.stringify(obj[prop]) // TODO formatJSON option
    else if (typeof obj[prop] === 'function') string += obj[prop].name || '[anonymous fn]'
    else string += obj[prop]
  }
}

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
}

function getColorForLogLevel(level) {
  let { red, yellow, green, blue, magenta } = colors
  if (level === 'error') return red
  else if (level === 'warn') return yellow
  else if (level === 'info') return blue
  // else if (level === 'log') return green
  // else if (level === 'trace') return magenta
  // else return white
}

function getLogLineNumber() {
  let fakeErr = new Error()
  let fullPathLogLine = fakeErr.stack.split('\n').slice(3,4)[0]
  let logLineInfo
  if (fullPathLogLine.indexOf('(') > -1) {
    fullPathLogLine = fullPathLogLine.slice(0, fullPathLogLine.length - 1)
    logLineInfo = fullPathLogLine.replace(new RegExp(`\\s+at\\s.+\\s+\\(${process.cwd()}/`, 'ig'), '')
  } else logLineInfo = fullPathLogLine.replace(`    at ${process.cwd()}/`, '')
  
  // consol.log(logLineInfo)
  return logLineInfo
}

module.exports = class Logger {
  constructor(
    options = {},

    // whatever level is set will include all subsequent levels
    logLevel = process.env.LOG_LEVEL || 'trace',
    logLevels = [
      'trace',
      'log',
      'info',
      'warn',
      'error'
    ]
  ) {
    this.options = Object.assign({
      serviceName: '',
      overrideConsoleLog: false,
      // TODO
      useLogFile: false,
      logFilePath: './logs',
      logFileRetainLineLimit: 0, // no retention limit
      includeLogLineNumbers: false,
      includeLogLevelInOutput: false,
      formatJson: true,
      noWarn: false
    }, options)

    // this.logLevels = logLevels

    this.logLevels = logLevels

    this.activeLogLevels = []
    for (let level of logLevels.reverse()) {
      this.activeLogLevels.push(level)
      if (level === logLevel) break
    }

    for (let level of logLevels) {
      this.createLogFn(level)
    }

    if (!this.options.noWarn) consol.warn(this.writeColor('yellow', `Log level = ${logLevel} | Active levels: ${this.activeLogLevels.join(', ')}\n`))
    if (this.options.overrideConsoleLog) this.overrideConsoleLog()
  }

  writeColor(color = colors.white, logContent, endColor = colors.reset) {
    return (colors[color] || color) + logContent + (colors[endColor] || endColor)
  }

  createLogFn(level) {
    let {
      formatJson,
      includeLogLineNumbers,
      serviceName
     } = this.options

     let { activeLogLevels, writeColor } = this

    if (this[level]) throw new Error(`Already created log fn for level ${level}`)
    else this[level] = function log(...args) {
      // consol.log("activeLogLevels.indexOf(level)",activeLogLevels.indexOf(level) >= 0)
      if (activeLogLevels.indexOf(level) >= 0) {
        let color = getColorForLogLevel(level)
        // consol.log({ color, args })
        if (includeLogLineNumbers) args.unshift(writeColor('white', getLogLineNumber(args), color))
        if (serviceName) args.unshift(writeColor('white', serviceName, color))

        // consol.log({args})
        let logContent = ''
        for (let arg of args) {
          if (arg instanceof Error) logContent += arg.stack
          else if (typeof arg === 'object' && formatJson) logContent += stringify(arg) //JSON.stringify(arg, null, 2)
          else if (typeof arg === 'object') logContent += stringify(arg) // JSON.stringify(arg)
          else logContent += arg
          logContent += ' | '
        }
        logContent = logContent.slice(0, logContent.length - 3) + colors.reset
        if (consol[level]) consol[level](logContent)
        else consol.log(...args)
      }
    }
  }

  overrideConsoleLog() {
    for (let level of this.logLevels) {
      if (console[level]) console[level] = this[level]
    }
    this.console = consol
  }
}
