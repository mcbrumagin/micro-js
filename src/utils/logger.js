import envConfig from '../micro-core/env-config.js'

// create our own copy of log fns so we can override console safely
const ogConsole = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}


function formatValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  else if (value === null) return 'null'
  else return `\"${value && value.toString()}\"`
}

function escapeTemplateChar(string) {
  return string.replace(/`/g, '\\`')
}

// recursively stringify objects with depth limiting
function stringify(obj, depth = 0, maxDepth = 2) {
  if (depth > maxDepth) {
    return colors.yellow + '[Object depth exceeded - use higher maxDepth to see more]' + colors.reset
  }
  
  let string = ''
  for (let prop in obj) {
    const indent = '  '.repeat(depth + 1)
    if (obj[prop] instanceof Error) {
      string += `\n${indent}${prop}: \`${obj[prop].stack}\``
    } else if (typeof obj[prop] === 'object' && obj[prop] !== null) {
      if (depth === maxDepth) {
        string += `\n${indent}${prop}: \`${colors.yellow}[object depth limit reached]${colors.reset}\``
      } else {
        string += `\n${indent}${prop}: {${stringify(obj[prop], depth + 1, maxDepth)}\n${indent}}`
      }
    } else if (typeof obj[prop] === 'function') {
      string += `\n${indent}${prop}: \`${escapeTemplateChar(obj[prop]?.toString())}\``
    } else {
      string += `\n${indent}${prop}: ${formatValue(obj[prop])},`
    }
  }
  return string
}

function prettyPrint(obj, maxStringLength = 1000) {
  let prettyString = stringify(obj, 0, 2)
  if (prettyString.length > maxStringLength) {
    prettyString = prettyString.slice(0, maxStringLength) + '...'
  }
  return prettyString
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
  else if (level === 'debugErr') return red
  else if (level === 'info') return blue
}

function getLogLineNumber(excludeFullPathInLogLines = false) {
  const obj = {}

  Error.captureStackTrace(obj, getLogLineNumber)
  
  let fullPathLogLine = obj.stack.split('\n').slice(3, 4)[0] // ignores internal logging stack frames
  let logLineInfo
  
  if (fullPathLogLine.indexOf('(') > -1) {
    // Extract path from parentheses: "at functionName (file:///path/to/file.js:line:col)"
    const pathMatch = fullPathLogLine.match(/\((.+)\)/)
    if (pathMatch) {
      let filePath = pathMatch[1]
      // Remove file:// protocol and convert to relative path
      filePath = filePath.replace('file://', '')
      filePath = filePath.replace(process.cwd() + '/', '')
      logLineInfo = filePath
    } else {
      logLineInfo = fullPathLogLine
    }
  } else {
    // direct path format: "at file:///path/to/file.js:line:col"
    logLineInfo = fullPathLogLine
      .replace('file://', '')
      .replace(process.cwd() + '/', '')
      .replace(/^\s+at\s+/, '')
  }
  
  // TODO do this earlier for better performance?
  if (excludeFullPathInLogLines) {
    logLineInfo = logLineInfo.split('/').slice(-1).join('')
  }

  return logLineInfo
}

let consoleOverridden = false

export function overrideConsoleGlobally(config = {}) {
  if (consoleOverridden) {
    ogConsole.warn('Console is already overridden globally')
    return
  }
  
  const originalMethods = {
    debug: console.debug,
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
  
  const globalLogger = new Logger(config)
  
  console.debug = globalLogger.debug.bind(globalLogger)
  console.log = globalLogger.log.bind(globalLogger)
  console.info = globalLogger.info.bind(globalLogger)
  console.warn = globalLogger.warn.bind(globalLogger)
  console.error = globalLogger.error.bind(globalLogger)
  
  consoleOverridden = true
  
  // store original methods for potential restoration
  console._originalMethods = originalMethods
  
  ogConsole.warn('Console methods have been globally overridden to use Logger. Use console._originalMethods to access originals.')
}

function writeColor(color = colors.white, logContent, endColor = colors.reset) {
  return (colors[color] || color) + logContent + (colors[endColor] || endColor)
}

let printedWarning = false
function printWarningOnceAndReturnVanillaConsole() {
  if (!printedWarning) {
    console.warn(writeColor('magenta', `DISABLE_ALL_CUSTOM_LOGS ACTIVE
      --- normal console methods will be used instead of custom Logger`
    ))
    printedWarning = true
  }
  return console
}

export default class Logger {
  constructor(
    options = {},

    // whatever level is set will include all subsequent levels
    logLevel = process.env.LOG_LEVEL || 'debug',
    logLevels = [
      'debug',
      'debugErr',
      'log',
      'info',
      'warn',
      'error'
    ]
  ) {

    const DISABLE_ALL_CUSTOM_LOGS = envConfig.get('DISABLE_ALL_CUSTOM_LOGS')
    if (DISABLE_ALL_CUSTOM_LOGS) {
      return printWarningOnceAndReturnVanillaConsole()
    }


    this.options = Object.assign({
      logGroup: '',
      useLogFile: false, // TODO
      logFilePath: './logs',
      logFileRetainLineLimit: 0,
      includeLogLineNumbers: process.env.LOG_INCLUDE_LINES === 'true',
      excludeFullPathInLogLines: process.env.LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES === 'true',
      muteLogGroupOutput: process.env.MUTE_LOG_GROUP_OUTPUT === 'true',
      includeLogLevelInOutput: false,
      outputJson: false, // TODO for cloudwatch and other log aggregators
      warnLevel: false,
      maxDepth: 2
    }, options)

    this.logLevels = logLevels

    this.activeLogLevels = []
    this.inactiveLogLevels = []
    let isInactive = false
    logLevels.reverse()
    for (let level of logLevels) {
      if (!isInactive) this.activeLogLevels.push(level)
      else this.inactiveLogLevels.push(level)
      if (level === logLevel) isInactive = true
    }

    for (let level of logLevels) {
      this.createLogFn(level)
    }

    if (this.options.warnLevel) ogConsole.warn(this.writeColor('yellow',
        `Log level = ${logLevel} `
        + `| Active levels: ${this.activeLogLevels.join(', ') || 'none'} `
        + `| Inactive levels: ${this.inactiveLogLevels.join(', ') || 'none'} `
        + `| Include lines: ${this.options.includeLogLineNumbers ? 'enabled' : 'disabled (set LOG_INCLUDE_LINES=true to enable)'}\n`
        + `| Exclude full path in log lines: ${this.options.excludeFullPathInLogLines ? 'enabled' : 'disabled (set LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES=true to enable)'}\n`
    ))
  }

  prettyPrint(...args) {
    return prettyPrint(...args)
  }

  writeColor(...args) {
    return writeColor(...args)
  }

  // replaces all extra whitespace (including newlines) with a single space
  removeWhitespace(logContent) {
    return logContent.replace(/\s+/g, ' ')
  }

  // keeps new lines intact
  removeExtraWhitespace(logContent) {
    return logContent.replace(/[ \t]{2,}/ig, ' ')
  }

  outputJsonFormatLog(level, ...args) {
    let { logGroup } = this.options

    let output = {}
    output.src = path.relative(process.cwd(), getLogLineNumber(false))
    output.level = level
    output.rank = this.activeLogLevels.indexOf(level)
    output.group = logGroup
    output.message = args
    output.error = args.find(arg => arg instanceof Error)
    return JSON.stringify(output, null, this.options.maxDepth + 1) // +1 since the output is an object itself
  }

  outputPlainFormatLog(level, ...args) {
    let {
      includeLogLineNumbers,
      excludeFullPathInLogLines,
      logGroup
    } = this.options

    const hasError = args.some(arg => arg instanceof Error || (arg && arg.stack))
    const effectiveLevel = (level === 'debug' && hasError) ? 'debugErr' : level
    
    if (this.activeLogLevels.indexOf(effectiveLevel) < 0) {
      return
    }
    
    let color = getColorForLogLevel(effectiveLevel) || ''
    args.unshift(color)
    
    if (includeLogLineNumbers) args.unshift(
      this.writeColor('white', 
      getLogLineNumber(excludeFullPathInLogLines),
      colors.reset
    ))

    if (!this.options.muteLogGroupOutput && logGroup)
      args.unshift(this.writeColor('white', logGroup, colors.reset))

    let logContent = ''
    for (let arg of args) {
      if (arg instanceof Error) logContent += arg.stack
      else if (typeof arg === 'object' && arg !== null) logContent += stringify(arg, 0, this.options.maxDepth)
      else logContent += arg

      if (arg !== color && !logContent.endsWith('\n')) logContent += ' | '
    }
    logContent = logContent.slice(0, logContent.length - 3) + colors.reset
    
    const consoleMethod = (effectiveLevel === 'debugErr') ? 'debug' : level
    if (ogConsole[consoleMethod]) ogConsole[consoleMethod](logContent)
    else ogConsole.log(logContent)
    return logContent
  }

  createLogFn(level) {
    let { outputJson } = this.options

    let isMuted = false
    if (this[level]) throw new Error(`Already created log fn for level ${level}`)
    else this[level] = function log(...args) {
      if (isMuted) return

      return outputJson ? this.outputJsonFormatLog(level, ...args) : this.outputPlainFormatLog(level, ...args)
    }

    if (this[level]) {
      let bigLevel = level.charAt(0).toUpperCase() + level.slice(1)
      this[`mute${bigLevel}`] = () => isMuted = true
      this[`unmute${bigLevel}`] = () => isMuted = false
    }
  }
}
