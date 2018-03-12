import vultrApi from './vultr-api.js'
import username from 'username'
import fs from './fs.js'

function generateSshKey({ privateKeyPath, sshPassword }) {
    return spawn(`ssh-keygen -t rsa -f ${privateKeyPath} -q -P "${sshPassword}"`, {
        stdoutFn: (data) => process.stdout.write(`ssh-keygen: ${data}`),
        stderrFn: (data) => process.stdout.write(`ssh-keygen[error]: ${data}`)
    })
}

const privateKeyPath = `./.ssh/id_rsa`
const publicKeyPath = `./.ssh/id_rsa.pub`

function initializeSshKey(sshPassword, retries = 0) {

    const generateAndGetSshKey = async () => {
        await generateSshKey({ privateKeyPath, sshPassword })
        return fs.read(publicKeyPath)
    }

    const getKeyAndUploadToVultr = () => {
        let [keys, username] = await Promise.all([vultrApi.listSshKeys(), username()])
        let name = `${username}@deployer`
        let key = keys.find(k => k.name === name)
        if (key && key.id) return key.id
        else {
            let publicKey
            try {
                publicKey = await readPublicKey()
            } catch (err) {
                publicKey = await generateAndGetSshKey()
            }
            await vultrApi.createSshKey({ name, publicKey })
            await initializeSshKey(retries + 1)
        }
    }

    try {
        return getKeyAndUploadToVultr()
    } catch (err) {
        if (retries > 2) throw err
        else return initializeSshKey(sshPassword, retries + 1)
    }
}

export {
    initializeSshKey
}
