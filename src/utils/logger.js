import envConfig from '../micro-core/env-config.js'

// create our own copy of log fns so we can override console safely
const ogConsole = {
  debug: console.debug.bind(console),
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
}

// TODO handle other js built-ins such as Error more gracefully
// handle up to a certain object depth with recursion (default 3?)
// other objects?
// create custom stringify fn

function formatValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  else if (value === null) return 'null'
  else return `\"${value && value.toString()}\"`
}

function escapeTemplateChar(string) {
  return string.replace(/`/g, '\\`')
}

// Recursively stringify objects with depth limiting
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
  // else if (level === 'debug') return magenta
  // else return white
}

function getLogLineNumber(excludeFullPathInLogLines = false) {
  const obj = {}

  Error.captureStackTrace(obj, getLogLineNumber)
  
  let fullPathLogLine = obj.stack.split('\n').slice(2, 3)[0]
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
    // Direct path format: "at file:///path/to/file.js:line:col"
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

// Global console override state
let consoleOverridden = false

// Helper function to override console.log globally for all Logger instances
export function overrideConsoleGlobally(config = {}) {
  if (consoleOverridden) {
    ogConsole.warn('Console is already overridden globally')
    return
  }
  
  // Store original console methods
  const originalMethods = {
    debug: console.debug,
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  }
  
  // Create a temporary logger for console override
  const globalLogger = new Logger(config)
  
  // Override console methods
  console.debug = globalLogger.debug.bind(globalLogger)
  console.log = globalLogger.log.bind(globalLogger)
  console.info = globalLogger.info.bind(globalLogger)
  console.warn = globalLogger.warn.bind(globalLogger)
  console.error = globalLogger.error.bind(globalLogger)
  // TODO distributed trace
  
  consoleOverridden = true
  
  // Store original methods for potential restoration
  console._originalMethods = originalMethods
  
  ogConsole.warn('Console methods have been globally overridden to use Logger. Use console._originalMethods to access originals.')

  // TODO return a function to toggle override off/on
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
      logFileRetainLineLimit: 0, // no retention limit
      includeLogLineNumbers: process.env.LOG_INCLUDE_LINES === 'true',
      excludeFullPathInLogLines: process.env.LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES === 'true',
      includeLogLevelInOutput: false,
      // formatJson: true,
      warnLevel: false,
      maxDepth: 2 // Maximum depth for object stringification
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

  createLogFn(level) {
    let {
      // formatJson,
      includeLogLineNumbers,
      excludeFullPathInLogLines,
      logGroup
     } = this.options

     let { activeLogLevels, writeColor } = this

    let isMuted = false
    if (this[level]) throw new Error(`Already created log fn for level ${level}`)
    else this[level] = function log(...args) {
      if (activeLogLevels.indexOf(level) >= 0 && !isMuted) {
        let color = getColorForLogLevel(level) || '' // use default terminal color
        args.unshift(color) // start with color code string
        
        if (includeLogLineNumbers) args.unshift(
          writeColor('white', 
          getLogLineNumber(excludeFullPathInLogLines),
          colors.reset
        ))

        if (logGroup) args.unshift(writeColor('white', logGroup, colors.reset))

        let logContent = ''
        for (let arg of args) {
          if (arg instanceof Error) logContent += arg.stack
          else if (typeof arg === 'object' && arg !== null) logContent += stringify(arg, 0, this.options.maxDepth)
          else logContent += arg

          if (arg !== color) logContent += ' | ' // TODO?
        }
        logContent = logContent.slice(0, logContent.length - 3) + colors.reset
        if (ogConsole[level]) ogConsole[level](logContent)
        else ogConsole.log(...args) // should only ever happen for console.log override
        return logContent // mostly for testing, but who knows
      }
    }

    if (this[level]) {
      let bigLevel = level.charAt(0).toUpperCase() + level.slice(1)
      this[`mute${bigLevel}`] = () => isMuted = true
      this[`unmute${bigLevel}`] = () => isMuted = false
    }
  }
}
