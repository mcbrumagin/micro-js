import childProcess from 'child_process'

function spawn(commandText, { stdoutFn, stderrFn, dir, detached } = {}) {
    let placeholders = {}
    let commandTextWithPlaceHolders = ''
    let fragIndex = 0
    let placeholderIndex = 0

    commandText.split(/'|"/g).forEach(frag => {
        if (fragIndex % 2 === 1) {
            commandTextWithPlaceHolders += '$$' + placeholderIndex
            placeholders[placeholderIndex] = frag
            placeholderIndex++
        } else {
            commandTextWithPlaceHolders += frag
        }
        fragIndex++
    })

    let commands = []
    commandTextWithPlaceHolders.split('&&').forEach(frag => {
        let subFrags = frag.split(' ').filter(f => f !== '')
        let cmd = subFrags[0]
        let args = subFrags.slice(1)

        args = args.map(arg => {
            for (let ind in placeholders) {
                if (arg === `$$${ind}`) return placeholders[ind]
            }
            return arg
        })
        commands.push({ cmd, args })
    })

    function spawnOneAsync(command, args) {
        return new Promise((resolve, reject) => {

            let options = {}
            options.cwd = dir
            options.detached = detached
            let cmd = childProcess.spawn(command, args, options)
            let stdData
            let errData

            cmd.stdout.on('data', function (data) {
                stdData += data
                if (stdoutFn) stdoutFn(data)
            })

            cmd.stderr.on('data', function (data) {
                errData += data
                if (stderrFn) stderrFn(data)
            })

            cmd.on('close', function (code) {
                if (code !== 0) reject(errData || stdData)
                else resolve(stdData)
            })
        })
    }

    let result = Promise.resolve()
    for (let command of commands) {
        let { cmd, args } = command
        result = result.then(() => spawnOneAsync(cmd, args))
    }
    return result
}

export default spawn
