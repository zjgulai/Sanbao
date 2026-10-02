import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as profilePaths from '../src/profile/paths.js'
import {
  LOCAL_PATCH_FILE,
  ensureSageDirectories,
  resolveSagePaths,
  type SagePaths,
} from '../src/profile/paths.js'
import { overlayPath } from '../src/profile/layout.js'
import {
  createHostLiveInventoryProjectionProvider,
  type HostLiveInventorySnapshot,
} from '../src/main/runtime-inventory.js'
import {
  collectPmapEvidence,
  type PmapComponentEvidence,
} from '../src/main/runtime-inventory-pmap.js'
import { createRuntimeInventoryProvider } from '../src/main/runtime-inventory-provider.js'
import {
  computeInventoryEvidenceDigestV2,
  computeRuntimeDescriptorDigestV2,
  type RuntimeInventoryEvidenceBodyV2,
  type RuntimeDescriptorBodyV2,
} from '../src/security/compatibility.js'
import {
  ACTIVATED_AT,
  AGENT_MANIFEST,
  BASE_PATCH_LABEL,
  BOOT_ID,
  EXPIRES_AT,
  HARNESS_VERSION,
  OBSERVED_AT,
  OVERLAY_CONTENT,
  OWNED_PROFILE_DIGEST,
  PRESETS_MANIFEST,
  PROVIDER_MANIFEST,
  RUNTIME_GENERATION,
  SYSTEM_PRESET_BLOCK,
  USER_PRESET_BLOCK,
  ZETA_PATCH_LABEL,
  appendProfilePatch,
  approvedEntry,
  cleanupTemporaryRoots,
  composeFixture,
  composeProvider,
  composeWithPorts,
  contentDigest,
  materializeGeneration,
  presetInsertFile,
  realPorts,
  sealRegistry,
  sealedEmptyRegistry,
  sha256Hex,
  temporary,
  writePointer,
  type ComposeFixtureOptions,
} from './support/runtime-inventory-fixture.js'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupTemporaryRoots()
})

function urnHex(urn: string): string {
  const match = /^urn:sage:[a-z0-9-]+:sha256:([0-9a-f]{64})$/u.exec(urn)
  if (match === null) throw new Error(`not a Sage content-digest URN: ${urn}`)
  return match[1] as string
}

function expectedPmapSummary(rows: readonly PmapComponentEvidence[]): string {
  const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)
  const sorted = [...rows].sort((left, right) => {
    const byComponent = compare(left.component, right.component)
    if (byComponent !== 0) return byComponent
    const byIdentity = compare(left.identity ?? '', right.identity ?? '')
    return byIdentity !== 0 ? byIdentity : compare(left.provenance.source, right.provenance.source)
  })
  return contentDigest(JSON.stringify(sorted.map((row) => ({
    component: row.component,
    identity: row.identity ?? '',
    state: row.state,
    digest: `sha256:${urnHex(row.evidenceDigest)}`,
  }))))
}

describe('WT-02C.2E.2 RuntimeInventoryProvider composition', () => {
  it('composes a stable descriptor and full evidence from projection, PMAP, profile and registry', async () => {
    const fixture = await composeFixture('compose')
    const sealed = sealedEmptyRegistry()

    const directHostProjection = createHostLiveInventoryProjectionProvider({
      paths: fixture.paths,
      host: { readSnapshot: () => fixture.snapshot() },
      clock: { now: () => OBSERVED_AT },
    })
    const direct = await directHostProjection.read()
    if (direct.kind !== 'available') throw new Error('fixture projection must be available')

    const provider = composeProvider(fixture, () => sealed)
    const result = await provider.read()

    if (result.kind !== 'available') throw new Error(`expected available inventory, got ${result.code}`)
    const { descriptor, evidence } = result

    // Six components, field by field.
    expect(descriptor.host).toEqual({
      identity: 'host:sage-shell-host',
      version: '4.0.0',
      artifactDigest: fixture.attestation.artifactSetDigest,
      contractDigest: contentDigest(JSON.stringify({
        kind: 'sage.host-protocol-contract.v1',
        protocolVersion: 4,
        fdPairing: [3, 4],
        frameKinds: {
          request: ['start', 'data', 'end', 'cancel'],
          response: ['start', 'data', 'end', 'error'],
        },
        chunkBytes: 65536,
      })),
      behaviorConfigurationDigest: contentDigest(JSON.stringify({
        kind: 'sage.host-launch-policy.v1',
        argvPolicy: '[]',
        envPolicy: {
          electronRunAsNode: '1',
          dshHome: 'harness-home',
          ambientDshHome: 'dropped',
          nodeBinary: 'SAGE_NODE_BINARY ?? execPath',
          launchEnvironmentKey: 'launchEnvironment',
        },
        homeBinding: 'profile',
        loopback: 'oidc-callback-only',
      })),
    })
    expect(descriptor.harness).toEqual({
      identity: 'harness:@deepseek-ai/dsh',
      version: HARNESS_VERSION,
      artifactDigest: fixture.attestation.artifactSetDigest,
      contractDigest: contentDigest(JSON.stringify({
        kind: 'sage.harness-boot-contract.v1',
        label: 'sage shell',
        launchEnvironmentKey: 'launchEnvironment',
        cmdline: 'provided',
        connection: 'host-protocol-4',
      })),
      behaviorConfigurationDigest: contentDigest(JSON.stringify({
        kind: 'sage.shell-overlay-policy.v1',
        rootConfig: '# sage-shell composition root; the seed ships this file, the host rewrites it at every boot.\n[]\n',
        overlayPatch: contentDigest(OVERLAY_CONTENT),
        localPatch: null,
      })),
    })

    const providerArtifactHex = sha256Hex(JSON.stringify([
      { path: 'package.json', sha256: sha256Hex(JSON.stringify(PROVIDER_MANIFEST)) },
    ]))
    expect(descriptor.provider).toEqual({
      identity: 'provider:deepseek-official',
      version: '0.2.0-rc.2',
      artifactDigest: `sha256:${providerArtifactHex}`,
      contractDigest: contentDigest(JSON.stringify(PROVIDER_MANIFEST.exports)),
      behaviorConfigurationDigest: contentDigest(JSON.stringify({
        provider: 'deepseek-official',
        source: BASE_PATCH_LABEL,
      })),
    })
    expect(descriptor.model).toEqual({
      identity: 'model:deepseek-official/deepseek-chat',
      version: '0.2.0-rc.2',
      artifactDigest: `sha256:${providerArtifactHex}`,
      contractDigest: contentDigest(JSON.stringify(PROVIDER_MANIFEST.exports)),
      behaviorConfigurationDigest: contentDigest(JSON.stringify({
        model: 'deepseek-chat',
        reasoningEffort: 'high',
        source: BASE_PATCH_LABEL,
      })),
    })

    const agentArtifactHex = sha256Hex(JSON.stringify([
      { path: 'package.json', sha256: sha256Hex(JSON.stringify(AGENT_MANIFEST)) },
    ]))
    const rosterArtifactMembers = [
      {
        id: 'alpha',
        trust: 'user',
        artifactHex: sha256Hex(JSON.stringify([
          { path: `profile:cordis.patch.yml#preset-alpha`, sha256: sha256Hex(USER_PRESET_BLOCK) },
        ])),
      },
      {
        id: 'zeta',
        trust: 'system',
        artifactHex: sha256Hex(JSON.stringify([
          { path: `${ZETA_PATCH_LABEL}#preset-zeta`, sha256: sha256Hex(SYSTEM_PRESET_BLOCK) },
        ])),
      },
    ]
    const rosterContractMembers = [
      { id: 'alpha', trust: 'user', contractHex: sha256Hex(Buffer.from(USER_PRESET_BLOCK).toString('base64')) },
      { id: 'zeta', trust: 'system', contractHex: sha256Hex(Buffer.from(SYSTEM_PRESET_BLOCK).toString('base64')) },
    ]
    const rosterBehaviorDigest = contentDigest(JSON.stringify(rosterContractMembers))
    expect(descriptor.agent).toEqual({
      identity: 'agent:@deepseek-ai/dsh-agent',
      version: '0.2.0-rc.2',
      artifactDigest: `sha256:${agentArtifactHex}`,
      contractDigest: contentDigest(JSON.stringify(AGENT_MANIFEST.exports)),
      behaviorConfigurationDigest: rosterBehaviorDigest,
    })
    expect(descriptor.preset).toEqual({
      identity: 'preset:set',
      version: '0.2.0-rc.2',
      artifactDigest: contentDigest(JSON.stringify(rosterArtifactMembers)),
      contractDigest: contentDigest(JSON.stringify(PRESETS_MANIFEST.exports)),
      behaviorConfigurationDigest: rosterBehaviorDigest,
    })

    expect(descriptor.capabilities).toEqual([])
    expect(descriptor.protocolContractDigest).toBe(descriptor.host.contractDigest)
    expect(descriptor.launchPolicyDigest).toBe(descriptor.host.behaviorConfigurationDigest)
    expect(descriptor.overlayPolicyDigest).toBe(descriptor.harness.behaviorConfigurationDigest)

    // Evidence binds the descriptor, the projection window and the profile instance.
    expect(evidence.runtimeDescriptorDigest).toBe(descriptor.runtimeDescriptorDigest)
    expect(evidence.activeGeneration).toBe(fixture.generation)
    expect(evidence.receiptDigest).toBe(`sha256:${fixture.manifestSha256}`)
    expect(evidence.artifactAttestationDigest).toBe(fixture.attestation.artifactAttestationDigest)
    expect(evidence.registrySnapshotDigest).toBe(`sha256:${urnHex(sealed.snapshotId)}`)
    expect(evidence.bootId).toBe(direct.projection.bootId)
    expect(evidence.runtimeGeneration).toBe(RUNTIME_GENERATION)
    expect(evidence.observedAt).toBe(direct.projection.observedAt)
    expect(evidence.expiresAt).toBe(direct.projection.expiresAt)
    expect(evidence.observedAt).toBe(OBSERVED_AT)
    expect(evidence.expiresAt).toBe(EXPIRES_AT)

    // Seven provenance digests, each bound to its exact canonical document.
    expect(evidence.materializationInstanceDigest).toBe(contentDigest(JSON.stringify({
      kind: 'sage.materialization-instance.v1',
      activeGeneration: fixture.generation,
      receiptDigest: `sha256:${fixture.manifestSha256}`,
      activatedAt: ACTIVATED_AT,
    })))
    expect(evidence.instanceAuthorityDigest).toBe(contentDigest(JSON.stringify({
      kind: 'sage.instance-authority.v1',
      activeGeneration: fixture.generation,
      manifestSha256: fixture.manifestSha256,
      runtimeArtifactAttestationSha256: fixture.attestationSha256,
      artifactSetDigest: fixture.attestation.artifactSetDigest,
      ownedProfileDigest: OWNED_PROFILE_DIGEST,
    })))
    expect(evidence.healthObservationDigest).toBe(contentDigest(JSON.stringify({
      kind: 'sage.runtime-health-observation.v1',
      artifactAttestationDigest: fixture.attestation.artifactAttestationDigest,
      artifactSetDigest: fixture.attestation.artifactSetDigest,
      outcome: 'verified',
    })))
    expect(evidence.livenessObservationDigest).toBe(contentDigest(JSON.stringify({
      kind: 'sage.runtime-liveness-observation.v1',
      bootId: BOOT_ID,
      runtimeGeneration: RUNTIME_GENERATION,
      loaderPhase: 'active',
      observedAt: OBSERVED_AT,
      expiresAt: EXPIRES_AT,
    })))
    const rows = await collectPmapEvidence({
      profileDir: fixture.profileDir,
      fs: realPorts(),
      now: () => OBSERVED_AT,
    })
    expect(evidence.mainObservationProvenanceDigest).toBe(contentDigest(JSON.stringify({
      kind: 'sage.main-observation-provenance.v1',
      hostProjectionDigest: direct.projection.projectionDigest,
      pmapSummary: expectedPmapSummary(rows),
      registrySnapshotDigest: `sha256:${urnHex(sealed.snapshotId)}`,
    })))

    // The V2 producer contracts accept and re-derive both artifacts.
    const { runtimeDescriptorDigest, ...descriptorBody } = descriptor
    expect(runtimeDescriptorDigest).toMatch(/^urn:sage:runtime-descriptor:sha256:[0-9a-f]{64}$/u)
    expect(computeRuntimeDescriptorDigestV2(descriptorBody)).toBe(runtimeDescriptorDigest)
    const { inventoryEvidenceDigest, ...evidenceBody } = evidence
    expect(inventoryEvidenceDigest).toMatch(/^urn:sage:inventory-evidence:sha256:[0-9a-f]{64}$/u)
    expect(computeInventoryEvidenceDigestV2(evidenceBody)).toBe(inventoryEvidenceDigest)
    void (descriptorBody satisfies RuntimeDescriptorBodyV2)
    void (evidenceBody satisfies RuntimeInventoryEvidenceBodyV2)

    // Deterministic for unchanged inputs; every level is frozen.
    const second = await composeProvider(fixture, () => sealed).read()
    expect(second).toEqual(result)
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(descriptor)).toBe(true)
    expect(Object.isFrozen(descriptor.host)).toBe(true)
    expect(Object.isFrozen(descriptor.capabilities)).toBe(true)
    expect(Object.isFrozen(evidence)).toBe(true)
  })

  it('maps an approved verified registry entry into the runtime capability descriptor', async () => {
    const fixture = await composeFixture('capability')

    const result = await composeProvider(fixture, () => sealRegistry([approvedEntry()])).read()

    if (result.kind !== 'available') throw new Error(`expected available inventory, got ${result.code}`)
    expect(result.descriptor.capabilities).toEqual([{
      identity: 'capability:sage.demo-echo',
      version: '1.2.3',
      artifactDigest: `sha256:${'2'.repeat(64)}`,
      contractDigest: `sha256:${'4'.repeat(64)}`,
      behaviorConfigurationDigest: contentDigest(JSON.stringify({
        launchContractDigest: `sha256:${'3'.repeat(64)}`,
        operations: [{
          operationId: 'echo.call',
          adapter: { identity: 'adapter:sage.bridge', version: '1.0.0', digest: `sha256:${'6'.repeat(64)}` },
          effectClass: 'external-read',
          dataBoundary: 'network:external',
          inputContractDigest: `sha256:${'7'.repeat(64)}`,
          outputContractDigest: `sha256:${'8'.repeat(64)}`,
          preflight: 'read-only',
        }],
      })),
      registryDescriptorDigest: `sha256:${'1'.repeat(64)}`,
      adapterMappingDigest: contentDigest(JSON.stringify([{
        operationId: 'echo.call',
        adapter: { identity: 'adapter:sage.bridge', version: '1.0.0', digest: `sha256:${'6'.repeat(64)}` },
      }])),
    }])
    expect(Object.isFrozen(result.descriptor.capabilities[0])).toBe(true)
  })

  it('freezes policy-document and provenance digests with hand-written goldens', async () => {
    const fixture = await composeFixture('compose')
    const result = await composeProvider(fixture, () => sealedEmptyRegistry()).read()
    if (result.kind !== 'available') throw new Error(`expected available inventory, got ${result.code}`)

    // Four top-level policy documents (canonical forms verified independently of the module).
    expect(result.descriptor.protocolContractDigest)
      .toBe('sha256:f6f6dbcf3a40f4f4d32d36fa8ed50e8fae2ca36e9a3a4737a603aa187bdd6c1d')
    expect(result.descriptor.launchPolicyDigest)
      .toBe('sha256:f6367b27c9b5cee27bd3e51da93e1bd500b661f50623e9eef1fa4794f8fe9460')
    expect(result.descriptor.overlayPolicyDigest)
      .toBe('sha256:8f51e026ecb035edd8632fca694fd041b1115695c181afc254f65a842be59f70')
    expect(result.descriptor.harness.contractDigest)
      .toBe('sha256:1fce4c637ec37454da760122f9f97b54979d5930d49787a7e50b7e776772c269')

    // Seven provenance digests of the full evidence (re-anchored from the real producer,
    // 2026-10-02, WT-02C.2E-PMAP.1 row/layer model + preset-registry rename).
    expect(result.evidence.receiptDigest)
      .toBe('sha256:651d9fc4f60b74295e662dad18486bd94a256f167c1f958460a1194f08c2c1c9')
    expect(result.evidence.materializationInstanceDigest)
      .toBe('sha256:a764add1b99bc14f3af94847b540dd14c2e1b0517e17dcb79bd03fd58b5cddb9')
    expect(result.evidence.instanceAuthorityDigest)
      .toBe('sha256:f89a0aa2f9c988c289db5da1d187845f2b47d774a9364bf2e6e2f275fe297dc1')
    expect(result.evidence.mainObservationProvenanceDigest)
      .toBe('sha256:95fe94ac248ccdd2714f0d946a1832c9c00a7e1d56fa6515b8da9e3eaf2f9f1b')
    expect(result.evidence.healthObservationDigest)
      .toBe('sha256:b8e770a07c0c6b8289c571c040ac4f1f792f144530c59a47b0ca6e5903a2caba')
    expect(result.evidence.livenessObservationDigest)
      .toBe('sha256:4dc75ed73e8cd2a1d17ecf68852a244cd889b5435ffcaf8286fb16ba2c6d82ec')
    expect(result.evidence.registrySnapshotDigest)
      .toBe('sha256:9f79f90059ba7b4b817b6ff635056c194b75021093740dc6b22518d289eddd5e')

    // The stable pair itself is frozen: any silent field change breaks these literals.
    expect(result.descriptor.runtimeDescriptorDigest)
      .toBe('urn:sage:runtime-descriptor:sha256:80f051cff4f236535b910657e025cc604e61987bf6c4e18f06eee306764511be')
    expect(result.evidence.inventoryEvidenceDigest)
      .toBe('urn:sage:inventory-evidence:sha256:126e98533ffd76191370d3afc51423ae92046413eed87eb426750af281343296')
  })
})

describe('WT-02C.2E.2 failure and adversarial layer', () => {
  it('maps every C2B projection failure to host-projection-unavailable with its original code', async () => {
    const fixture = await composeFixture('projection-fail')
    const cases: ReadonlyArray<{ readonly label: string; readonly snapshot: HostLiveInventorySnapshot; readonly c2bCode: string }> = [
      {
        label: 'not ready',
        snapshot: Object.freeze({ kind: 'unavailable', bootId: BOOT_ID, runtimeGeneration: 1, reason: 'not-ready' }),
        c2bCode: 'host-not-active',
      },
      {
        label: 'stopped',
        snapshot: Object.freeze({ kind: 'unavailable', bootId: BOOT_ID, runtimeGeneration: 1, reason: 'stopped' }),
        c2bCode: 'host-runtime-invalidated',
      },
      {
        label: 'profile mismatch',
        snapshot: Object.freeze({
          kind: 'active', bootId: BOOT_ID, runtimeGeneration: 1, activeGeneration: 'other-generation',
          manifestSha256: '1'.repeat(64), loaderPhase: 'active', hostProtocolVersion: '4', harnessVersion: '1.0.0',
        }),
        c2bCode: 'host-profile-mismatch',
      },
    ]
    for (const testCase of cases) {
      const result = await composeWithPorts(fixture, { snapshot: testCase.snapshot }).read()
      expect(result, testCase.label).toMatchObject({ kind: 'unavailable', code: 'host-projection-unavailable' })
      if (result.kind === 'unavailable') {
        expect(result.reason, testCase.label).toContain(`(${testCase.c2bCode})`)
        expect(result.reason, testCase.label).not.toContain(fixture.profileDir)
      }
    }
  })

  it('maps a missing active profile and an unavailable clock through their projection codes', async () => {
    const missingPaths = resolveSagePaths({ home: temporary('no-profile-home'), root: temporary('no-profile-root') })
    await ensureSageDirectories(missingPaths)
    const missing = createRuntimeInventoryProvider({
      paths: missingPaths,
      hostProjection: createHostLiveInventoryProjectionProvider({
        paths: missingPaths,
        host: {
          readSnapshot: () => Object.freeze({
            kind: 'active' as const, bootId: BOOT_ID, runtimeGeneration: 1, activeGeneration: 'missing-generation',
            manifestSha256: '1'.repeat(64), loaderPhase: 'active' as const, hostProtocolVersion: '4' as const,
            harnessVersion: '1.0.0',
          }),
        },
        clock: { now: () => OBSERVED_AT },
      }),
      pmapFs: realPorts(),
      readFileBytes: (path) => readFileSync(path),
      registry: { read: () => sealedEmptyRegistry() },
    })
    const missingResult = await missing.read()
    expect(missingResult).toMatchObject({ kind: 'unavailable', code: 'host-projection-unavailable' })
    if (missingResult.kind === 'unavailable') {
      expect(missingResult.reason).toContain('(active-profile-unavailable)')
    }

    const fixture = await composeFixture('clock-fail')
    const clockProvider = createRuntimeInventoryProvider({
      paths: fixture.paths,
      hostProjection: createHostLiveInventoryProjectionProvider({
        paths: fixture.paths,
        host: { readSnapshot: () => fixture.snapshot() },
        clock: { now: () => { throw new Error('/secret/clock/socket') } },
      }),
      pmapFs: realPorts(),
      readFileBytes: (path) => readFileSync(path),
      registry: { read: () => sealedEmptyRegistry() },
    })
    const clockResult = await clockProvider.read()
    expect(clockResult).toMatchObject({ kind: 'unavailable', code: 'host-projection-unavailable' })
    if (clockResult.kind === 'unavailable') {
      expect(clockResult.reason).toContain('(clock-unavailable)')
      expect(clockResult.reason).not.toContain('/secret/clock/socket')
    }
  })

  it('rejects a pointer that drifts after the projection without leaking paths', async () => {
    const fixture = await composeFixture('drift')
    const second = await materializeGeneration(fixture.paths, 'drift-second-generation')
    const realReadActiveProfile = profilePaths.readActiveProfile
    let calls = 0
    vi.spyOn(profilePaths, 'readActiveProfile').mockImplementation(async (paths: SagePaths) => {
      const result = await realReadActiveProfile(paths)
      calls += 1
      if (calls === 2) writePointer(fixture.paths, second.generation, second.manifestSha256, ACTIVATED_AT)
      return result
    })

    const result = await composeProvider(fixture, () => sealedEmptyRegistry()).read()

    expect(calls).toBe(3)
    expect(result).toMatchObject({ kind: 'unavailable', code: 'active-profile-unavailable' })
    if (result.kind === 'unavailable') {
      expect(result.reason).not.toContain(fixture.profileDir)
    }
  })

  it('requires complete observed PMAP rows and a readable presets manifest', async () => {
    const variants: ReadonlyArray<readonly [string, ComposeFixtureOptions]> = [
      ['web-app bundle missing', { includeWebAppBundle: false }],
      ['presets manifest missing', { includePresetsManifest: false }],
      ['model row absent', { modelRowMode: 'absent' }],
      ['model row unparsable', { modelRowMode: 'unparsable' }],
      ['model incomplete', { modelRowMode: 'provider-only' }],
    ]
    for (const [label, options] of variants) {
      const fixture = await composeFixture(`pmap-${label.replaceAll(' ', '-')}`, options)
      const result = await composeProvider(fixture, () => sealedEmptyRegistry()).read()
      expect(result, label).toMatchObject({ kind: 'unavailable', code: 'pmap-incomplete' })
    }
  })

  it('treats a missing or unreadable overlay as unavailable at the earliest failing stage', async () => {
    // The overlay is a required composition layer (PMAP) and a policy document; a missing
    // file stops the composition at the PMAP stage, which fails closed first.
    const missingOverlay = await composeFixture('overlay-missing', { includeOverlay: false })
    await expect(composeProvider(missingOverlay, () => sealedEmptyRegistry()).read())
      .resolves.toMatchObject({ kind: 'unavailable', code: 'pmap-incomplete' })

    const fixture = await composeFixture('overlay-denied')
    const deniedOverlay = composeWithPorts(fixture, {
      readFileBytes: (path) => {
        if (path === overlayPath(fixture.profileDir)) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return readFileSync(path)
      },
    })
    await expect(deniedOverlay.read()).resolves.toMatchObject({ kind: 'unavailable', code: 'policy-document-unavailable' })

    const deniedLocal = composeWithPorts(fixture, {
      readFileBytes: (path) => {
        if (path === join(fixture.paths.root, LOCAL_PATCH_FILE)) throw Object.assign(new Error('denied'), { code: 'EACCES' })
        return readFileSync(path)
      },
    })
    await expect(deniedLocal.read()).resolves.toMatchObject({ kind: 'unavailable', code: 'policy-document-unavailable' })
  })

  it('requires a registry snapshot: absent, unreadable, invalid or hostile stay unavailable', async () => {
    const fixture = await composeFixture('registry-fail')
    await expect(composeWithPorts(fixture, { registry: null }).read())
      .resolves.toMatchObject({ kind: 'unavailable', code: 'registry-unavailable' })

    const throwing = await composeWithPorts(fixture, {
      registry: { read: () => { throw new Error('/secret/registry/token') } },
    }).read()
    expect(throwing).toMatchObject({ kind: 'unavailable', code: 'registry-unavailable' })
    if (throwing.kind === 'unavailable') {
      expect(throwing.reason).not.toContain('/secret/registry/token')
    }

    const invalid = await composeWithPorts(fixture, { registry: { read: () => ({ kind: 'not-a-snapshot' }) } }).read()
    expect(invalid).toMatchObject({ kind: 'unavailable', code: 'registry-unavailable' })
    if (invalid.kind === 'unavailable') {
      expect(invalid.reason).toContain('(registry-snapshot-invalid)')
    }

    const sealed = sealedEmptyRegistry()
    const accessor = vi.fn(() => sealed.snapshotId)
    const hostile: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(sealed)) {
      if (key === 'snapshotId') Object.defineProperty(hostile, key, { enumerable: true, configurable: true, get: accessor })
      else Object.defineProperty(hostile, key, { enumerable: true, configurable: true, value })
    }
    const hostileResult = await composeWithPorts(fixture, { registry: { read: () => hostile } }).read()
    expect(hostileResult).toMatchObject({ kind: 'unavailable', code: 'registry-unavailable' })
    expect(accessor).not.toHaveBeenCalled()
  })

  it('rejects non-V2 capability versions and filters entries by effectiveness at the instant', async () => {
    const fixture = await composeFixture('capability-fail')

    const invalid = await composeWithPorts(fixture, {
      registry: { read: () => sealRegistry([approvedEntry({ capabilityVersion: '1.0.0-01' })]) },
    }).read()
    expect(invalid).toMatchObject({ kind: 'unavailable', code: 'capability-invalid' })

    const future = await composeWithPorts(fixture, {
      registry: { read: () => sealRegistry([approvedEntry({ effectiveAt: '2026-10-03T00:00:00.000Z' })]) },
    }).read()
    if (future.kind !== 'available') throw new Error('not-yet-effective entry must not block availability')
    expect(future.descriptor.capabilities).toEqual([])

    const expired = await composeWithPorts(fixture, {
      registry: { read: () => sealRegistry([approvedEntry({ expiresAt: '2026-10-02T11:00:00.000Z' })]) },
    }).read()
    if (expired.kind !== 'available') throw new Error('expired entry must not block availability')
    expect(expired.descriptor.capabilities).toEqual([])

    const effective = await composeWithPorts(fixture, {
      registry: { read: () => sealRegistry([approvedEntry({ expiresAt: '2026-10-02T13:00:00.000Z' })]) },
    }).read()
    if (effective.kind !== 'available') throw new Error('effective entry must be included')
    expect(effective.descriptor.capabilities).toHaveLength(1)
    expect(effective.descriptor.capabilities[0]?.identity).toBe('capability:sage.demo-echo')
  })

  it('fails closed as assembly-invalid when the projected harness version is not a V2 version', async () => {
    const fixture = await composeFixture('assembly-fail')
    const result = await composeWithPorts(fixture, {
      snapshot: Object.freeze({ ...fixture.snapshot(), harnessVersion: 'not-semver' }),
    }).read()
    expect(result).toEqual({ kind: 'unavailable', code: 'assembly-invalid', reason: expect.any(String) })
  })

  it('moves only the evidence digest for transient changes and both digests for semantic ones', async () => {
    const fixture = await composeFixture('paired')
    let snapshot: HostLiveInventorySnapshot = fixture.snapshot()
    let now = OBSERVED_AT
    let activeProfileDir = fixture.profileDir
    const provider = createRuntimeInventoryProvider({
      paths: fixture.paths,
      hostProjection: createHostLiveInventoryProjectionProvider({
        paths: fixture.paths,
        host: { readSnapshot: () => snapshot },
        clock: { now: () => now },
      }),
      pmapFs: realPorts(),
      readFileBytes: (path) => readFileSync(path),
      registry: { read: () => sealedEmptyRegistry() },
    })

    const baseline = await provider.read()
    if (baseline.kind !== 'available') throw new Error('baseline read must be available')
    await expect(provider.read()).resolves.toEqual(baseline)

    // Transient: boot identity, runtime epoch, observation time, pointer activation time.
    // Only the full evidence digest moves; the stable descriptor digest is invariant.
    const transient: ReadonlyArray<readonly [string, () => void]> = [
      ['bootId', () => { snapshot = Object.freeze({ ...fixture.snapshot(), bootId: 'sage-host:55555555-5555-4555-8555-555555555555' }) }],
      ['runtimeGeneration', () => { snapshot = Object.freeze({ ...fixture.snapshot(), runtimeGeneration: RUNTIME_GENERATION + 1 }) }],
      ['observedAt', () => { now = '2026-10-02T12:00:01.000Z' }],
      ['activatedAt', () => { writePointer(fixture.paths, fixture.generation, fixture.manifestSha256, '2026-10-02T11:58:00.000Z') }],
    ]
    for (const [label, mutate] of transient) {
      mutate()
      const next = await provider.read()
      if (next.kind !== 'available') throw new Error(`${label} must keep the inventory available`)
      expect(next.descriptor.runtimeDescriptorDigest, label).toBe(baseline.descriptor.runtimeDescriptorDigest)
      expect(next.evidence.inventoryEvidenceDigest, label).not.toBe(baseline.evidence.inventoryEvidenceDigest)
    }

    // A same-content second generation (generation + receipt drift) is transient too.
    const second = await materializeGeneration(fixture.paths, 'paired-second-generation')
    writePointer(fixture.paths, second.generation, second.manifestSha256, ACTIVATED_AT)
    snapshot = Object.freeze({ ...fixture.snapshot(), activeGeneration: second.generation, manifestSha256: second.manifestSha256 })
    activeProfileDir = second.profileDir
    const regenerated = await provider.read()
    if (regenerated.kind !== 'available') throw new Error('second generation must keep the inventory available')
    expect(regenerated.descriptor.runtimeDescriptorDigest).toBe(baseline.descriptor.runtimeDescriptorDigest)
    expect(regenerated.evidence.inventoryEvidenceDigest).not.toBe(baseline.evidence.inventoryEvidenceDigest)

    // Semantic: PMAP selection, overlay bytes, a new local patch, and the preset roster.
    // Both the stable descriptor digest and the full evidence digest move.
    const semantic: ReadonlyArray<readonly [string, () => void]> = [
      ['model override', () => { appendProfilePatch(activeProfileDir, '- id: agent-default-model\n  config:\n    model: deepseek-reasoner\n') }],
      ['overlay bytes', () => { writeFileSync(overlayPath(activeProfileDir), '# changed overlay\n') }],
      ['local patch appears', () => { writeFileSync(join(fixture.paths.root, LOCAL_PATCH_FILE), 'patch: []\n') }],
      ['preset roster', () => { appendProfilePatch(activeProfileDir, presetInsertFile('beta')) }],
    ]
    let previous = regenerated
    for (const [label, mutate] of semantic) {
      mutate()
      const next = await provider.read()
      if (next.kind !== 'available') throw new Error(`${label} must keep the inventory available`)
      expect(next.descriptor.runtimeDescriptorDigest, label).not.toBe(previous.descriptor.runtimeDescriptorDigest)
      expect(next.evidence.inventoryEvidenceDigest, label).not.toBe(previous.evidence.inventoryEvidenceDigest)
      previous = next
    }
  })
})
