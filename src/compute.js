import digitalocean from 'digitalocean'

class Compute {

    constructor(apiKey) {
        this.client = digitalocean.client(apiKey)
    }

    get(id) {
        return this.client.droplets.get(id)
    }

    listSshKeys() {
        return this.client.account.listSshKeys()
    }

    createSshKey({ name, publicKey }) {
        return this.client.account.createSshKey({ name, publicKey })
    }

    list() {
        return this.client.droplets.list()
            .map(droplet => {
                let tags = droplet.tags
                droplet.tags = {}
                for (let tag of tags) {
                    let frags = tag.split(':')
                    let prop = frags[0]
                    if (droplet.tags[prop]) throw new Error(`Duplicate tag prefix/name: ${prop}`)
                    else if (frags.length === 1) droplet.tags[prop] = prop
                    else if (frags.length === 2) droplet.tags[prop] = frags[1]
                    else droplet.tags[prop] = frags.slice(1)
                }
            })
    }

    create({ name, publicKey, size, tags }) {
        let options = {
            name,
            tags: tags || [],
            ssh_keys: [publicKey],
            size: size || "512MB",
            region: "nyc3",
            image: "ubuntu-14-04-x64",
            backups: false,
            ipv6: false,
            user_data: null,
            volumes: null,
            private_networking: null
        }

        return this.client.droplets.create(options)
    }

    // TODO REMOVE
    update() {

    }

    // TODO REMOVE
    updateAllTags(id, newTag) {
        let [appName, appHash] = newTag.split(':')
        return this.list()
            .map(droplet =>
                droplet.tags.forEach(tag => {
                    let [name, hash] = tag.split(':')
                    if (name === appName && hash !== appHash) {
                        return this.client.tags.update(tag, { name: newTag })
                    }
                })
            )
    }

    updateTag(id, newTag) {
        let [appName, appHash] = newTag.split(':')
        return this.get(id)
            .then(droplet =>
                droplet.tags.forEach(tag => {
                    let [name, hash] = tag.split(':')
                    if (name === appName && hash !== appHash) {
                        return this.client.tags.update(tag, { name: newTag })
                    }
                })
            )
    }

    delete(id) {
        return this.client.droplets.delete(id)
    }

    deleteAll() {
        return this.list()
            .each(droplet => this.delete(droplet.id))
    }

}

export default function initializeDroplets(apiKey) {
    // TODO VERIFY
    return new Droplets(process.env.apiKey || apiKey)
}
