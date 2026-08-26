import { createHash } from 'node:crypto'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const standaloneRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workRoot = resolve(standaloneRoot, '.work')
const harnessRoot = resolve(workRoot, 'harness-sdk')
const artifactRoot = resolve(workRoot, 'artifacts')
const base = JSON.parse(await readFile(resolve(standaloneRoot, '.harness-base.json'), 'utf8'))
const command = process.argv[2]
const args = process.argv.slice(3)

if (!['vitest', 'bundle', 'pack'].includes(command)) {
  throw new Error('usage: run-in-harness.mjs <vitest|bundle|pack> [...args]')
}

const executable = name => process.platform === 'win32' ? `${name}.cmd` : name

const run = (program, childArgs, options = {}) => new Promise((accept, reject) => {
  const child = spawn(executable(program), childArgs, {
    cwd: options.cwd ?? standaloneRoot,
    env: { ...process.env, ...options.env },
    stdio: 'inherit',
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (code === 0) accept()
    else reject(new Error(`${program} exited with ${code ?? signal}`))
  })
})

const output = (program, childArgs, cwd) => new Promise((accept, reject) => {
  const child = spawn(executable(program), childArgs, { cwd, env: process.env })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (code === 0) accept(stdout.trim())
    else reject(new Error(`${program} exited with ${code ?? signal}: ${stderr.trim()}`))
  })
})

await mkdir(workRoot, { recursive: true })
try {
  await access(resolve(harnessRoot, '.git'))
  const current = await output('git', ['rev-parse', 'HEAD'], harnessRoot)
  if (current !== base.commit) {
    throw new Error(`Harness SDK checkout is ${current}; expected ${base.commit}`)
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
  await run('git', ['clone', '--filter=blob:none', '--no-checkout', base.repository, harnessRoot], { cwd: workRoot })
  await run('git', ['checkout', '--detach', base.commit], { cwd: harnessRoot })
}

await run('node', [resolve(standaloneRoot, 'scripts/materialize-harness.mjs'), harnessRoot])
await run('pnpm', ['install', '--no-frozen-lockfile'], { cwd: harnessRoot })
await run('node', [resolve(standaloneRoot, 'scripts/verify-package.mjs'), harnessRoot])

const bundle = async () => {
  await run('pnpm', [
    'exec',
    'tsc',
    '-p',
    'packages/extensions/lark/tsconfig.json',
    '--noCheck',
    '--incremental',
    'false',
    '--composite',
    'false',
  ], { cwd: harnessRoot })
  await run('pnpm', ['--filter', '@missher/dsh-lark', 'bundle'], { cwd: harnessRoot })
  await run('node', [resolve(standaloneRoot, 'scripts/verify-package.mjs'), harnessRoot, '--built'])
}

if (command === 'vitest') {
  await bundle()
  const selected = args.map(value => value.startsWith('tests/')
    ? `packages/extensions/lark/${value}`
    : value)
  await run('pnpm', ['exec', 'vitest', 'run', ...(selected.length ? selected : ['packages/extensions/lark/tests'])], { cwd: harnessRoot })
} else {
  await bundle()

  if (command === 'pack') {
    await mkdir(artifactRoot, { recursive: true })
    await run('pnpm', ['--filter', '@missher/dsh-lark', 'pack', '--pack-destination', artifactRoot], { cwd: harnessRoot })
    const artifact = resolve(artifactRoot, 'missher-dsh-lark-0.2.0.tgz')
    const bytes = await readFile(artifact)
    const digest = createHash('sha256').update(bytes).digest('hex')
    await writeFile(resolve(artifactRoot, 'SHA256SUMS.txt'), `${digest}  missher-dsh-lark-0.2.0.tgz\n`)
    process.stdout.write(`${artifact}\n${digest} ${bytes.byteLength}\n`)
  }
}
