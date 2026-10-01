import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_PROFILE_FILE,
  ORGANIZATION_POLICY_FILE,
  PROFILE_MANIFEST_FILE,
  ensureSageDirectories,
  ensureSageDirectoriesSync,
  generationProfileDir,
  readActiveProfile,
  resolveSagePaths,
} from '../src/profile/paths.js'

const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-profile-paths-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('Sage profile paths', () => {
  it('uses the macOS Sage root and keeps every runtime root beneath it', () => {
    const home = temporary('home')
    const paths = resolveSagePaths({ home, platform: 'darwin' })

    expect(paths.root).toBe(join(home, 'Library', 'Application Support', 'Sage'))
    expect(paths.electronUserDataDir).toBe(join(paths.root, 'electron', 'user-data'))
    expect(paths.sessionDataDir).toBe(join(paths.root, 'electron', 'session-data'))
    expect(paths.logsDir).toBe(join(paths.root, 'electron', 'logs'))
    expect(paths.crashDumpsDir).toBe(join(paths.root, 'electron', 'crash-dumps'))
    expect(paths.harnessHome).toBe(join(paths.root, 'harness'))
    expect(paths.profilesDir).toBe(join(paths.harnessHome, 'profiles'))
    expect(paths.generationsDir).toBe(join(paths.profilesDir, '.sage-generations'))
    expect(paths.stagingDir).toBe(join(paths.profilesDir, '.sage-staging'))
    expect(paths.activeProfileFile).toBe(join(paths.root, ACTIVE_PROFILE_FILE))
    expect(paths.organizationPolicyFile).toBe(join(paths.root, ORGANIZATION_POLICY_FILE))
  })

  it('rejects relative, legacy, and overlapping root overrides before it creates anything', () => {
    const home = temporary('home')
    expect(() => resolveSagePaths({ home, root: 'relative/sage' })).toThrow(/absolute path/u)
    expect(() => resolveSagePaths({ home, root: join(home, '.dsh') })).toThrow(/legacy/u)
    expect(() => resolveSagePaths({ home, root: join(home, '.dsh', 'nested') })).toThrow(/legacy/u)
    expect(() => resolveSagePaths({ home, root: home })).toThrow(/legacy/u)
    expect(existsSync(home)).toBe(false)
  })

  it('creates only the complete Sage-owned directory tree with the synchronous pre-ready primitive', () => {
    const root = temporary('root')
    const paths = resolveSagePaths({ home: temporary('home'), root })
    ensureSageDirectoriesSync(paths)

    for (const path of [
      paths.root,
      paths.electronUserDataDir,
      paths.sessionDataDir,
      paths.logsDir,
      paths.crashDumpsDir,
      paths.harnessHome,
      paths.profilesDir,
      paths.generationsDir,
      paths.stagingDir,
    ]) expect(existsSync(path), path).toBe(true)
    expect(existsSync(paths.activeProfileFile)).toBe(false)
  })

  it('rejects an existing Sage root that is redirected through a symlink', () => {
    const home = temporary('home')
    const target = temporary('target')
    const root = temporary('root-link')
    mkdirSync(target, { recursive: true })
    symlinkSync(target, root)
    const paths = resolveSagePaths({ home, root })

    expect(() => ensureSageDirectoriesSync(paths)).toThrow(/symlink/u)
  })

  it('rejects a symlinked parent before it can create a Sage root through that redirect', () => {
    const home = temporary('home')
    const target = temporary('target')
    const alias = temporary('parent-link')
    mkdirSync(target, { recursive: true })
    symlinkSync(target, alias)
    const paths = resolveSagePaths({ home, root: join(alias, 'Sage') })

    expect(() => ensureSageDirectoriesSync(paths)).toThrow(/symlink/u)
    expect(existsSync(join(target, 'Sage'))).toBe(false)
  })

  it('rejects a Sage root inside the physical target of a symlinked legacy root before writing', () => {
    const home = temporary('home')
    const physicalLegacyRoot = temporary('physical-legacy-root')
    const sageRoot = join(physicalLegacyRoot, 'sage-shadow')
    mkdirSync(home, { recursive: true })
    mkdirSync(physicalLegacyRoot, { recursive: true })
    symlinkSync(physicalLegacyRoot, join(home, '.dsh'))
    const paths = resolveSagePaths({ home, root: sageRoot })

    expect(() => ensureSageDirectoriesSync(paths)).toThrow(/legacy/u)
    expect(existsSync(sageRoot)).toBe(false)
  })

  it('treats a missing active pointer as not materialized and malformed pointers as failures', async () => {
    const root = temporary('root')
    const paths = resolveSagePaths({ home: temporary('home'), root })
    await ensureSageDirectories(paths)
    await expect(readActiveProfile(paths)).resolves.toBeNull()

    writeFileSync(paths.activeProfileFile, '{not-json\n')
    await expect(readActiveProfile(paths)).rejects.toThrow(/not valid JSON/u)
    expect(generationProfileDir(paths, 'first-generation')).toBe(join(paths.generationsDir, 'first-generation'))
    expect(() => generationProfileDir(paths, '../outside')).toThrow(/invalid profile generation/u)
  })

  it('keeps pre-attestation generations generally readable without inventing an attestation receipt row', async () => {
    const root = temporary('legacy-root')
    const paths = resolveSagePaths({ home: temporary('legacy-home'), root })
    await ensureSageDirectories(paths)
    const generation = 'legacy-generation'
    const profileDir = generationProfileDir(paths, generation)
    mkdirSync(profileDir, { recursive: true })
    const legacyBytes = 'legacy profile bytes\n'
    writeFileSync(join(profileDir, 'legacy.txt'), legacyBytes)
    const receipt = `${JSON.stringify({
      schemaVersion: 1,
      generation,
      files: [{ path: 'legacy.txt', sha256: createHash('sha256').update(legacyBytes).digest('hex') }],
    }, null, 2)}\n`
    writeFileSync(join(profileDir, PROFILE_MANIFEST_FILE), receipt)
    const manifestSha256 = createHash('sha256').update(receipt).digest('hex')
    writeFileSync(paths.activeProfileFile, `${JSON.stringify({
      schemaVersion: 1,
      generation,
      manifestSha256,
      activatedAt: '2026-09-28T00:00:00.000Z',
    }, null, 2)}\n`)

    const active = await readActiveProfile(paths)

    expect(active).toEqual({
      generation,
      profileDir,
      manifestSha256,
      activatedAt: '2026-09-28T00:00:00.000Z',
    })
    expect(active).not.toHaveProperty('runtimeArtifactAttestationSha256')
  })
})
