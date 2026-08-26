import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateProfile } from '../scripts/migrate-profile.mjs'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function digestTree(root: string): Promise<string> {
  const hash = createHash('sha256')
  const walk = async (dir: string): Promise<void> => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(entry.name)
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await walk(path)
      else hash.update(await readFile(path))
    }
  }
  await walk(root)
  return hash.digest('hex')
}

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), 'dsh-lark-migration-'))
  roots.push(home)
  const profileDir = join(home, 'profiles', 'web')
  const dataDir = join(home, 'lark')
  const packagePath = join(home, 'missher-dsh-lark-0.2.0.tgz')
  await mkdir(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-lark'), { recursive: true })
  await mkdir(dataDir, { recursive: true })
  await writeFile(join(dataDir, 'state.json'), '{"queue":["turn-a"]}\n')
  await writeFile(packagePath, 'fixture')
  await writeFile(join(profileDir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: { '@deepseek-ai/dsh-lark': 'file:legacy.tgz' },
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-lark'] } },
  }, undefined, 2)}\n`)
  await writeFile(join(profileDir, 'cordis.patch.yml'), '[]\n')
  await writeFile(join(profileDir, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\n')
  return { home, profileDir, dataDir, packagePath }
}

const installFixture = async (stage: string): Promise<void> => {
  const installed = join(stage, 'node_modules', '@missher', 'dsh-lark')
  await mkdir(installed, { recursive: true })
  await writeFile(join(installed, 'package.json'), '{"name":"@missher/dsh-lark","version":"0.2.0"}\n')
  await writeFile(join(installed, 'cordis.patch.yml'), "- insert:\n    - id: lark\n      name: '@missher/dsh-lark'\n")
}

describe('standalone profile migration', () => {
  it('atomically replaces the package identity without touching lark data', async () => {
    const current = await fixture()
    const beforeData = await digestTree(current.dataDir)
    const result = await migrateProfile({
      profileDir: current.profileDir,
      packagePath: current.packagePath,
      install: installFixture,
    })

    const manifest = JSON.parse(await readFile(join(current.profileDir, 'package.json'), 'utf8'))
    expect(manifest.dependencies).toEqual({
      '@missher/dsh-lark': `file:${current.packagePath}`,
    })
    expect(manifest.dsh.profile.bundles).toEqual([
      '@deepseek-ai/dsh-base',
      '@missher/dsh-lark',
    ])
    expect(await digestTree(current.dataDir)).toBe(beforeData)
    expect(result.backupDir).toContain('.web.dsh-lark-backup-')
    expect(JSON.parse(await readFile(join(result.backupDir, 'package.json'), 'utf8')).dependencies)
      .toHaveProperty('@deepseek-ai/dsh-lark')
  })

  it('keeps the exact original profile bytes when staging fails', async () => {
    const current = await fixture()
    const manifestPath = join(current.profileDir, 'package.json')
    const beforeManifest = await readFile(manifestPath)
    const beforeData = await digestTree(current.dataDir)

    await expect(migrateProfile({
      profileDir: current.profileDir,
      packagePath: current.packagePath,
      install: async () => { throw new Error('injected install failure') },
    })).rejects.toThrow('injected install failure')

    expect(await readFile(manifestPath)).toEqual(beforeManifest)
    expect(await digestTree(current.dataDir)).toBe(beforeData)
  })
})
