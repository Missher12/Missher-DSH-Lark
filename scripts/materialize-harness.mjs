import { cp, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requestedHarness = process.argv[2]

if (!requestedHarness) throw new Error('Harness root is required')

const harness = resolve(requestedHarness)
if (harness === source || basename(harness) !== 'harness-sdk') {
  throw new Error('expected an isolated harness-sdk path')
}

const target = resolve(harness, 'packages/extensions/lark')
await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

const entries = [
  'src',
  'tests',
  'package.json',
  'tsconfig.json',
  'tsdown.config.ts',
  'cordis.patch.yml',
  'README.md',
  'README.zh.md',
  'README.i18n.yaml',
  'LICENSE',
  'scripts/migrate-profile.mjs',
]

for (const entry of entries) {
  await mkdir(dirname(resolve(target, entry)), { recursive: true })
  await cp(resolve(source, entry), resolve(target, entry), { recursive: true })
}

process.stdout.write(`${target}\n`)
