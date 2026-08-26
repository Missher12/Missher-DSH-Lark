import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const requestedRoot = process.argv[2]
if (!requestedRoot) throw new Error('extracted package root is required')

const root = resolve(requestedRoot)
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
if (manifest.name !== '@missher/dsh-lark' || manifest.version !== '0.2.0') {
  throw new Error('release package identity mismatch')
}
if (manifest.repository?.url !== 'git+https://github.com/Missher12/dsh-lark.git') {
  throw new Error('release repository metadata mismatch')
}

for (const file of [
  'lib/index.js',
  'lib/client.js',
  'lib/invariant.js',
  'lib/types/index.d.ts',
  'cordis.patch.yml',
  'LICENSE',
]) {
  await access(resolve(root, file))
}

const patch = await readFile(resolve(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes('id: lark') || !patch.includes("name: '@missher/dsh-lark'")) {
  throw new Error('release bundle patch mismatch')
}

process.stdout.write('@missher/dsh-lark release contents verified\n')
