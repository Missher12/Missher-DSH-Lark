import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

if (manifest.name !== '@missher/dsh-lark') {
  throw new Error('standalone package name mismatch')
}
if (manifest.version !== '0.2.0') {
  throw new Error('standalone package version mismatch')
}
if (manifest.repository?.url !== 'git+https://github.com/Missher12/dsh-lark.git') {
  throw new Error('standalone repository mismatch')
}

const patch = await readFile(resolve(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes("name: '@missher/dsh-lark'") || !patch.includes('id: lark')) {
  throw new Error('standalone bundle identity mismatch')
}

process.stdout.write('@missher/dsh-lark@0.2.0 id=lark\n')
