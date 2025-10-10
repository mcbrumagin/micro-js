#!/usr/bin/env node

let [,, ...argv] = Array.prototype.slice.call(process.argv)

let i = argv.length
while (--i) {
  argv[i] = argv[i].replace(/\ /ig, '___')
}

// console.log({argv})

let argsString = argv.join(' ')

//console.log({argsString})

let flags = {}

const optionRegex = /(?:^|\s)--(.+?)(?:=|\s)(.+?)(?:\s|$)/i

let matchResult
while ((matchResult = argsString.match(optionRegex)) != null) {
  let [match, flag, value] = Array.prototype.slice.call(matchResult)
  // console.log({match, flag, value})
  flags[flag] = value.trim()
  match = match.slice(0, match.length-1)
  argsString = argsString.replace(match, '')
  /* TODO FIX BUG
  { argv: [ 'service1', '5', '--threads', '2' ] }
  { argsString: 'service1 5 --threads 2' }
  { match: ' --threads 2', flag: 'threads', value: '2' }
  { argsString: 'service1 52' }
  { argsAndChars: [ 'service1', '52' ] }
  { flags: { threads: '2' } }
  { args: [ 'service1', '52' ], flags: { threads: '2' } }
  */
  // console.log({argsString})
}

let argsAndChars = argsString.split(' ')

i = argsAndChars.length
while (--i) {
  argsAndChars[i] = argsAndChars[i].replace(/___/ig, ' ')
}

// console.log({argsAndChars})

for (let flag in flags) {
  let val = flags[flag]
  flags[flag] = val.replace(/___/ig, ' ')
}

// console.log({flags})

let args = []

for (let i in argsAndChars) {
  let arg = argsAndChars[i]
  if (arg[0] === '-') {
    let charFlags = arg.slice(1).split('')
    for (let c of charFlags) flags[c] = true
  } else args.push(arg)
}

args = args.filter(a => !!a)

const result = { args, flags }

// console.log(result)
module.exports = result
