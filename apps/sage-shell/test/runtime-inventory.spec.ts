import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as profilePaths from '../src/profile/paths.js'
import * as runtimeArtifactAttestation from '../src/profile/runtime-artifact-attestation.js'
import {
  canonicalizeHostLiveInventoryProjection,
  computeHostLiveInventoryProjectionDigest,
  createHostLiveInventoryProjectionProvider,
  type HostLiveInventorySnapshot,
} from '../src/main/runtime-inventory.js'
import {
  PROFILE_MANIFEST_FILE,
  ensureSageDirectories,
  generationProfileDir,
  resolveSagePaths,
  type SagePaths,
} from '../src/profile/paths.js'
import {
  RUNTIME_ARTIFACT_ATTESTATION_FILE,
  createRuntimeArtifactAttestation,
  type RuntimeArtifactAttestationV1,
} from '../src/profile/runtime-artifact-attestation.js'

const OWNED_PROFILE_DIGEST = `sha256:${'a'.repeat(64)}`
const OBSERVED_AT = '2026-09-28T10:00:00.000Z'
const BOOT_ID = 'sage-host:11111111-1111-4111-8111-111111111111'
const GOLDEN_PROJECTION_CANONICAL = '{"schemaVersion":"sage.host-live-inventory-projection.v1","canonicalizationVersion":"sage.host-live-inventory-projection-canonical-json.v1","bootId":"sage-host:11111111-1111-4111-8111-111111111111","runtimeGeneration":7,"activeGeneration":"available-generation","manifestSha256":"4ae54e6de609b169b6606d66e450c0eedfec533e04955b77bf5f005c4f120d8c","loaderPhase":"active","hostProtocolVersion":"4","harnessVersion":"0.1.5-rc.2","ownedProfileDigest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","artifactSetDigest":"sha256:651b1d68a8100af294b8c4ba87fb1fb0e23052c6807e94521a13abb0618a1830","installerMetadataDigest":"sha256:30c8d2783ad5dc230db30d328df67a36d2dcde7accc94b389acf2c3eea20e9f3","artifactAttestationDigest":"sha256:f7f25298e1b1d67470669a9272ccb1e840799efeecdcf36e8a044ac07cc511a9","observedAt":"2026-09-28T10:00:00.000Z","expiresAt":"2026-09-28T10:00:30.000Z"}'
const GOLDEN_PROJECTION_DIGEST = 'sha256:6e857fc8b61ea9a82cebc685847191a3da591dffc25840cd0cdc54211d0f03e1'
const created: string[] = []

function temporary(label: string): string {
  const path = join(tmpdir(), `sage-runtime-inventory-${label}-${String(created.length)}-${String(Date.now())}`)
  created.push(path)
  return path
}

function rawSha256(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex')
}

interface ActiveFixture {
  readonly paths: SagePaths
  readonly generation: string
  readonly profileDir: string
  readonly manifestSha256: string
  readonly attestation?: RuntimeArtifactAttestationV1
}

async function activeFixture(
  label: string,
  options: { readonly includeAttestation?: boolean; readonly attestationMode?: number } = {},
): Promise<ActiveFixture> {
  const paths = resolveSagePaths({ home: temporary(`${label}-home`), root: temporary(`${label}-root`) })
  await ensureSageDirectories(paths)
  const generation = `${label}-generation`
  const profileDir = generationProfileDir(paths, generation)
  mkdirSync(join(profileDir, 'node_modules', 'fixture'), { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n')
  writeFileSync(join(profileDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(profileDir, 'node_modules', 'fixture', 'index.js'), 'export const fixture = true\n')

  const includeAttestation = options.includeAttestation ?? true
  const attestation = includeAttestation
    ? await createRuntimeArtifactAttestation({ profileDir, generation, ownedProfileDigest: OWNED_PROFILE_DIGEST })
    : undefined
  if (attestation !== undefined && options.attestationMode !== undefined) {
    chmodSync(join(profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE), options.attestationMode)
  }
  const receiptPath = attestation === undefined ? 'package.json' : RUNTIME_ARTIFACT_ATTESTATION_FILE
  const receiptBytes = readFileSync(join(profileDir, receiptPath))
  const receipt = `${JSON.stringify({
    schemaVersion: 1,
    generation,
    files: [{ path: receiptPath, sha256: rawSha256(receiptBytes) }],
  }, null, 2)}\n`
  writeFileSync(join(profileDir, PROFILE_MANIFEST_FILE), receipt)
  const manifestSha256 = rawSha256(receipt)
  writeFileSync(paths.activeProfileFile, `${JSON.stringify({
    schemaVersion: 1,
    generation,
    manifestSha256,
    activatedAt: '2026-09-28T09:59:00.000Z',
  }, null, 2)}\n`)
  return {
    paths,
    generation,
    profileDir,
    manifestSha256,
    ...(attestation === undefined ? {} : { attestation }),
  }
}

function activeSnapshot(fixture: ActiveFixture): HostLiveInventorySnapshot {
  return Object.freeze({
    kind: 'active',
    bootId: BOOT_ID,
    runtimeGeneration: 7,
    activeGeneration: fixture.generation,
    manifestSha256: fixture.manifestSha256,
    loaderPhase: 'active',
    hostProtocolVersion: '4',
    harnessVersion: '0.1.5-rc.2',
  })
}

function sequence<T>(values: readonly T[]): () => T {
  let index = 0
  return () => values[Math.min(index++, values.length - 1)] as T
}

afterEach(() => {
  vi.restoreAllMocks()
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true })
})

describe('WT-02C.2B Host live inventory projection', () => {
  it('projects one exact canonical, receipt-sealed and freshly verified 30-second observation', async () => {
    const fixture = await activeFixture('available')
    const snapshot = activeSnapshot(fixture)
    const host = { readSnapshot: vi.fn(() => snapshot) }
    const clock = { now: vi.fn(() => OBSERVED_AT) }
    const provider = createHostLiveInventoryProjectionProvider({ paths: fixture.paths, host, clock })

    const result = await provider.read()

    expect(result).toEqual({
      kind: 'available',
      projection: {
        schemaVersion: 'sage.host-live-inventory-projection.v1',
        canonicalizationVersion: 'sage.host-live-inventory-projection-canonical-json.v1',
        bootId: BOOT_ID,
        runtimeGeneration: 7,
        activeGeneration: fixture.generation,
        manifestSha256: fixture.manifestSha256,
        loaderPhase: 'active',
        hostProtocolVersion: '4',
        harnessVersion: '0.1.5-rc.2',
        ownedProfileDigest: fixture.attestation?.ownedProfileDigest,
        artifactSetDigest: fixture.attestation?.artifactSetDigest,
        installerMetadataDigest: fixture.attestation?.installerMetadataDigest,
        artifactAttestationDigest: fixture.attestation?.artifactAttestationDigest,
        observedAt: OBSERVED_AT,
        expiresAt: '2026-09-28T10:00:30.000Z',
        projectionDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    })
    if (result.kind !== 'available') throw new Error('expected available projection')
    const { projectionDigest, ...body } = result.projection
    expect(canonicalizeHostLiveInventoryProjection(body)).toBe(JSON.stringify({
      schemaVersion: 'sage.host-live-inventory-projection.v1',
      canonicalizationVersion: 'sage.host-live-inventory-projection-canonical-json.v1',
      bootId: BOOT_ID,
      runtimeGeneration: 7,
      activeGeneration: fixture.generation,
      manifestSha256: fixture.manifestSha256,
      loaderPhase: 'active',
      hostProtocolVersion: '4',
      harnessVersion: '0.1.5-rc.2',
      ownedProfileDigest: fixture.attestation?.ownedProfileDigest,
      artifactSetDigest: fixture.attestation?.artifactSetDigest,
      installerMetadataDigest: fixture.attestation?.installerMetadataDigest,
      artifactAttestationDigest: fixture.attestation?.artifactAttestationDigest,
      observedAt: OBSERVED_AT,
      expiresAt: '2026-09-28T10:00:30.000Z',
    }))
    expect(computeHostLiveInventoryProjectionDigest(body)).toBe(projectionDigest)
    expect(canonicalizeHostLiveInventoryProjection(body)).toBe(GOLDEN_PROJECTION_CANONICAL)
    expect(projectionDigest).toBe(GOLDEN_PROJECTION_DIGEST)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.projection)).toBe(true)
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(host.readSnapshot).toHaveBeenCalledTimes(2)
    expect(clock.now).toHaveBeenCalledTimes(1)
  })

  it('maps not-ready and invalidated Host snapshots to distinct fixed failures without touching profile or clock', async () => {
    for (const [reason, code] of [
      ['not-ready', 'host-not-active'],
      ['invalidated', 'host-runtime-invalidated'],
      ['fatal', 'host-runtime-invalidated'],
    ] as const) {
      const fixture = await activeFixture(`host-${reason}`)
      const clock = { now: vi.fn(() => OBSERVED_AT) }
      const provider = createHostLiveInventoryProjectionProvider({
        paths: fixture.paths,
        host: { readSnapshot: () => Object.freeze({ kind: 'unavailable', bootId: BOOT_ID, runtimeGeneration: 2, reason }) },
        clock,
      })

      await expect(provider.read()).resolves.toMatchObject({ kind: 'unavailable', code })
      expect(clock.now).not.toHaveBeenCalled()
    }
  })

  it('fails closed when there is no verified active profile or the Host profile binding is different', async () => {
    const missing = resolveSagePaths({ home: temporary('missing-home'), root: temporary('missing-root') })
    await ensureSageDirectories(missing)
    const clock = { now: vi.fn(() => OBSERVED_AT) }
    const missingProvider = createHostLiveInventoryProjectionProvider({
      paths: missing,
      host: { readSnapshot: () => Object.freeze({
        kind: 'active', bootId: 'sage-host:22222222-2222-4222-8222-222222222222', runtimeGeneration: 1,
        activeGeneration: 'missing-generation', manifestSha256: '1'.repeat(64), loaderPhase: 'active',
        hostProtocolVersion: '4', harnessVersion: '1.0.0',
      }) },
      clock,
    })
    await expect(missingProvider.read()).resolves.toMatchObject({ kind: 'unavailable', code: 'active-profile-unavailable' })

    const fixture = await activeFixture('mismatch')
    const mismatchProvider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => Object.freeze({ ...activeSnapshot(fixture), manifestSha256: '2'.repeat(64) }) },
      clock,
    })
    await expect(mismatchProvider.read()).resolves.toMatchObject({ kind: 'unavailable', code: 'host-profile-mismatch' })
    expect(clock.now).not.toHaveBeenCalled()
  })

  it('keeps old profiles readable but never backfills an absent artifact attestation', async () => {
    const fixture = await activeFixture('legacy', { includeAttestation: false })
    const pointerBefore = readFileSync(fixture.paths.activeProfileFile, 'utf8')
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock: { now: () => OBSERVED_AT },
    })

    await expect(provider.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'artifact-attestation-missing',
      reason: 'The active Sage profile has no sealed runtime artifact attestation.',
    })
    expect(readFileSync(fixture.paths.activeProfileFile, 'utf8')).toBe(pointerBefore)
    expect(existsSync(join(fixture.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE))).toBe(false)
  })

  it('rejects an attestation that is present in the receipt but is not a sealed 0600 file', async () => {
    const fixture = await activeFixture('unsealed', { attestationMode: 0o644 })
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock: { now: vi.fn(() => OBSERVED_AT) },
    })

    await expect(provider.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'artifact-attestation-unsealed',
      reason: 'The runtime artifact attestation is not sealed by the active profile receipt.',
    })
  })

  it('binds the sealed attestation bytes to the receipt SHA before trusting its inner digests', async () => {
    const fixture = await activeFixture('receipt-binding')
    const readActiveProfile = profilePaths.readActiveProfile
    vi.spyOn(profilePaths, 'readActiveProfile').mockImplementationOnce(async paths => {
      const active = await readActiveProfile(paths)
      writeFileSync(
        join(fixture.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE),
        `${readFileSync(join(fixture.profileDir, RUNTIME_ARTIFACT_ATTESTATION_FILE), 'utf8')} `,
      )
      return active
    })
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock: { now: vi.fn(() => OBSERVED_AT) },
    })

    await expect(provider.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'artifact-attestation-unsealed',
      reason: 'The runtime artifact attestation is not sealed by the active profile receipt.',
    })
  })

  it('runs a fresh artifact scan and maps installed-tree drift to a non-leaking invalid result', async () => {
    const fixture = await activeFixture('artifact-drift')
    writeFileSync(join(fixture.profileDir, 'node_modules', 'fixture', 'index.js'), 'secret-drift\n')
    const clock = { now: vi.fn(() => OBSERVED_AT) }
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock,
    })

    const result = await provider.read()
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'artifact-attestation-invalid',
      reason: 'The installed runtime artifacts do not match their sealed attestation.',
    })
    expect(JSON.stringify(result)).not.toContain('secret-drift')
    expect(JSON.stringify(result)).not.toContain(fixture.profileDir)
    expect(clock.now).not.toHaveBeenCalled()
  })

  it('invalidates an observation when Host boot/runtime changes or its profile changes before Host B', async () => {
    const fixture = await activeFixture('host-change')
    const first = activeSnapshot(fixture)
    const changedRuntime = Object.freeze({ ...first, runtimeGeneration: first.runtimeGeneration + 1 })
    const changedProfile = Object.freeze({ ...first, activeGeneration: 'different-generation' })
    const changedHarness = Object.freeze({ ...first, harnessVersion: 'different-version' })

    for (const [second, code] of [
      [changedRuntime, 'host-runtime-invalidated'],
      [changedProfile, 'active-profile-changed'],
      [changedHarness, 'host-runtime-invalidated'],
    ] as const) {
      const clock = { now: vi.fn(() => OBSERVED_AT) }
      const provider = createHostLiveInventoryProjectionProvider({
        paths: fixture.paths,
        host: { readSnapshot: sequence([first, second]) },
        clock,
      })
      await expect(provider.read()).resolves.toMatchObject({ kind: 'unavailable', code })
      expect(clock.now).not.toHaveBeenCalled()
    }
  })

  it('invalidates an observation when the active profile pointer changes between profile A and B', async () => {
    const fixture = await activeFixture('profile-change')
    const verifyAttestation = runtimeArtifactAttestation.verifyRuntimeArtifactAttestation
    vi.spyOn(runtimeArtifactAttestation, 'verifyRuntimeArtifactAttestation').mockImplementationOnce(async input => {
      const verified = await verifyAttestation(input)
      writeFileSync(fixture.paths.activeProfileFile, `${JSON.stringify({
        schemaVersion: 1,
        generation: fixture.generation,
        manifestSha256: fixture.manifestSha256,
        activatedAt: '2026-09-28T10:00:00.000Z',
      }, null, 2)}\n`)
      return verified
    })
    const clock = { now: vi.fn(() => OBSERVED_AT) }
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock,
    })

    await expect(provider.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'active-profile-changed',
      reason: 'The active Sage profile changed during observation.',
    })
    expect(clock.now).not.toHaveBeenCalled()
  })

  it('rejects hostile or malformed snapshots without invoking accessors', async () => {
    const fixture = await activeFixture('hostile')
    const getter = vi.fn(() => 'active')
    const hostile = Object.create(null) as Record<string, unknown>
    Object.defineProperty(hostile, 'kind', { enumerable: true, get: getter })
    const provider = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => hostile },
      clock: { now: vi.fn(() => OBSERVED_AT) },
    })

    await expect(provider.read()).resolves.toMatchObject({ kind: 'unavailable', code: 'host-runtime-invalidated' })
    expect(getter).not.toHaveBeenCalled()

    for (const snapshot of [
      Object.freeze({ ...activeSnapshot(fixture), bootId: 'boot:not-a-main-owned-id' }),
      Object.freeze({ ...activeSnapshot(fixture), hostProtocolVersion: '3' }),
    ]) {
      const malformedProvider = createHostLiveInventoryProjectionProvider({
        paths: fixture.paths,
        host: { readSnapshot: () => snapshot },
        clock: { now: vi.fn(() => OBSERVED_AT) },
      })
      await expect(malformedProvider.read()).resolves.toMatchObject({
        kind: 'unavailable',
        code: 'host-runtime-invalidated',
      })
    }
  })

  it('calls the clock last, rejects unavailable time, and rejects regression across reads', async () => {
    const fixture = await activeFixture('clock')
    const host = { readSnapshot: vi.fn(() => activeSnapshot(fixture)) }
    const unavailable = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host,
      clock: { now: vi.fn(() => { throw new Error('/secret/clock/socket') }) },
    })
    await expect(unavailable.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'clock-unavailable',
      reason: 'A trusted observation time is unavailable.',
    })
    expect(host.readSnapshot).toHaveBeenCalledTimes(2)

    const clock = { now: vi.fn(sequence([OBSERVED_AT, '2026-09-28T09:59:59.999Z'])) }
    const provider = createHostLiveInventoryProjectionProvider({ paths: fixture.paths, host: { readSnapshot: () => activeSnapshot(fixture) }, clock })
    await expect(provider.read()).resolves.toMatchObject({ kind: 'available' })
    await expect(provider.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'clock-regressed',
      reason: 'The trusted observation time moved backwards.',
    })

    const overflowing = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => activeSnapshot(fixture) },
      clock: { now: () => '+275760-09-13T00:00:00.000Z' },
    })
    await expect(overflowing.read()).resolves.toEqual({
      kind: 'unavailable',
      code: 'clock-unavailable',
      reason: 'A trusted observation time is unavailable.',
    })
  })

  it('is deterministic for unchanged inputs and never mutates caller-owned ports or snapshots', async () => {
    const fixture = await activeFixture('deterministic')
    const snapshot = activeSnapshot(fixture)
    const host = Object.freeze({ readSnapshot: () => snapshot })
    const clock = Object.freeze({ now: () => OBSERVED_AT })
    const provider = createHostLiveInventoryProjectionProvider({ paths: fixture.paths, host, clock })

    const first = await provider.read()
    const second = await provider.read()

    expect(second).toEqual(first)
    expect(Object.isFrozen(host)).toBe(true)
    expect(Object.isFrozen(clock)).toBe(true)
    expect(snapshot).toEqual(activeSnapshot(fixture))
  })
})
