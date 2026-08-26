import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const requestedRoot = process.argv[2]
if (!requestedRoot) throw new Error('Harness root is required')

const root = resolve(requestedRoot)
const packageRoot = resolve(root, 'packages/extensions/lark')
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))

if (manifest.name !== '@missher/dsh-lark' || manifest.version !== '0.2.0') {
  throw new Error('standalone package was not materialized')
}
if (JSON.stringify(manifest).toLowerCase().includes('openclaw')) {
  throw new Error('OpenClaw dependency is forbidden')
}

const patch = await readFile(resolve(packageRoot, 'cordis.patch.yml'), 'utf8')
if (!patch.includes("name: '@missher/dsh-lark'") || !patch.includes('id: lark')) {
  throw new Error('bundle patch identity is invalid')
}

if (process.argv.includes('--built')) {
  for (const output of ['lib/index.js', 'lib/client.js', 'lib/invariant.js']) {
    await access(resolve(packageRoot, output))
    const contents = await readFile(resolve(packageRoot, output), 'utf8')
    if (contents.includes(root) || contents.includes(root.replaceAll('\\', '/'))) {
      throw new Error(`local build path leaked into ${output}`)
    }
  }
}

process.stdout.write('@missher/dsh-lark package verified\n')
