import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPOSED_DIR_NAME, COMPOSED_PACKAGES, HOST_CONFIG_FILE, HOST_DIR_NAME, HOST_LIB_FILES, SEED_FILES, composeProfileManifest } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function tempDir(label: string): string {
  const dir = join(tmpdir(), `lute-shell-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(dir)
  return dir
}

// 临时 shellRoot：桩 lib/ + 真 overlay 副本 + 桩组合包。绝不往仓库的 lib/ 里写东西——
// 那是构建产物的家，混进桩文件会让后续 build/materialize 拷出假宿主。
function stubShellRoot(): string {
  const root = tempDir('shellroot')
  for (const name of HOST_LIB_FILES) {
    const path = join(root, 'lib', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `// built ${name}\n`)
  }
  mkdirSync(join(root, dirname(HOST_CONFIG_FILE)), { recursive: true })
  cpSync(join(realShellRoot, HOST_CONFIG_FILE), join(root, HOST_CONFIG_FILE))
  for (const pkg of COMPOSED_PACKAGES) {
    const dir = join(root, pkg.dir)
    mkdirSync(join(dir, 'lib'), { recursive: true })
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: pkg.name }, null, 2))
    writeFileSync(join(dir, 'cordis.patch.yml'), '- insert: []\n')
    writeFileSync(join(dir, 'lib', 'index.js'), '// composed host\n')
    writeFileSync(join(dir, 'lib', 'client.js'), '// composed client\n')
    writeFileSync(join(dir, 'src', 'source.ts'), '// must stay in the repo\n')
  }
  return root
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('materializeProfile', () => {
  it('copies the seed and the built host runtime, then installs', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})

    const result = await materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install })

    expect(result.installed).toBe(true)
    expect(result.profileDir).toBe(profileDir)
    expect(result.hostEntry).toBe(join(profileDir, HOST_DIR_NAME, 'host', 'index.js'))
    expect(result.overlay).toBe(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))
    expect(install).toHaveBeenCalledWith(profileDir)
    for (const name of SEED_FILES) expect(existsSync(join(profileDir, name)), name).toBe(true)
    for (const name of HOST_LIB_FILES) {
      expect(existsSync(join(profileDir, HOST_DIR_NAME, name)), name).toBe(true)
    }
    expect(existsSync(join(profileDir, HOST_DIR_NAME, 'shell.cordis.patch.yml'))).toBe(true)
    expect(readFileSync(join(profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
  })

  it('is idempotent and re-syncs a drifted seed file', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    await materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install })
    writeFileSync(join(profileDir, 'cordis.yml'), 'drifted\n')

    await materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install })

    expect(readFileSync(join(profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
    expect(install).toHaveBeenCalledTimes(2)
  })

  it('composes the shell-owned packages into the profile without their sources', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')

    await materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install: vi.fn(async () => {}) })

    for (const pkg of COMPOSED_PACKAGES) {
      const dir = join(profileDir, COMPOSED_DIR_NAME, pkg.name)
      for (const rel of ['package.json', 'cordis.patch.yml', join('lib', 'index.js'), join('lib', 'client.js')]) {
        expect(existsSync(join(dir, rel)), `${pkg.name}/${rel}`).toBe(true)
      }
      expect(existsSync(join(dir, 'src')), `${pkg.name}/src must stay in the repo`).toBe(false)
    }
  })

  it('declares every composed package in the profile manifest, not in the seed', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')

    await materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install: vi.fn(async () => {}) })

    const manifest = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    for (const pkg of COMPOSED_PACKAGES) {
      expect(manifest.dependencies[pkg.name]).toBe(`file:./${COMPOSED_DIR_NAME}/${pkg.name}`)
      expect(manifest.dsh.profile.bundles).toContain(pkg.name)
    }
    // 底座仍在前，组合包追加在后；顺序即 boot 清单的顺序。
    expect(manifest.dsh.profile.bundles.slice(0, 2)).toEqual(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'])

    const seed = JSON.parse(readFileSync(join(seedDir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(seed.dependencies).not.toHaveProperty(COMPOSED_PACKAGES[0]?.name)
  })

  it('composes the profile manifest purely and idempotently', () => {
    const seed = {
      name: 'lute-shell-profile',
      dependencies: { '@deepseek-ai/dsh': '0.1.5-rc.2' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }
    const before = structuredClone(seed)

    const composed = composeProfileManifest(seed)

    expect(seed).toEqual(before)
    expect(composed.dependencies).toEqual({
      '@deepseek-ai/dsh': '0.1.5-rc.2',
      ...Object.fromEntries(COMPOSED_PACKAGES.map(pkg => [pkg.name, `file:./${COMPOSED_DIR_NAME}/${pkg.name}`])),
    })
    expect(composed.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', ...COMPOSED_PACKAGES.map(pkg => pkg.name)])
    expect(composeProfileManifest(composed)).toEqual(composed)
  })

  it('fails loud when a composed package has not been built', async () => {
    const shellRoot = stubShellRoot()
    rmSync(join(shellRoot, COMPOSED_PACKAGES[0]?.dir ?? '', 'lib'), { recursive: true, force: true })
    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: missing composed package file /u)
  })

  it('fails loud when a seed file is missing', async () => {
    const shellRoot = stubShellRoot()
    await expect(materializeProfile({
      seedDir: join(seedDir, 'absent'),
      shellRoot,
      repoRoot: shellRoot,
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: missing seed file /u)
  })

  it('fails loud when the built host runtime is missing', async () => {
    const shellRoot = tempDir('empty-shellroot')
    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: built host runtime is missing /u)
  })

  it('propagates an install failure', async () => {
    const shellRoot = stubShellRoot()
    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      profileDir: tempDir('profile'),
      install: async () => { throw new Error('lute shell: pnpm install failed with 1: ERR_PNPM_FETCH_404') },
    })).rejects.toThrow(/ERR_PNPM_FETCH_404/u)
  })
})
