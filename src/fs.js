import { promisify } from 'util'
import fs from 'fs'

let readAsync = promisify(fs.readFile)
let writeAsync = promisify(fs.writeFile)
let statAsync = promisify(fs.stat)

function read(path, encoding) {
    return readAsync(path, encoding || 'utf-8')
}

function write(path, contents, encoding) {
    return writeAsync(path, contents, encoding || 'utf-8')
}

function stat(path) {
    return statAsync(path)
}

export { read, write, stat }
