import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
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
function stubShellRoot(manifestOverrides: Record<string, unknown> = {}): string {
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
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: pkg.name,
      type: 'module',
      main: 'lib/index.js',
      exports: {
        '.': './lib/index.js',
        './client': './lib/client.js',
        './package.json': './package.json',
      },
      files: ['lib/index.js', 'lib/client.js', 'lib/client.js.map', 'cordis.patch.yml'],
      ...manifestOverrides,
    }, null, 2))
    writeFileSync(join(dir, 'cordis.patch.yml'), '- insert: []\n')
    writeFileSync(join(dir, 'lib', 'index.js'), '// composed host\n')
    writeFileSync(join(dir, 'lib', 'client.js'), '// composed client\n')
    writeFileSync(join(dir, 'lib', 'client.js.map'), '{}\n')
    writeFileSync(join(dir, 'src', 'source.ts'), '// must stay in the repo\n')
  }
  return root
}

function snapshotTree(dir: string) {
  return ['', ...readdirSync(dir, { recursive: true }).sort()].map(relativePath => {
    const path = join(dir, relativePath)
    const stat = statSync(path)
    return { relativePath, mtimeMs: stat.mtimeMs, content: stat.isFile() ? readFileSync(path) : null }
  })
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
      for (const rel of ['package.json', 'cordis.patch.yml', 'lib/index.js', 'lib/client.js', 'lib/client.js.map']) {
        expect(readFileSync(join(dir, rel))).toEqual(readFileSync(join(shellRoot, pkg.dir, rel)))
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

  it('rejects a nonempty composed lib missing its declared index.js before writing or installing', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const packageDir = join(shellRoot, COMPOSED_PACKAGES[0].dir)
    const missingPath = join(packageDir, 'lib', 'index.js')
    rmSync(missingPath)
    expect(existsSync(join(packageDir, 'lib', 'client.js'))).toBe(true)

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`missing composed package file ${missingPath} — run pnpm run build`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it.each(['lib/client.js', 'lib/client.js.map', 'cordis.patch.yml'])(
    'rejects missing declared %s without creating the profile, then succeeds after restoration',
    async (relativePath) => {
      const shellRoot = stubShellRoot()
      const profileDir = tempDir('profile')
      const install = vi.fn(async () => {})
      const pkg = COMPOSED_PACKAGES[0]
      const missingPath = join(shellRoot, pkg.dir, relativePath)
      const original = readFileSync(missingPath)
      rmSync(missingPath)
      expect(existsSync(join(shellRoot, pkg.dir, 'lib', 'index.js'))).toBe(true)
      const input = { seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }

      await expect(materializeProfile(input))
        .rejects.toThrow(`missing composed package file ${missingPath} — run pnpm run build`)

      expect(install).not.toHaveBeenCalled()
      expect(existsSync(profileDir)).toBe(false)
      writeFileSync(missingPath, original)

      await expect(materializeProfile(input)).resolves.toMatchObject({ installed: true })
      expect(install).toHaveBeenCalledExactlyOnceWith(profileDir)
      expect(readFileSync(join(profileDir, COMPOSED_DIR_NAME, pkg.name, relativePath))).toEqual(original)
    },
  )

  it.each(['lib/index.js', 'lib/client.js', 'lib/client.js.map'])(
    'leaves an existing profile unchanged when declared %s is missing',
    async (relativePath) => {
      const shellRoot = stubShellRoot()
      const profileDir = tempDir('profile')
      const install = vi.fn(async () => {})
      const input = { seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }
      await materializeProfile(input)
      install.mockClear()
      writeFileSync(join(profileDir, 'cordis.yml'), 'preserve this drift\n')
      const before = snapshotTree(profileDir)
      const pkg = COMPOSED_PACKAGES[0]
      const missingPath = join(shellRoot, pkg.dir, relativePath)
      const original = readFileSync(missingPath)
      rmSync(missingPath)

      await expect(materializeProfile(input))
        .rejects.toThrow(`missing composed package file ${missingPath} — run pnpm run build`)

      expect(install).not.toHaveBeenCalled()
      expect(snapshotTree(profileDir)).toEqual(before)
      writeFileSync(missingPath, original)

      await expect(materializeProfile(input)).resolves.toMatchObject({ installed: true })
      expect(install).toHaveBeenCalledExactlyOnceWith(profileDir)
      expect(readFileSync(join(profileDir, COMPOSED_DIR_NAME, pkg.name, relativePath))).toEqual(original)
    },
  )

  it('requires an additional literal artifact declared by the manifest', async () => {
    const shellRoot = stubShellRoot({
      files: ['lib/index.js', 'lib/client.js', 'lib/client.js.map', 'cordis.patch.yml', 'lib/extra.js'],
    })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const pkg = COMPOSED_PACKAGES[0]
    const missingPath = join(shellRoot, pkg.dir, 'lib', 'extra.js')
    const input = { seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }

    await expect(materializeProfile(input))
      .rejects.toThrow(`missing composed package file ${missingPath} — run pnpm run build`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
    writeFileSync(missingPath, '// extra declared artifact\n')

    await expect(materializeProfile(input)).resolves.toMatchObject({ installed: true })
    expect(readFileSync(join(profileDir, COMPOSED_DIR_NAME, pkg.name, 'lib', 'extra.js'), 'utf8'))
      .toBe('// extra declared artifact\n')
  })

  it('does not require an undeclared source map', async () => {
    const shellRoot = stubShellRoot({ files: ['lib/index.js', 'lib/client.js', 'cordis.patch.yml'] })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    rmSync(join(shellRoot, COMPOSED_PACKAGES[0].dir, 'lib', 'client.js.map'))

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .resolves.toMatchObject({ installed: true })
    expect(install).toHaveBeenCalledExactlyOnceWith(profileDir)
  })

  it.each([
    ['invalid JSON', '{'],
    ['null', 'null'],
    ['array', '[]'],
    ['primitive', '42'],
    ['missing files', '{}'],
    ['null files', '{"files":null}'],
    ['string files', '{"files":"lib/index.js"}'],
    ['object files', '{"files":{"path":"lib/index.js"}}'],
    ['empty files', '{"files":[]}'],
  ])('fails closed for a composed manifest with %s', async (_label, contents) => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const manifestPath = join(shellRoot, COMPOSED_PACKAGES[0].dir, 'package.json')
    writeFileSync(manifestPath, contents)

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`invalid composed package manifest ${manifestPath}`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it.each([
    ['null', null],
    ['number', 42],
    ['object', { path: 'lib/index.js' }],
    ['array', ['lib/index.js']],
    ['empty', ''],
    ['whitespace', ' '],
    ['absolute', '/lib/index.js'],
    ['Windows absolute', 'C:\\lib\\index.js'],
    ['Windows drive-relative', 'C:lib/index.js'],
    ['backslash traversal', '..\\lib\\index.js'],
    ['traversal', '../index.js'],
    ['nested traversal', 'lib/../package.json'],
    ['dot segment', './lib/index.js'],
    ['empty segment', 'lib//index.js'],
    ['NUL', 'lib/index.js\0'],
    ['glob', 'lib/*.js'],
    ['globstar', 'lib/**'],
    ['wildcard', 'lib/client.?s'],
    ['character class', 'lib/[ic]*.js'],
    ['brace expansion', 'lib/{index,client}.js'],
    ['extglob', 'lib/@(index|client).js'],
    ['negation', '!lib/client.js.map'],
  ])('fails closed for an unsupported %s files entry', async (_label, entry) => {
    const shellRoot = stubShellRoot({ files: ['lib/index.js', entry] })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const manifestPath = join(shellRoot, COMPOSED_PACKAGES[0].dir, 'package.json')

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`unsupported composed package files entry ${JSON.stringify(entry)} in ${manifestPath}`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it('rejects a directory in place of a declared file', async () => {
    const shellRoot = stubShellRoot()
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const artifactPath = join(shellRoot, COMPOSED_PACKAGES[0].dir, 'lib', 'index.js')
    rmSync(artifactPath)
    mkdirSync(artifactPath)

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`unsupported composed package artifact ${artifactPath}: expected a regular file`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it.each(['file', 'parent directory'])('rejects a declared artifact escaping through a symlinked %s', async (shape) => {
    const shellRoot = stubShellRoot({ files: ['lib/index.js', 'lib/linked/extra.js'] })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const pkg = COMPOSED_PACKAGES[0]
    const linkedDir = join(shellRoot, pkg.dir, 'lib', 'linked')
    const artifactPath = join(linkedDir, 'extra.js')
    const outside = tempDir('outside-package')
    mkdirSync(outside)
    writeFileSync(join(outside, 'extra.js'), '// outside package\n')
    if (shape === 'file') {
      mkdirSync(linkedDir)
      symlinkSync(join(outside, 'extra.js'), artifactPath)
    } else {
      symlinkSync(outside, linkedDir, 'dir')
    }

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`unsafe composed package artifact ${artifactPath}: resolves outside its package`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it('rejects declared directory expansion rather than accepting a nonempty directory', async () => {
    const shellRoot = stubShellRoot({ files: ['lib'] })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const artifactPath = join(shellRoot, COMPOSED_PACKAGES[0].dir, 'lib')

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`unsupported composed package artifact ${artifactPath}: expected a regular file`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
  })

  it('rejects a declared artifact outside the composed copy plan', async () => {
    const shellRoot = stubShellRoot({ files: ['lib/index.js', 'src/source.ts'] })
    const profileDir = tempDir('profile')
    const install = vi.fn(async () => {})
    const artifactPath = join(shellRoot, COMPOSED_PACKAGES[0].dir, 'src', 'source.ts')

    await expect(materializeProfile({ seedDir, shellRoot, repoRoot: shellRoot, profileDir, install }))
      .rejects.toThrow(`unsupported composed package artifact ${artifactPath}: not covered by the copy plan`)

    expect(install).not.toHaveBeenCalled()
    expect(existsSync(profileDir)).toBe(false)
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

  it('fails loud when a composed package lib exists but is empty (ablation-discovered, DA-26)', async () => {
    const shellRoot = stubShellRoot()
    const libDir = join(shellRoot, COMPOSED_PACKAGES[0]?.dir ?? '', 'lib')
    rmSync(libDir, { recursive: true, force: true })
    mkdirSync(libDir, { recursive: true })
    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: composed package directory .* is empty/u)
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
