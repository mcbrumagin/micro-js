import childProcess from 'child_process'

const {
  exec: nativeExec,
  execFile: nativeExecFile,
  spawn: nativeSpawn
  // TODO others?
} = childProcess

async function exec(cmd) {
  return new Promise((resolve, reject) => {
    let child = nativeExec(cmd)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', data => stdout += data)
    child.stderr.on('data', data => stderr += data)
    child.on('close', code => {
      if (code === 0) resolve(stdout)
      else {
        let err = new Error(stderr || stdout || `Unknown error [${code}]`)
        err.code = code
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
      }
    })
  })
}

async function execFile() {
  console.log('TODO')
}

async function spawn() {
  console.log('TODO')
}

export {
  exec,
  execFile,
  spawn
}
