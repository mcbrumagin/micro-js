import crypto from 'crypto'

// --- simple fast checking for uniqueness ------------------------------------

export function calculateMD5Checksum(data) {
  return crypto.createHash('md5').update(data).digest('hex')
}

export function calculateSHA1Checksum(data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}


// --- safe from collision attacks --------------------------------------------

export function calculateSHA256Checksum(data) {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function calculateSHA512Checksum(data) {
  return crypto.createHash('sha512').update(data).digest('hex')
}
