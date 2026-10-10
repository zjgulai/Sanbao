import { describe, expect, it } from 'vitest'

import { buildTargetRequirementCandidate, sealCandidateTargetRequirement } from '../src/main/target-requirement-candidate.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  computeInventoryEvidenceDigestV2,
  computeRuntimeDescriptorDigestV2,
  computeTargetEvidenceDigestV2,
  computeTargetSemanticDigestV2,
  resolveCompatibilityV2,
  type CompatibilityMatrixV2,
  type CompatibilityMatrixV2Available,
  type CompatibilityMatrixRuleV2,
  type CompatibilityResolveInputV2,
  type CompatibilityTargetEvidenceBodyV2,
  type CompatibilityTargetEvidenceV2,
  type CompatibilityTargetSemanticV2,
  type RuntimeDescriptorBodyV2,
  type RuntimeDescriptorV2,
  type RuntimeInventoryEvidenceBodyV2,
  type RuntimeInventoryEvidenceV2,
} from '../src/security/compatibility.js'
import { parseCompatibilityTargetRequirement } from '../src/security/compatibility-target-requirement.js'

/**
 * T05 mid-authorities first cut (ADR-0276): the publication-candidate line. The cases pin that
 * the candidate copies the observed descriptor verbatim, produces a deterministic semantic
 * digest and pair, seals only after an owner decision (through the kernel's own gate), and —
 * the strongest pin — that the sealed candidate plus the observed descriptor resolves
 * `equivalent` through the matrix rule and stops matching when the pair moves.
 */

const inner = (char: string): string => `sha256:${char.repeat(64)}`

function runtimeDescriptorFixture(): RuntimeDescriptorV2 {
  const body: RuntimeDescriptorBodyV2 = {
    schemaVersion: 'sage.runtime-descriptor.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    host: {
      identity: 'host:sage-desktop',
      version: '0.1.0',
      artifactDigest: inner('1'),
      contractDigest: inner('2'),
      behaviorConfigurationDigest: inner('3'),
    },
    harness: {
      identity: 'harness:sage-runtime',
      version: '0.1.5-rc.2',
      artifactDigest: inner('4'),
      contractDigest: inner('5'),
      behaviorConfigurationDigest: inner('6'),
    },
    provider: {
      identity: 'provider:sage-fixture',
      version: '0.2.0',
      artifactDigest: inner('7'),
      contractDigest: inner('8'),
      behaviorConfigurationDigest: inner('9'),
    },
    model: {
      identity: 'model:sage-fixture',
      version: '2026-09-01',
      artifactDigest: inner('a'),
      contractDigest: inner('b'),
      behaviorConfigurationDigest: inner('c'),
    },
    agent: {
      identity: 'agent:sage-catalog',
      version: '1.2.0',
      artifactDigest: inner('d'),
      contractDigest: inner('e'),
      behaviorConfigurationDigest: inner('f'),
    },
    preset: {
      identity: 'preset:sage-catalog',
      version: '3.0.0',
      artifactDigest: inner('1'),
      contractDigest: inner('2'),
      behaviorConfigurationDigest: inner('3'),
    },
    capabilities: [],
    protocolContractDigest: inner('4'),
    launchPolicyDigest: inner('5'),
    overlayPolicyDigest: inner('6'),
  }
  return { ...body, runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(body) }
}

function proposal(overrides: Partial<Parameters<typeof buildTargetRequirementCandidate>[0]['requirement']> = {}) {
  return {
    requirementId: 'requirement:sage-session-prompt',
    requirementVersion: '1.0.0',
    effectiveAt: '2026-10-10T00:00:00Z',
    expiresAt: '2027-10-10T00:00:00Z',
    actionRequirements: [{ actionScope: 'session.prompt', effectClass: 'external-write' as const, requiresDecision: false }],
    permissionRequirements: [{ identity: 'permission:sage.session', version: '1.0.0', digest: inner('7') }],
    dataBoundaryRequirements: [{ identity: 'data-boundary:sage.local', version: '1.0.0', digest: inner('8') }],
    ...overrides,
  }
}

function movedDescriptorFixture(): RuntimeDescriptorV2 {
  const { runtimeDescriptorDigest: _current, ...body } = runtimeDescriptorFixture()
  const movedBody = { ...body, model: { ...body.model, behaviorConfigurationDigest: inner('1') } }
  return { ...movedBody, runtimeDescriptorDigest: computeRuntimeDescriptorDigestV2(movedBody) }
}

function candidateFixture() {
  return buildTargetRequirementCandidate({
    createdAt: '2026-10-10T10:00:00Z',
    requirement: proposal(),
    descriptor: runtimeDescriptorFixture(),
    proposedRule: {
      ruleId: 'rule:sage-session-prompt-v1',
      outcome: 'equivalent',
      reasonCode: 'owner-approved-exact-pair',
      reason: 'The reviewed session-prompt target and the shipped runtime generation are an approved exact pair.',
    },
  })
}

function sealTargetEvidence(body: CompatibilityTargetEvidenceBodyV2): CompatibilityTargetEvidenceV2 {
  return { ...body, targetEvidenceDigest: computeTargetEvidenceDigestV2(body) }
}

function sealInventoryEvidence(body: RuntimeInventoryEvidenceBodyV2): RuntimeInventoryEvidenceV2 {
  return { ...body, inventoryEvidenceDigest: computeInventoryEvidenceDigestV2(body) }
}

function targetEvidenceFor(targetSemantic: CompatibilityTargetSemanticV2): CompatibilityTargetEvidenceV2 {
  return sealTargetEvidence({
    schemaVersion: 'sage.compatibility-target-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    targetSemanticDigest: targetSemantic.targetSemanticDigest,
    matterId: 'matter:one',
    revisionId: 'revision:one',
    revisionDigest: inner('2'),
    actionScope: 'session.prompt',
    actionIntentDigest: inner('3'),
    organizationBoundaryDigest: inner('4'),
    accountBoundaryDigest: inner('5'),
    resourceBoundaryDigest: inner('6'),
    decisionDigest: inner('7'),
    attemptId: 'attempt:one',
    issuedAt: '2026-10-10T11:59:00Z',
    targetProviderProvenanceDigest: inner('8'),
  })
}

function inventoryEvidenceFor(descriptor: RuntimeDescriptorV2): RuntimeInventoryEvidenceV2 {
  return sealInventoryEvidence({
    schemaVersion: 'sage.runtime-inventory-evidence.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    runtimeDescriptorDigest: descriptor.runtimeDescriptorDigest,
    activeGeneration: 'fixture-generation-t05',
    receiptDigest: inner('9'),
    materializationInstanceDigest: inner('a'),
    artifactAttestationDigest: inner('b'),
    registrySnapshotDigest: inner('c'),
    bootId: 'boot:sage-fixture-t05',
    runtimeGeneration: 23,
    observedAt: '2026-10-10T11:59:00Z',
    expiresAt: '2026-10-10T12:05:00Z',
    healthObservationDigest: inner('d'),
    livenessObservationDigest: inner('e'),
    instanceAuthorityDigest: inner('f'),
    mainObservationProvenanceDigest: inner('0'),
  })
}

function availableMatrix(rules: readonly CompatibilityMatrixRuleV2[]): CompatibilityMatrixV2Available {
  const matrix: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: { identity: 'authority:sage-compatibility', version: '2.0.0', digest: inner('1') },
    validFrom: '2026-10-01T00:00:00Z',
    expiresAt: '2027-01-01T00:00:00Z',
    rules,
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(matrix)
  return {
    kind: 'available',
    matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix),
    canonicalMatrix,
    providerProvenanceDigest: inner('2'),
    revocations: [],
  }
}

describe('the target requirement candidate line (ADR-0276)', () => {
  it('copies the observed descriptor verbatim into the pins and the semantic body', () => {
    const descriptor = runtimeDescriptorFixture()
    const candidate = buildTargetRequirementCandidate({
      createdAt: '2026-10-10T10:00:00Z',
      requirement: proposal(),
      descriptor,
      proposedRule: { ruleId: 'rule:sage-session-prompt-v1', outcome: 'equivalent', reasonCode: 'owner-approved-exact-pair', reason: 'Approved.' },
    })

    expect(candidate.observedRuntimeDescriptorDigest).toBe(descriptor.runtimeDescriptorDigest)
    expect(candidate.requirement.provider).toEqual(descriptor.provider)
    expect(candidate.requirement.model).toEqual(descriptor.model)
    expect(candidate.requirement.agent).toEqual(descriptor.agent)
    expect(candidate.requirement.preset).toEqual(descriptor.preset)
    expect(candidate.requirement.capabilities).toEqual(descriptor.capabilities)
    expect(candidate.targetSemantic.provider).toEqual(descriptor.provider)
    expect(candidate.targetSemantic.protocolContractDigest).toBe(descriptor.protocolContractDigest)
    expect(candidate.targetSemantic.launchPolicyDigest).toBe(descriptor.launchPolicyDigest)
    expect(candidate.targetSemantic.overlayPolicyDigest).toBe(descriptor.overlayPolicyDigest)
    expect(candidate.targetSemantic.actionPolicies).toEqual([
      { actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false },
    ])
    expect('ownerDecision' in candidate.requirement).toBe(false)
  })

  it('computes the semantic digest from its body and moves it when the descriptor moves', () => {
    const candidate = candidateFixture()
    const { targetSemanticDigest, ...body } = candidate.targetSemantic
    expect(computeTargetSemanticDigestV2(body)).toBe(targetSemanticDigest)

    const movedCandidate = buildTargetRequirementCandidate({
      createdAt: '2026-10-10T10:00:00Z',
      requirement: proposal(),
      descriptor: movedDescriptorFixture(),
      proposedRule: { ruleId: 'rule:sage-session-prompt-v1', outcome: 'equivalent', reasonCode: 'owner-approved-exact-pair', reason: 'Approved.' },
    })
    expect(movedCandidate.targetSemantic.targetSemanticDigest).not.toBe(targetSemanticDigest)
  })

  it('keeps the policy-list digests deterministic and order-sensitive', () => {
    const first = candidateFixture()
    const second = candidateFixture()
    expect(first.targetSemantic.permissionPolicyDigest).toBe(second.targetSemantic.permissionPolicyDigest)

    const secondEntry = { identity: 'permission:sage.other', version: '1.0.0', digest: inner('8') }
    const reordered = buildTargetRequirementCandidate({
      createdAt: '2026-10-10T10:00:00Z',
      requirement: proposal({ permissionRequirements: [secondEntry, proposal().permissionRequirements[0]!] }),
      descriptor: runtimeDescriptorFixture(),
      proposedRule: { ruleId: 'rule:sage-session-prompt-v1', outcome: 'equivalent', reasonCode: 'owner-approved-exact-pair', reason: 'Approved.' },
    })
    expect(reordered.targetSemantic.permissionPolicyDigest).not.toBe(first.targetSemantic.permissionPolicyDigest)
  })

  it('seals only through an owner decision, and the kernel parses the sealed requirement', () => {
    const candidate = candidateFixture()
    const sealed = sealCandidateTargetRequirement(candidate, {
      decisionId: 'decision:sage-t05-first-target',
      ownerId: 'owner:sage-product',
      decidedAt: '2026-10-09T18:00:00Z',
      reason: 'First internal session-prompt target approved.',
    })
    expect(sealed.ok, JSON.stringify(sealed)).toBe(true)
    if (!sealed.ok) return
    expect(sealed.value.ownerDecision.decisionId).toBe('decision:sage-t05-first-target')
    expect(sealed.value.requirementId).toBe('requirement:sage-session-prompt')
    const reparsed = parseCompatibilityTargetRequirement(sealed.value)
    expect(reparsed.ok).toBe(true)
    if (!reparsed.ok) return
    expect(reparsed.value).toEqual(sealed.value)
  })

  it('resolves equivalent through the approved pair and stops matching when the pair moves', () => {
    const candidate = candidateFixture()
    const descriptor = runtimeDescriptorFixture()
    const matrix = availableMatrix([{
      ruleId: candidate.proposedMatrixRule.ruleId,
      targetSemanticDigest: candidate.proposedMatrixRule.targetSemanticDigest,
      runtimeDescriptorDigest: candidate.proposedMatrixRule.runtimeDescriptorDigest,
      outcome: candidate.proposedMatrixRule.outcome,
      reasonCode: candidate.proposedMatrixRule.reasonCode,
      reason: candidate.proposedMatrixRule.reason,
    }])

    const input: CompatibilityResolveInputV2 = {
      evaluatedAt: '2026-10-10T12:00:00Z',
      currentRevision: { matterId: 'matter:one', revisionId: 'revision:one', digest: inner('2') },
      targetSemantic: candidate.targetSemantic,
      targetEvidence: targetEvidenceFor(candidate.targetSemantic),
      runtimeDescriptor: descriptor,
      inventoryEvidence: inventoryEvidenceFor(descriptor),
      matrix,
    }
    const resolution = resolveCompatibilityV2(input)
    expect(resolution).toMatchObject({
      outcome: 'equivalent',
      code: 'exact-match',
      binding: {
        matchedRuleId: 'rule:sage-session-prompt-v1',
        targetSemanticDigest: candidate.targetSemantic.targetSemanticDigest,
        runtimeDescriptorDigest: descriptor.runtimeDescriptorDigest,
      },
    })

    // A moved runtime fact (not in the approved pair) stops matching: never a fallback.
    const moved = movedDescriptorFixture()
    const movedResolution = resolveCompatibilityV2({
      ...input,
      runtimeDescriptor: moved,
      inventoryEvidence: inventoryEvidenceFor(moved),
    })
    expect(movedResolution).toMatchObject({ outcome: 'unknown', code: 'no-matching-rule' })
  })
})
