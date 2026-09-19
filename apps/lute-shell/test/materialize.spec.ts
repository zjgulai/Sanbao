import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOST_CONFIG_FILE, HOST_DIR_NAME, HOST_LIB_FILES, SEED_FILES } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function tempDir(label: string): string {
  const dir = join(tmpdir(), `lute-shell-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(dir)
  return dir
}

// 临时 shellRoot：桩 lib/ + 真 overlay 副本。绝不往仓库的 lib/ 里写东西——
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

    const result = await materializeProfile({ seedDir, shellRoot, profileDir, install })

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
    await materializeProfile({ seedDir, shellRoot, profileDir, install })
    writeFileSync(join(profileDir, 'cordis.yml'), 'drifted\n')

    await materializeProfile({ seedDir, shellRoot, profileDir, install })

    expect(readFileSync(join(profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
    expect(install).toHaveBeenCalledTimes(2)
  })

  it('fails loud when a seed file is missing', async () => {
    await expect(materializeProfile({
      seedDir: join(seedDir, 'absent'),
      shellRoot: stubShellRoot(),
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: missing seed file /u)
  })

  it('fails loud when the built host runtime is missing', async () => {
    await expect(materializeProfile({
      seedDir,
      shellRoot: tempDir('empty-shellroot'),
      profileDir: tempDir('profile'),
      install: vi.fn(async () => {}),
    })).rejects.toThrow(/^lute shell: built host runtime is missing /u)
  })

  it('propagates an install failure', async () => {
    await expect(materializeProfile({
      seedDir,
      shellRoot: stubShellRoot(),
      profileDir: tempDir('profile'),
      install: async () => { throw new Error('lute shell: pnpm install failed with 1: ERR_PNPM_FETCH_404') },
    })).rejects.toThrow(/ERR_PNPM_FETCH_404/u)
  })
})
