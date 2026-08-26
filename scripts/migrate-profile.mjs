import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const LEGACY_PACKAGE = '@deepseek-ai/dsh-lark'
const STANDALONE_PACKAGE = '@missher/dsh-lark'

const runPnpm = profileDir => new Promise((accept, reject) => {
  const program = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const child = spawn(program, ['install', '--no-frozen-lockfile'], {
    cwd: profileDir,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  child.once('error', reject)
  child.once('exit', (code, signal) => {
    if (code === 0) accept()
    else reject(new Error(`pnpm install exited with ${code ?? signal}`))
  })
})

const readJson = async path => JSON.parse(await readFile(path, 'utf8'))

async function rejectCompetingLarkBundle(profileDir, bundles) {
  for (const packageName of bundles) {
    if ([LEGACY_PACKAGE, STANDALONE_PACKAGE].includes(packageName)) continue
    const patchPath = resolve(profileDir, 'node_modules', packageName, 'cordis.patch.yml')
    try {
      const patch = await readFile(patchPath, 'utf8')
      if (/^\s*-?\s*id:\s*['"]?lark['"]?\s*$/mu.test(patch)) {
        throw new Error(`profile already contains another id=lark bundle: ${packageName}`)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
}

async function copyProfileWithoutModules(source, target) {
  await mkdir(target, { recursive: true })
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    await cp(join(source, entry.name), join(target, entry.name), { recursive: true })
  }
}

/**
 * Replace the legacy package in an exact Harness Profile using a staged directory swap.
 * The caller must stop Harness before invoking this operation.
 */
export async function migrateProfile({ profileDir, packagePath, install = runPnpm }) {
  if (!isAbsolute(profileDir) || !isAbsolute(packagePath)) {
    throw new Error('profileDir and packagePath must be absolute paths')
  }

  const exactProfile = resolve(profileDir)
  const exactPackage = resolve(packagePath)
  if (basename(exactProfile) === ''
    || exactProfile === dirname(exactProfile)
    || basename(dirname(exactProfile)) !== 'profiles') {
    throw new Error('profileDir must name one exact child of a profiles directory')
  }

  await access(exactPackage)
  const manifestPath = resolve(exactProfile, 'package.json')
  const manifest = await readJson(manifestPath)
  const dependencies = { ...(manifest.dependencies ?? {}) }
  if (dependencies[LEGACY_PACKAGE] !== undefined && dependencies[STANDALONE_PACKAGE] !== undefined) {
    throw new Error('profile contains both legacy and standalone dsh-lark dependencies')
  }

  const bundles = [...(manifest.dsh?.profile?.bundles ?? [])]
  await rejectCompetingLarkBundle(exactProfile, bundles)

  delete dependencies[LEGACY_PACKAGE]
  dependencies[STANDALONE_PACKAGE] = `file:${exactPackage}`
  const nextBundles = bundles
    .filter(name => name !== LEGACY_PACKAGE && name !== STANDALONE_PACKAGE)
  const legacyIndex = bundles.indexOf(LEGACY_PACKAGE)
  nextBundles.splice(legacyIndex < 0 ? nextBundles.length : legacyIndex, 0, STANDALONE_PACKAGE)

  const nextManifest = {
    ...manifest,
    dependencies,
    dsh: {
      ...manifest.dsh,
      profile: { ...manifest.dsh?.profile, bundles: nextBundles },
    },
  }

  const parent = dirname(exactProfile)
  const stage = await mkdtemp(join(parent, `.${basename(exactProfile)}.dsh-lark-stage-`))
  const backup = join(parent, `.${basename(exactProfile)}.dsh-lark-backup-${randomUUID()}`)
  let originalMoved = false
  let completed = false

  try {
    await copyProfileWithoutModules(exactProfile, stage)
    await writeFile(resolve(stage, 'package.json'), `${JSON.stringify(nextManifest, undefined, 2)}\n`)
    await install(stage)

    const installedRoot = resolve(stage, 'node_modules', '@missher', 'dsh-lark')
    const installedManifest = await readJson(resolve(installedRoot, 'package.json'))
    const installedPatch = await readFile(resolve(installedRoot, 'cordis.patch.yml'), 'utf8')
    if (installedManifest.name !== STANDALONE_PACKAGE
      || !installedPatch.includes('id: lark')
      || !installedPatch.includes(`name: '${STANDALONE_PACKAGE}'`)) {
      throw new Error('staged package does not provide the expected lark bundle')
    }

    await rename(exactProfile, backup)
    originalMoved = true
    try {
      await rename(stage, exactProfile)
    } catch (error) {
      await rename(backup, exactProfile)
      originalMoved = false
      throw error
    }
    completed = true
    return { profileDir: exactProfile, backupDir: backup, packageName: STANDALONE_PACKAGE }
  } finally {
    if (!completed) {
      await rm(stage, { recursive: true, force: true })
      if (originalMoved) await rename(backup, exactProfile)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const profileFlag = args.indexOf('--profile-dir')
  const packageFlag = args.indexOf('--package')
  const profileDir = profileFlag >= 0 ? args[profileFlag + 1] : undefined
  const packagePath = packageFlag >= 0 ? args[packageFlag + 1] : undefined
  if (!profileDir || !packagePath) {
    throw new Error('usage: migrate-profile.mjs --profile-dir <absolute path> --package <absolute tgz>')
  }
  const result = await migrateProfile({ profileDir, packagePath })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
