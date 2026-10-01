/** WT-02C.2E.2 consumption: the produced stable pair must survive the real V2 resolver
 * kernel end to end (equivalent for a pre-published matrix rule, freshness rejection, and
 * digest-tamper rejection), and the composition must run against the real active Sage
 * generation with zero fixtures and land on the honest terminal stage. */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readActiveProfile, resolveSagePaths } from '../src/profile/paths.js'
import { overlayPath } from '../src/profile/layout.js'
import { createHostLiveInventoryProjectionProvider } from '../src/main/runtime-inventory.js'
import { collectPmapEvidence } from '../src/main/runtime-inventory-pmap.js'
import { createRuntimeInventoryProvider } from '../src/main/runtime-inventory-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  computeTargetEvidenceDigestV2,
  computeTargetSemanticDigestV2,
  resolveCompatibilityV2,
  type CompatibilityMatrixRuleV2,
  type CompatibilityMatrixV2,
  type CompatibilityMatrixV2Available,
  type CompatibilityResolveInputV2,
  type CompatibilityTargetEvidenceBodyV2,
  type CompatibilityTargetEvidenceV2,
  type CompatibilityTargetSemanticBodyV2,
  type CompatibilityTargetSemanticV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'
import {
  OBSERVED_AT,
  cleanupTemporaryRoots,
  composeFixture,
  composeProvider,
  realPorts,
  sealedEmptyRegistry,
} from './support/runtime-inventory-fixture.js'

afterEach(() => {
  vi.restoreAllMocks()
  cleanupTemporaryRoots()
})

const EVALUATED_AT = '2026-10-02T12:00:15.000Z'

function innerDigest(hexDigit: string): string {
  return `sha256:${hexDigit.repeat(64)}`
}

const TARGET_SEMANTIC_BODY: CompatibilityTargetSemanticBodyV2 = {
  schemaVersion: 'sage.compatibility-target-semantic.v2',
  canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
  actionPolicies: [
    { actionScope: 'demo.echo', effectClass: 'external-read', requiresDecision: false },
  ],
  permissionPolicyDigest: innerDigest('1'),
  dataDestinationPolicyDigest: innerDigest('2'),
  provider: {
    identity: 'provider:target-fixture',
    version: '1.0.0',
    artifactDigest: innerDigest('3'),
    contractDigest: innerDigest('4'),
    behaviorConfigurationDigest: innerDigest('5'),
  },
  model: {
    identity: 'model:target-fixture',
    version: '2026-09-01',
    artifactDigest: innerDigest('6'),
    contractDigest: innerDigest('7'),
    behaviorConfigurationDigest: innerDigest('8'),
  },
  agent: {
    identity: 'agent:target-fixture',
    version: '1.2.0',
    artifactDigest: innerDigest('9'),
    contractDigest: innerDigest('a'),
    behaviorConfigurationDigest: innerDigest('b'),
  },
  preset: {
    identity: 'preset:target-fixture',
    version: '3.0.0',
    artifactDigest: innerDigest('c'),
    contractDigest: innerDigest('d'),
    behaviorConfigurationDigest: innerDigest('e'),
  },
  capabilities: [],
  protocolContractDigest: innerDigest('0'),
  launchPolicyDigest: innerDigest('1'),
  overlayPolicyDigest: innerDigest('2'),
}

function sealTargetSemantic(body: CompatibilityTargetSemanticBodyV2): CompatibilityTargetSemanticV2 {
  return { ...body, targetSemanticDigest: computeTargetSemanticDigestV2(body) }
}

function sealTargetEvidence(body: CompatibilityTargetEvidenceBodyV2): CompatibilityTargetEvidenceV2 {
  return { ...body, targetEvidenceDigest: computeTargetEvidenceDigestV2(body) }
}

function targetEvidenceBody(targetSemantic: CompatibilityTargetSemanticV2): CompatibilityTargetEvidenceBodyV2 {
  return {
    schemaVersion: 'sage.compatibility-target-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    targetSemanticDigest: targetSemantic.targetSemanticDigest,
    matterId: 'matter:runtime-inventory-001',
    revisionId: 'revision:runtime-inventory-001',
    revisionDigest: innerDigest('3'),
    actionScope: 'demo.echo',
    actionIntentDigest: innerDigest('4'),
    organizationBoundaryDigest: innerDigest('5'),
    accountBoundaryDigest: innerDigest('6'),
    resourceBoundaryDigest: innerDigest('7'),
    decisionDigest: innerDigest('8'),
    attemptId: 'attempt:runtime-inventory-001',
    issuedAt: '2026-10-02T12:00:00.000Z',
    targetProviderProvenanceDigest: innerDigest('9'),
  }
}

/** Pre-publish the fixture matrix rule at the produced stable descriptor pair. */
function publishedMatrix(
  targetSemantic: CompatibilityTargetSemanticV2,
  descriptor: RuntimeDescriptorV2,
): CompatibilityMatrixV2Available {
  const rule: CompatibilityMatrixRuleV2 = {
    ruleId: 'rule:runtime-inventory-equivalent',
    targetSemanticDigest: targetSemantic.targetSemanticDigest,
    runtimeDescriptorDigest: descriptor.runtimeDescriptorDigest,
    outcome: 'equivalent',
    reasonCode: 'published-exact-stable-pair',
    reason: 'The produced stable runtime descriptor pair was reviewed and published.',
  }
  const artifact: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: { identity: 'authority:sage-compatibility', version: '2.0.0', digest: innerDigest('a') },
    validFrom: '2026-10-02T00:00:00.000Z',
    expiresAt: '2026-10-03T00:00:00.000Z',
    rules: [rule],
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(artifact)
  return {
    kind: 'available',
    matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
    canonicalMatrix,
    providerProvenanceDigest: innerDigest('b'),
    revocations: [],
  }
}

function consumptionInput(
  descriptor: RuntimeDescriptorV2,
  evidence: RuntimeInventoryEvidenceV2,
): CompatibilityResolveInputV2 {
  const targetSemantic = sealTargetSemantic(structuredClone(TARGET_SEMANTIC_BODY))
  const targetEvidence = sealTargetEvidence(targetEvidenceBody(targetSemantic))
  return {
    evaluatedAt: EVALUATED_AT,
    currentRevision: {
      matterId: targetEvidence.matterId,
      revisionId: targetEvidence.revisionId,
      digest: targetEvidence.revisionDigest,
    },
    targetSemantic,
    targetEvidence,
    runtimeDescriptor: descriptor,
    inventoryEvidence: evidence,
    matrix: publishedMatrix(targetSemantic, descriptor),
  }
}

async function produceStablePair() {
  const fixture = await composeFixture('consume')
  const produced = await composeProvider(fixture, () => sealedEmptyRegistry()).read()
  if (produced.kind !== 'available') throw new Error(`expected available inventory, got ${produced.code}`)
  return produced
}

/** The real-generation read scans the active profile's full installed tree once
 * (50-200s under load), so it stays opt-in:
 *   SAGE_REAL_GENERATION=1 node scripts/test.mjs run test/runtime-inventory-consumption.spec.ts */
const itReal = process.env.SAGE_REAL_GENERATION === '1' ? it : it.skip

describe('WT-02C.2E.2 runtime inventory consumption', () => {
  it('yields equivalent from the V2 resolver for a matrix rule published at the produced stable pair', async () => {
    const produced = await produceStablePair()

    const resolution = resolveCompatibilityV2(consumptionInput(produced.descriptor, produced.evidence))

    expect(resolution.outcome).toBe('equivalent')
    if (resolution.outcome !== 'equivalent') throw new Error(`expected equivalent, got ${resolution.code}`)
    expect(resolution.code).toBe('exact-match')
    expect(resolution.binding.runtimeDescriptorDigest).toBe(produced.descriptor.runtimeDescriptorDigest)
    expect(resolution.binding.inventoryEvidenceDigest).toBe(produced.evidence.inventoryEvidenceDigest)
    expect(resolution.binding.evaluatedAt).toBe(EVALUATED_AT)
    expect(Object.isFrozen(resolution)).toBe(true)
  })

  it('rejects the produced evidence at and after its observation window', async () => {
    const produced = await produceStablePair()

    const atExpiry = resolveCompatibilityV2({
      ...consumptionInput(produced.descriptor, produced.evidence),
      evaluatedAt: produced.evidence.expiresAt,
    })
    expect(atExpiry.outcome).toBe('unknown')
    if (atExpiry.outcome !== 'unknown') throw new Error('expected unknown at expiry')
    expect(atExpiry.code).toBe('inventory-not-active')

    const afterExpiry = resolveCompatibilityV2({
      ...consumptionInput(produced.descriptor, produced.evidence),
      evaluatedAt: '2026-10-02T12:00:59.000Z',
    })
    expect(afterExpiry.outcome).toBe('unknown')
    if (afterExpiry.outcome !== 'unknown') throw new Error('expected unknown after expiry')
    expect(afterExpiry.code).toBe('inventory-not-active')
  })

  it('rejects a tampered descriptor or evidence before matrix lookup', async () => {
    const produced = await produceStablePair()
    const input = consumptionInput(produced.descriptor, produced.evidence)

    const tamperedDescriptor = resolveCompatibilityV2({
      ...input,
      runtimeDescriptor: {
        ...input.runtimeDescriptor,
        host: { ...input.runtimeDescriptor.host, version: '4.0.1' },
      },
    })
    expect(tamperedDescriptor.outcome).toBe('unknown')
    if (tamperedDescriptor.outcome !== 'unknown') throw new Error('expected unknown for tampered descriptor')
    expect(tamperedDescriptor.code).toBe('runtime-descriptor-digest-mismatch')

    const tamperedEvidence = resolveCompatibilityV2({
      ...input,
      inventoryEvidence: {
        ...input.inventoryEvidence,
        bootId: 'sage-host:66666666-6666-4666-8666-666666666666',
      },
    })
    expect(tamperedEvidence.outcome).toBe('unknown')
    if (tamperedEvidence.outcome !== 'unknown') throw new Error('expected unknown for tampered evidence')
    expect(tamperedEvidence.code).toBe('inventory-evidence-digest-mismatch')
  })

  itReal('reads the real active Sage generation with zero fixtures and lands on the honest stage', async () => {    const paths = resolveSagePaths({ home: homedir() })
    const realProfile = await readActiveProfile(paths).catch(() => null)

    // A shell-shaped stub: when a real generation exists the stub mirrors its exact
    // binding; otherwise it points at a generation that does not exist and the real
    // pointer must fail the projection.
    const snapshot = realProfile === null
      ? Object.freeze({
          kind: 'active' as const, bootId: 'sage-host:99999999-9999-4999-8999-999999999999',
          runtimeGeneration: 1, activeGeneration: 'missing-generation', manifestSha256: '1'.repeat(64),
          loaderPhase: 'active' as const, hostProtocolVersion: '4' as const, harnessVersion: '0.2.0-rc.2',
        })
      : Object.freeze({
          kind: 'active' as const, bootId: 'sage-host:99999999-9999-4999-8999-999999999999',
          runtimeGeneration: 1, activeGeneration: realProfile.generation, manifestSha256: realProfile.manifestSha256,
          loaderPhase: 'active' as const, hostProtocolVersion: '4' as const, harnessVersion: '0.2.0-rc.2',
        })

    const provider = createRuntimeInventoryProvider({
      paths,
      hostProjection: createHostLiveInventoryProjectionProvider({
        paths,
        host: { readSnapshot: () => snapshot },
        clock: { now: () => new Date().toISOString() },
      }),
      pmapFs: realPorts(),
      readFileBytes: (path) => readFileSync(path),
      // No registry port: the C2D.2A provider does not exist yet, so this ticket can
      // only ever read the stages before it.
    })
    const result = await provider.read()

    expect(result.kind).toBe('unavailable')
    if (result.kind !== 'unavailable') throw new Error('the production registry port must not exist yet')

    if (realProfile === null || realProfile.runtimeArtifactAttestationSha256 === undefined) {
      // No sealed generation is readable, so the projection is the first and final stage.
      expect(result.code).toBe('host-projection-unavailable')
      return
    }

    if (result.code === 'host-projection-unavailable') {
      // The real projection ended the read; the reason must carry a named C2B code and
      // must not leak machine paths.
      expect(result.reason).toMatch(/\((?:host-not-active|host-runtime-invalidated|active-profile-unavailable|host-profile-mismatch|active-profile-changed|artifact-attestation-missing|artifact-attestation-unsealed|artifact-attestation-invalid|clock-unavailable|clock-regressed)\)$/u)
      expect(result.reason).not.toContain(paths.root)
      return
    }

    // Any other code proves the projection succeeded on the real generation (the fixed
    // order has no later-stage bypass), so the terminal stage must match the real facts.
    const rows = await collectPmapEvidence({
      harnessHome: paths.harnessHome,
      profileDir: realProfile.profileDir,
      fs: realPorts(),
      now: () => OBSERVED_AT,
    })
    const rowsObserved = rows.every((row) => row.state === 'observed')
    const presetsManifestReadable = (() => {
      try {
        JSON.parse(readFileSync(join(realProfile.profileDir, 'node_modules/@deepseek-ai/dsh-agent-presets/package.json'), 'utf8'))
        return true
      } catch {
        return false
      }
    })()
    const overlayReadable = (() => {
      try {
        readFileSync(overlayPath(realProfile.profileDir))
        return true
      } catch {
        return false
      }
    })()

    if (!rowsObserved || !presetsManifestReadable) {
      expect(result.code).toBe('pmap-incomplete')
    } else if (!overlayReadable) {
      expect(result.code).toBe('policy-document-unavailable')
    } else {
      expect(result.code).toBe('registry-unavailable')
    }
  }, 600_000)
})
