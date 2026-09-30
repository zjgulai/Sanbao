import { createHash } from 'node:crypto'
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  canonicalizeInstalledArtifactSet,
  computeInstalledArtifactSetDigest,
  computeRuntimeArtifactAttestationDigest,
  createRuntimeArtifactAttestation,
  inspectInstalledArtifactSet,
  verifyRuntimeArtifactAttestation,
  type InstalledArtifactSetV1,
  type RuntimeArtifactAttestationBodyV1,
} from '../src/profile/runtime-artifact-attestation.js'

const ATTESTATION_FILE = 'runtime-artifact-attestation.json'
const OWNED_PROFILE_DIGEST = `sha256:${'a'.repeat(64)}`
const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sra-${label.slice(0, 8)}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

function sha256(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function write(path: string, content: string, mode = 0o644): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, { mode })
  chmodSync(path, mode)
}

interface Fixture {
  readonly profileDir: string
  readonly packageFile: string
  readonly lockfile: string
  readonly executable: string
  readonly hardlinkSource: string
  readonly hardlinkAlias: string
  readonly safeLink: string
  readonly alternateLinkTarget: string
  readonly modulesMetadata: string
  readonly workspaceMetadata: string
}

function createProfileFixture(label: string, reverseCreationOrder = false): Fixture {
  const profileDir = temporary(label)
  const packageFile = join(profileDir, 'package.json')
  const lockfile = join(profileDir, 'pnpm-lock.yaml')
  const hardlinkSource = join(profileDir, 'node_modules/.pnpm/tool@1.0.0/node_modules/tool/index.js')
  const hardlinkAlias = join(profileDir, 'node_modules/tool-hardlink.js')
  const executable = join(profileDir, 'node_modules/.pnpm/tool@1.0.0/node_modules/tool/bin.js')
  const alternateLinkTarget = join(profileDir, 'node_modules/.pnpm/tool@1.0.0/node_modules/tool/alternate.js')
  const safeLink = join(profileDir, 'node_modules/.bin/tool')
  const modulesMetadata = join(profileDir, 'node_modules/.modules.yaml')
  const workspaceMetadata = join(profileDir, 'node_modules/.pnpm-workspace-state-v1.json')

  const rootFiles: readonly [string, string][] = [
    [packageFile, '{"name":"sage-attestation-fixture","version":"1.0.0"}\n'],
    [lockfile, 'lockfileVersion: 9.0\nsettings:\n  autoInstallPeers: true\n'],
  ]
  const installedFiles: readonly [string, string, number][] = [
    [hardlinkSource, 'export const value = "fixture"\n', 0o644],
    [executable, '#!/usr/bin/env node\nconsole.log("fixture")\n', 0o755],
    [alternateLinkTarget, 'export const alternate = true\n', 0o644],
    [join(profileDir, 'node_modules/.modules.yaml.bak'), 'portable-near-name\n', 0o644],
  ]

  for (const [path, content] of reverseCreationOrder ? [...rootFiles].reverse() : rootFiles) write(path, content)
  for (const [path, content, mode] of reverseCreationOrder ? [...installedFiles].reverse() : installedFiles) {
    write(path, content, mode)
  }

  linkSync(hardlinkSource, hardlinkAlias)
  mkdirSync(dirname(safeLink), { recursive: true })
  symlinkSync('../.pnpm/tool@1.0.0/node_modules/tool/bin.js', safeLink)
  write(modulesMetadata, 'storeDir: /Users/example/Library/pnpm/store/v10\nprunedAt: 2026-09-28T01:02:03.000Z\n')
  write(workspaceMetadata, '{"lastValidated":"2026-09-28T01:02:03.000Z"}\n')

  return {
    profileDir,
    packageFile,
    lockfile,
    executable,
    hardlinkSource,
    hardlinkAlias,
    safeLink,
    alternateLinkTarget,
    modulesMetadata,
    workspaceMetadata,
  }
}

async function attest(fixture: Fixture, generation = 'fixture-generation') {
  return createRuntimeArtifactAttestation({
    profileDir: fixture.profileDir,
    generation,
    ownedProfileDigest: OWNED_PROFILE_DIGEST,
  })
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('runtime artifact attestation canonical contract', () => {
  it('canonicalizes a portable InstalledArtifactSetV1 without mutating caller input', () => {
    const set: InstalledArtifactSetV1 = {
      schemaVersion: 'sage.installed-artifact-set.v1',
      canonicalizationVersion: 'sage.runtime-artifact-attestation-canonical-json.v1',
      rootPackage: { path: 'package.json', sha256: `sha256:${'1'.repeat(64)}` },
      rootLockfile: { path: 'pnpm-lock.yaml', sha256: `sha256:${'2'.repeat(64)}` },
      entries: [
        { kind: 'symlink', path: 'node_modules/z-link', target: '.pnpm/z@1/node_modules/z/index.js' },
        { kind: 'file', path: 'node_modules/a.js', sha256: `sha256:${'3'.repeat(64)}`, executable: false },
      ],
    }
    const before = structuredClone(set)

    const canonical = canonicalizeInstalledArtifactSet(set)

    expect(canonical).toBe(`{"schemaVersion":"sage.installed-artifact-set.v1","canonicalizationVersion":"sage.runtime-artifact-attestation-canonical-json.v1","rootPackage":{"path":"package.json","sha256":"sha256:${'1'.repeat(64)}"},"rootLockfile":{"path":"pnpm-lock.yaml","sha256":"sha256:${'2'.repeat(64)}"},"entries":[{"kind":"file","path":"node_modules/a.js","sha256":"sha256:${'3'.repeat(64)}","executable":false},{"kind":"symlink","path":"node_modules/z-link","target":".pnpm/z@1/node_modules/z/index.js"}]}`)
    expect(set).toEqual(before)
    expect(computeInstalledArtifactSetDigest(set)).toBe(sha256(canonical))
  })

  it('inspects file bytes, executable bits, logical hardlink paths, and safe symlink topology only', async () => {
    const fixture = createProfileFixture('portable')

    const inspection = await inspectInstalledArtifactSet(fixture.profileDir)

    expect(inspection.artifactSet).toMatchObject({
      schemaVersion: 'sage.installed-artifact-set.v1',
      canonicalizationVersion: 'sage.runtime-artifact-attestation-canonical-json.v1',
      rootPackage: { path: 'package.json', sha256: sha256(readFileSync(fixture.packageFile, 'utf8')) },
      rootLockfile: { path: 'pnpm-lock.yaml', sha256: sha256(readFileSync(fixture.lockfile, 'utf8')) },
    })
    expect(inspection.artifactSetDigest).toBe(computeInstalledArtifactSetDigest(inspection.artifactSet))
    expect(inspection.artifactSetDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(inspection.installerMetadataDigest).toMatch(/^sha256:[0-9a-f]{64}$/u)

    const rowsByPath = new Map(inspection.artifactSet.entries.map(row => [row.path, row]))
    expect(rowsByPath.get('node_modules/.pnpm/tool@1.0.0/node_modules/tool/bin.js')).toMatchObject({
      kind: 'file', executable: true,
    })
    const source = rowsByPath.get('node_modules/.pnpm/tool@1.0.0/node_modules/tool/index.js')
    const alias = rowsByPath.get('node_modules/tool-hardlink.js')
    expect(source).toMatchObject({ kind: 'file', executable: false })
    expect(alias).toMatchObject({ kind: 'file', executable: false })
    expect(source).toHaveProperty('sha256', alias && 'sha256' in alias ? alias.sha256 : undefined)
    expect(rowsByPath.get('node_modules/.bin/tool')).toEqual({
      kind: 'symlink',
      path: 'node_modules/.bin/tool',
      target: '../.pnpm/tool@1.0.0/node_modules/tool/bin.js',
    })
    expect(rowsByPath.has('node_modules/.modules.yaml')).toBe(false)
    expect(rowsByPath.has('node_modules/.pnpm-workspace-state-v1.json')).toBe(false)
    expect(rowsByPath.has('node_modules/.modules.yaml.bak')).toBe(true)
    expect(inspection.artifactSet.entries.some(row => row.kind === ('directory' as never))).toBe(false)
    expect(canonicalizeInstalledArtifactSet(inspection.artifactSet)).not.toContain('/Users/example/')
  })

  it('is deterministic across scans and filesystem creation order', async () => {
    const forward = createProfileFixture('forward')
    const reverse = createProfileFixture('reverse', true)

    const first = await inspectInstalledArtifactSet(forward.profileDir)
    const repeated = await inspectInstalledArtifactSet(forward.profileDir)
    const equivalent = await inspectInstalledArtifactSet(reverse.profileDir)

    expect(repeated).toEqual(first)
    expect(equivalent).toEqual(first)
  })

  it('keeps exact machine metadata outside the portable subject while binding it separately', async () => {
    const fixture = createProfileFixture('metadata')
    const before = await inspectInstalledArtifactSet(fixture.profileDir)

    write(fixture.modulesMetadata, 'storeDir: /different/machine/store\nprunedAt: 2026-09-29T00:00:00.000Z\n')
    write(fixture.workspaceMetadata, '{"lastValidated":"2026-09-29T00:00:00.000Z"}\n')
    const after = await inspectInstalledArtifactSet(fixture.profileDir)

    expect(after.artifactSet).toEqual(before.artifactSet)
    expect(after.artifactSetDigest).toBe(before.artifactSetDigest)
    expect(after.installerMetadataDigest).not.toBe(before.installerMetadataDigest)
  })
})

describe('runtime artifact attestation lifecycle', () => {
  it('writes a 0600 sealed attestation, binds only approved evidence, and verifies a fresh scan', async () => {
    const fixture = createProfileFixture('create')
    const createdAttestation = await attest(fixture)
    const path = join(fixture.profileDir, ATTESTATION_FILE)
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const { artifactAttestationDigest: _digest, ...body } = createdAttestation

    expect(lstatSync(path).isFile()).toBe(true)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(persisted).toEqual(createdAttestation)
    expect(createdAttestation).toMatchObject({
      schemaVersion: 'sage.runtime-artifact-attestation.v1',
      canonicalizationVersion: 'sage.runtime-artifact-attestation-canonical-json.v1',
      producerContractVersion: 'sage.runtime-artifact-attestation-producer.v1',
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })
    expect(Object.keys(createdAttestation).sort()).toEqual([
      'artifactAttestationDigest',
      'artifactSetDigest',
      'canonicalizationVersion',
      'generation',
      'installerMetadataDigest',
      'ownedProfileDigest',
      'producerContractVersion',
      'schemaVersion',
    ])
    expect(createdAttestation.artifactAttestationDigest).toBe(
      computeRuntimeArtifactAttestationDigest(body as RuntimeArtifactAttestationBodyV1),
    )
    for (const forbidden of ['absolutePath', 'observedAt', 'provenance', 'registryApproval', 'compatibility', 'availability', 'executionAuthority']) {
      expect(persisted).not.toHaveProperty(forbidden)
    }
    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
      expectedArtifactAttestationDigest: createdAttestation.artifactAttestationDigest,
    })).resolves.toEqual(createdAttestation)
  })

  it('keeps portable content stable across generations but binds each generation into the attestation', async () => {
    const firstFixture = createProfileFixture('generation-one')
    const secondFixture = createProfileFixture('generation-two', true)

    const first = await attest(firstFixture, 'generation-one')
    const second = await attest(secondFixture, 'generation-two')

    expect(second.artifactSetDigest).toBe(first.artifactSetDigest)
    expect(second.installerMetadataDigest).toBe(first.installerMetadataDigest)
    expect(second.artifactAttestationDigest).not.toBe(first.artifactAttestationDigest)
  })

  it('fails fresh verification after package, lock, file, path, mode, link, or metadata drift', async () => {
    const cases = [
      ['root package bytes', (fixture: Fixture) => write(fixture.packageFile, '{"name":"drifted"}\n')],
      ['lockfile bytes', (fixture: Fixture) => write(fixture.lockfile, 'lockfileVersion: 9.0\nchanged: true\n')],
      ['installed file bytes through a hardlink', (fixture: Fixture) => write(fixture.hardlinkAlias, 'tampered through hardlink\n')],
      ['installed logical path', (fixture: Fixture) => renameSync(fixture.hardlinkAlias, `${fixture.hardlinkAlias}.moved`)],
      ['executable bit', (fixture: Fixture) => chmodSync(fixture.executable, 0o644)],
      ['safe symlink topology', (fixture: Fixture) => {
        unlinkSync(fixture.safeLink)
        symlinkSync('../.pnpm/tool@1.0.0/node_modules/tool/alternate.js', fixture.safeLink)
      }],
      ['installer metadata', (fixture: Fixture) => write(fixture.modulesMetadata, 'storeDir: /new/store\n')],
    ] as const

    for (const [label, mutate] of cases) {
      const fixture = createProfileFixture(`drift-${label.replaceAll(' ', '-')}`)
      await attest(fixture)
      mutate(fixture)

      await expect(verifyRuntimeArtifactAttestation({
        profileDir: fixture.profileDir,
        generation: 'fixture-generation',
        ownedProfileDigest: OWNED_PROFILE_DIGEST,
      }), label).rejects.toThrow()
    }
  })

  it('fails closed for a mismatched expected digest and forged or unknown persisted shapes', async () => {
    const fixture = createProfileFixture('forgery')
    const valid = await attest(fixture)
    const path = join(fixture.profileDir, ATTESTATION_FILE)

    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
      expectedArtifactAttestationDigest: `sha256:${'f'.repeat(64)}`,
    })).rejects.toMatchObject({ code: 'artifact-attestation-digest-mismatch' })

    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'other-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })).rejects.toMatchObject({ code: 'generation-binding-mismatch' })

    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: `sha256:${'b'.repeat(64)}`,
    })).rejects.toMatchObject({ code: 'owned-profile-binding-mismatch' })

    chmodSync(path, 0o644)
    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })).rejects.toMatchObject({ code: 'artifact-attestation-invalid' })
    chmodSync(path, 0o600)

    writeFileSync(path, `${JSON.stringify({
      ...valid,
      artifactAttestationDigest: `sha256:${'0'.repeat(64)}`,
    }, null, 2)}\n`)
    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })).rejects.toMatchObject({ code: 'artifact-attestation-digest-mismatch' })

    writeFileSync(path, `${JSON.stringify({ ...valid, compatibility: 'equivalent' }, null, 2)}\n`)
    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })).rejects.toMatchObject({ code: 'artifact-attestation-invalid' })

    writeFileSync(path, '{not-json\n')
    await expect(verifyRuntimeArtifactAttestation({
      profileDir: fixture.profileDir,
      generation: 'fixture-generation',
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })).rejects.toMatchObject({ code: 'artifact-attestation-invalid' })
  })
})

describe('runtime artifact attestation filesystem boundary', () => {
  it('rejects absolute, escaping, dangling, and cyclic symlinks before producing evidence', async () => {
    const cases = [
      ['absolute', (fixture: Fixture) => symlinkSync(fixture.executable, join(fixture.profileDir, 'node_modules/unsafe'))],
      ['escape', (fixture: Fixture) => symlinkSync('../package.json', join(fixture.profileDir, 'node_modules/unsafe'))],
      ['dangling', (fixture: Fixture) => symlinkSync('.pnpm/missing/index.js', join(fixture.profileDir, 'node_modules/unsafe'))],
      ['cycle', (fixture: Fixture) => {
        symlinkSync('unsafe-b', join(fixture.profileDir, 'node_modules/unsafe'))
        symlinkSync('unsafe', join(fixture.profileDir, 'node_modules/unsafe-b'))
      }],
    ] as const

    for (const [label, addUnsafeLink] of cases) {
      const fixture = createProfileFixture(`unsafe-link-${label}`)
      addUnsafeLink(fixture)
      await expect(inspectInstalledArtifactSet(fixture.profileDir), label).rejects.toThrow()
    }
  })

  it.skipIf(process.platform === 'win32')('rejects special filesystem nodes', async () => {
    const fixture = createProfileFixture('special-node')
    const socketPath = join(fixture.profileDir, 'node_modules/runtime.sock')
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
    try {
      await expect(inspectInstalledArtifactSet(fixture.profileDir)).rejects.toThrow()
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
