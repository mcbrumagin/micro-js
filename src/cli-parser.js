let [,, ...argv] = Array.prototype.slice.call(process.argv)

let i = argv.length
while (--i) {
  argv[i] = argv[i].replace(/\ /ig, '___')
}

let argsString = argv.join(' ')

let flags = {}

const optionRegex = /(?:^|\s)--(.+?)(?:=|\s)(.+?)(?:\s|$)/i

let matchResult
while ((matchResult = argsString.match(optionRegex)) != null) {
  let [match, flag, value] = Array.prototype.slice.call(matchResult)
  flags[flag] = value.trim()
  match = match.slice(0, match.length-1)
  argsString = argsString.replace(match, '')
}

let argsAndChars = argsString.split(' ')

i = argsAndChars.length
while (--i) {
  argsAndChars[i] = argsAndChars[i].replace(/___/ig, ' ')
}

for (let flag in flags) {
  let val = flags[flag]
  flags[flag] = val.replace(/___/ig, ' ')
}

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

console.log(result)
module.exports = result
