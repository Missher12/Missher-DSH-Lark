import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const [artifact, checksum] = process.argv.slice(2)
if (!artifact || !checksum) throw new Error('artifact and checksum are required')

const bytes = await readFile(artifact)
const digest = createHash('sha256').update(bytes).digest('hex')
const lines = (await readFile(checksum, 'utf8')).split('\n').filter(Boolean)

if (lines.length !== 1 || lines[0].includes('\r')) {
  throw new Error('checksum file must contain one LF-only record')
}

const [recordedDigest, recordedName] = lines[0].trim().split(/\s+/u)
if (recordedDigest !== digest || recordedName !== basename(artifact)) {
  throw new Error('release checksum mismatch')
}

process.stdout.write(`${digest} ${bytes.byteLength}\n`)
