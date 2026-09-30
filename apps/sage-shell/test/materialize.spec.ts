import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPOSED_PACKAGES, HOST_CONFIG_FILE, HOST_DIR_NAME, HOST_LIB_FILES, SEED_FILES, composeProfileManifest } from '../src/profile/layout.js'
import { materializeProfile } from '../src/profile/materialize.js'
import { PROFILE_MANIFEST_FILE, assertActiveProfile, generationProfileDir, readActiveProfile, resolveSagePaths } from '../src/profile/paths.js'
import { RUNTIME_ARTIFACT_ATTESTATION_FILE } from '../src/profile/runtime-artifact-attestation.js'

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn }))

const realShellRoot = join(import.meta.dirname, '..')
const seedDir = join(realShellRoot, 'seed')
const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-materialize-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

// A temporary shell root keeps all materialization writes off this shared checkout.
function stubShellRoot(): string {
  const root = temporary('shellroot')
  for (const name of HOST_LIB_FILES) {
    const path = join(root, 'lib', name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `// built ${name}\n`)
  }
  mkdirSync(join(root, dirname(HOST_CONFIG_FILE)), { recursive: true })
  cpSync(join(realShellRoot, HOST_CONFIG_FILE), join(root, HOST_CONFIG_FILE))
  return root
}

function testPaths(label: string) {
  return resolveSagePaths({ home: temporary(`${label}-home`), root: temporary(`${label}-root`) })
}

async function installProfileFixture(profileDir: string): Promise<void> {
  const packageDir = join(profileDir, 'node_modules/.pnpm/fixture@1.0.0/node_modules/fixture')
  const executable = join(packageDir, 'bin.js')
  mkdirSync(join(profileDir, 'node_modules/.bin'), { recursive: true })
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'index.js'), 'export const fixture = true\n')
  writeFileSync(executable, '#!/usr/bin/env node\nconsole.log("fixture")\n')
  chmodSync(executable, 0o755)
  symlinkSync('../.pnpm/fixture@1.0.0/node_modules/fixture/bin.js', join(profileDir, 'node_modules/.bin/fixture'))
  writeFileSync(join(profileDir, 'node_modules/.modules.yaml'), 'storeDir: /fixture/pnpm/store\n')
}

function failedPnpmInstall(stderrText: string) {
  const stderr = new EventEmitter() as NodeJS.ReadableStream & { setEncoding: (encoding: BufferEncoding) => void }
  stderr.setEncoding = vi.fn()
  const child = new EventEmitter() as import('node:child_process').ChildProcess
  Object.assign(child, { stderr })
  queueMicrotask(() => {
    stderr.emit('data', stderrText)
    child.emit('close', 1)
  })
  return child
}

afterEach(() => {
  spawn.mockReset()
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('materializeProfile', () => {
  it('stages a complete profile, validates it, then atomically activates its generation', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('first')
    const install = vi.fn(installProfileFixture)

    const result = await materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'first-generation',
      install,
    })

    const expectedProfile = generationProfileDir(paths, 'first-generation')
    expect(result).toMatchObject({
      generation: 'first-generation',
      profileDir: expectedProfile,
      hostEntry: join(expectedProfile, HOST_DIR_NAME, 'host', 'index.js'),
      overlay: join(expectedProfile, HOST_DIR_NAME, 'shell.cordis.patch.yml'),
      artifactSetDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      artifactAttestationDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      installed: true,
    })
    expect(install).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${paths.stagingDir.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/`)))
    for (const name of SEED_FILES) expect(existsSync(join(expectedProfile, name)), name).toBe(true)
    for (const name of HOST_LIB_FILES) expect(existsSync(join(expectedProfile, HOST_DIR_NAME, name)), name).toBe(true)
    const attestationPath = join(expectedProfile, RUNTIME_ARTIFACT_ATTESTATION_FILE)
    expect(existsSync(attestationPath)).toBe(true)
    expect(statSync(attestationPath).mode & 0o777).toBe(0o600)
    const receipt = JSON.parse(readFileSync(join(expectedProfile, PROFILE_MANIFEST_FILE), 'utf8')) as {
      files: readonly { readonly path: string; readonly sha256: string }[]
    }
    const attestationReceiptRow = receipt.files.find(row => row.path === RUNTIME_ARTIFACT_ATTESTATION_FILE)
    expect(attestationReceiptRow).toEqual({
      path: RUNTIME_ARTIFACT_ATTESTATION_FILE,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
    })
    await expect(readActiveProfile(paths)).resolves.toMatchObject({
      generation: 'first-generation',
      profileDir: expectedProfile,
      runtimeArtifactAttestationSha256: attestationReceiptRow?.sha256,
    })
    await expect(assertActiveProfile(paths, expectedProfile)).resolves.toMatchObject({ generation: 'first-generation' })
    await expect(assertActiveProfile(paths, join(paths.generationsDir, 'not-active'))).rejects.toThrow(/must match the active/u)
    expect(readdirSync(paths.stagingDir)).toEqual([])
  })

  it('keeps the previous immutable generation when a newer one activates', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('preserve')
    const install = vi.fn(installProfileFixture)
    const first = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'first-generation', install,
    })
    const firstCordis = readFileSync(join(first.profileDir, 'cordis.yml'), 'utf8')

    const second = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'second-generation', install,
    })

    expect(readFileSync(join(first.profileDir, 'cordis.yml'), 'utf8')).toBe(firstCordis)
    expect(readFileSync(join(second.profileDir, 'cordis.yml'), 'utf8')).toContain('[]')
    await expect(readActiveProfile(paths)).resolves.toMatchObject({ generation: 'second-generation', profileDir: second.profileDir })
  })

  it('leaves the previous pointer and generation intact when staging installation fails', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('failure')
    const stable = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'stable-generation', install: installProfileFixture,
    })
    let failingStage = ''

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'failing-generation',
      install: async (stage) => {
        failingStage = stage
        expect(existsSync(join(stage, RUNTIME_ARTIFACT_ATTESTATION_FILE))).toBe(false)
        throw new Error('fixture install failed')
      },
    })).rejects.toThrow(/fixture install failed/u)

    expect(failingStage).not.toBe('')
    expect(existsSync(failingStage)).toBe(false)
    await expect(readActiveProfile(paths)).resolves.toMatchObject({ generation: 'stable-generation', profileDir: stable.profileDir })
    expect(existsSync(generationProfileDir(paths, 'failing-generation'))).toBe(false)
    expect(readdirSync(paths.stagingDir)).toEqual([])
  })

  it('uses frozen pnpm installation and never activates an out-of-date lockfile generation', async () => {
    const shellRoot = stubShellRoot()
    const firstPaths = testPaths('outdated-first')
    spawn.mockImplementationOnce(() => failedPnpmInstall('ERR_PNPM_OUTDATED_LOCKFILE'))

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths: firstPaths,
      generation: 'outdated-first-generation',
    })).rejects.toThrow(/pnpm install failed with 1: ERR_PNPM_OUTDATED_LOCKFILE/u)

    expect(spawn).toHaveBeenCalledTimes(1)
    const [, firstArgs, firstOptions] = spawn.mock.calls[0] as [string, string[], { cwd: string }]
    expect(firstArgs).toEqual(['install', '--dir', firstOptions.cwd, '--frozen-lockfile'])
    expect(firstOptions.cwd).toMatch(new RegExp(`^${firstPaths.stagingDir.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/`))
    expect(existsSync(firstPaths.activeProfileFile)).toBe(false)
    expect(existsSync(generationProfileDir(firstPaths, 'outdated-first-generation'))).toBe(false)

    const existingPaths = testPaths('outdated-existing')
    const stable = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths: existingPaths, generation: 'stable-generation', install: installProfileFixture,
    })
    const pointerBefore = readFileSync(existingPaths.activeProfileFile, 'utf8')
    spawn.mockReset()
    spawn.mockImplementationOnce(() => failedPnpmInstall('ERR_PNPM_OUTDATED_LOCKFILE'))

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths: existingPaths,
      generation: 'outdated-replacement-generation',
    })).rejects.toThrow(/pnpm install failed with 1: ERR_PNPM_OUTDATED_LOCKFILE/u)

    expect(readFileSync(existingPaths.activeProfileFile, 'utf8')).toBe(pointerBefore)
    await expect(readActiveProfile(existingPaths)).resolves.toMatchObject({ generation: 'stable-generation', profileDir: stable.profileDir })
    expect(existsSync(generationProfileDir(existingPaths, 'outdated-replacement-generation'))).toBe(false)
    expect(readdirSync(existingPaths.stagingDir)).toEqual([])
  })

  it('fails closed before activation when an installer tampers with an owned host file', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('tamper-stage')

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'tampered-generation',
      install: async (stage) => { writeFileSync(join(stage, HOST_DIR_NAME, 'host', 'index.js'), 'tampered\n') },
    })).rejects.toThrow(/changed an owned file during install/u)

    await expect(readActiveProfile(paths)).resolves.toBeNull()
    expect(existsSync(generationProfileDir(paths, 'tampered-generation'))).toBe(false)
  })

  it('rejects reuse of a generation name rather than overwriting an activated profile', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('duplicate')
    const first = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'only-generation', install: installProfileFixture,
    })

    await expect(materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'only-generation', install: async () => {},
    })).rejects.toThrow(/already exists/u)
    await expect(readActiveProfile(paths)).resolves.toMatchObject({ generation: 'only-generation', profileDir: first.profileDir })
  })

  it('rejects post-activation owned-file drift before a host can use the pointer', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('tamper-active')
    const result = await materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'active-generation', install: installProfileFixture,
    })
    writeFileSync(join(result.profileDir, HOST_DIR_NAME, 'host', 'index.js'), 'drifted\n')

    await expect(readActiveProfile(paths)).rejects.toThrow(/checksum does not match receipt/u)
  })

  it('keeps the previous pointer when installed artifacts fail attestation', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('attestation-failure')
    const stable = await materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'stable-generation',
      install: installProfileFixture,
    })
    const pointerBefore = readFileSync(paths.activeProfileFile, 'utf8')
    let rejectedStage = ''

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'unsafe-generation',
      install: async (stage) => {
        rejectedStage = stage
        await installProfileFixture(stage)
        symlinkSync('../package.json', join(stage, 'node_modules/unsafe'))
      },
    })).rejects.toThrow(/symlink escapes node_modules/u)

    expect(readFileSync(paths.activeProfileFile, 'utf8')).toBe(pointerBefore)
    await expect(readActiveProfile(paths)).resolves.toMatchObject({
      generation: 'stable-generation',
      profileDir: stable.profileDir,
    })
    expect(existsSync(generationProfileDir(paths, 'unsafe-generation'))).toBe(false)
    expect(existsSync(rejectedStage)).toBe(false)
    expect(readdirSync(paths.stagingDir)).toEqual([])
  })

  it('rolls back after attestation succeeds when the final receipt cannot be written', async () => {
    const shellRoot = stubShellRoot()
    const paths = testPaths('receipt-failure')
    const stable = await materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'stable-generation',
      install: installProfileFixture,
    })
    const pointerBefore = readFileSync(paths.activeProfileFile, 'utf8')
    let rejectedStage = ''

    await expect(materializeProfile({
      seedDir,
      shellRoot,
      repoRoot: shellRoot,
      paths,
      generation: 'receipt-failure-generation',
      install: async (stage) => {
        rejectedStage = stage
        await installProfileFixture(stage)
        mkdirSync(join(stage, PROFILE_MANIFEST_FILE))
      },
    })).rejects.toThrow(/profile-manifest\.json/u)

    expect(readFileSync(paths.activeProfileFile, 'utf8')).toBe(pointerBefore)
    await expect(readActiveProfile(paths)).resolves.toMatchObject({
      generation: 'stable-generation',
      profileDir: stable.profileDir,
    })
    expect(existsSync(generationProfileDir(paths, 'receipt-failure-generation'))).toBe(false)
    expect(existsSync(rejectedStage)).toBe(false)
    expect(readdirSync(paths.stagingDir)).toEqual([])
  })

  it('does not add a composed package to the profile manifest in P0-3', () => {
    const seed = {
      name: 'sage-shell-profile',
      dependencies: { '@deepseek-ai/dsh': '0.1.5-rc.2' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }

    const composed = composeProfileManifest(seed)

    expect(COMPOSED_PACKAGES).toEqual([])
    expect(composed).toEqual(seed)
  })

  it('fails before staging a generation when a seed file or built host module is missing', async () => {
    const paths = testPaths('missing')
    const shellRoot = stubShellRoot()
    await expect(materializeProfile({
      seedDir: join(seedDir, 'absent'), shellRoot, repoRoot: shellRoot, paths, generation: 'missing-seed', install: async () => {},
    })).rejects.toThrow(/^sage shell: missing seed file /u)
    expect(existsSync(generationProfileDir(paths, 'missing-seed'))).toBe(false)

    const missing = join(shellRoot, 'lib', HOST_LIB_FILES[0] as string)
    rmSync(missing)
    await expect(materializeProfile({
      seedDir, shellRoot, repoRoot: shellRoot, paths, generation: 'missing-host', install: async () => {},
    })).rejects.toThrow(/^sage shell: built host runtime is missing /u)
    expect(existsSync(generationProfileDir(paths, 'missing-host'))).toBe(false)
  })
})
