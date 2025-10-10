import { exec } from '../utils/child-process.js'

async function runAndLog(cmd) {
  console.log(`--- '${cmd}' ---`)
  let stdout = await exec(cmd)
  console.log(stdout)
}

async function main() {
  await runAndLog('git status')
  await runAndLog('ls -a')
  await runAndLog('df -h')
}

main()
.catch(err => {
  console.log(err.message)
})
