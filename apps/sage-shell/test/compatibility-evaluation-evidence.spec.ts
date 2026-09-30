import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  sealCompatibilityMatrixRevocationSourceV2,
  type CompatibilityMatrixRevocationSourceBodyV2,
} from '../src/security/compatibility-matrix-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
} from '../src/security/compatibility.js'
import {
  canonicalizeCompatibilityEvaluationEvidence,
  computeCompatibilityEvaluationEvidenceDigest,
  createCompatibilityEvaluationEvidenceKernel,
  parseCompatibilityEvaluationEvidence,
  sealCompatibilityEvaluationEvidence,
  strictReplayCompatibilityEvaluationEvidence,
  type CompatibilityEvaluationEvidenceBodyV1,
  type CompatibilityEvaluationHistoricalMatrixV1,
} from '../src/security/compatibility-evaluation-evidence.js'

const CONTENT_DIGEST = `sha256:${'1'.repeat(64)}`
const TARGET_SEMANTIC_DIGEST = `urn:sage:target-semantic:sha256:${'2'.repeat(64)}`
const TARGET_EVIDENCE_DIGEST = `urn:sage:target-evidence:sha256:${'3'.repeat(64)}`
const RUNTIME_DESCRIPTOR_DIGEST = `urn:sage:runtime-descriptor:sha256:${'4'.repeat(64)}`
const INVENTORY_EVIDENCE_DIGEST = `urn:sage:inventory-evidence:sha256:${'5'.repeat(64)}`

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function artifactReference(canonicalMatrix: string): string {
  return `urn:sage:compatibility-matrix-artifact:sha256:${sha256(canonicalMatrix)}`
}

function lineageDigest(sourceId: string, supersedesSourceId: string | null): string {
  return `sha256:${sha256(JSON.stringify({ sourceId, supersedesSourceId }))}`
}

function fixtureMatrix(): { readonly matrix: CompatibilityMatrixV2; readonly canonicalMatrix: string; readonly matrixId: string } {
  const matrix: CompatibilityMatrixV2 = {
    schemaVersion: 'sage.compatibility-matrix.v2',
    canonicalizationVersion: 'sage.compatibility-canonical-json.v2',
    semanticVersion: '2.0.0',
    targetContractVersion: 'sage.compatibility-target-semantic.v2',
    runtimeContractVersion: 'sage.runtime-descriptor.v2',
    issuer: {
      identity: 'authority:sage-compatibility',
      version: '1.0.0',
      digest: CONTENT_DIGEST,
    },
    validFrom: '2026-09-29T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    rules: [{
      ruleId: 'rule:sage.shopify.orders.read',
      targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
      runtimeDescriptorDigest: RUNTIME_DESCRIPTOR_DIGEST,
      outcome: 'equivalent',
      reasonCode: 'exact-match',
      reason: 'The approved Shopify read target matches the recorded runtime.',
    }],
  }
  const canonicalMatrix = canonicalizeCompatibilityMatrixV2(matrix)
  return { matrix, canonicalMatrix, matrixId: computeCompatibilityMatrixIdV2(canonicalMatrix) }
}

function fixtureRevocationSource(): ReturnType<typeof sealCompatibilityMatrixRevocationSourceV2> extends { readonly ok: true; readonly value: infer T } ? T : never {
  const body: CompatibilityMatrixRevocationSourceBodyV2 = {
    schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
    canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
    createdAt: '2026-09-29T00:00:00.000Z',
    sourceProvenanceDigest: CONTENT_DIGEST,
    entries: [],
  }
  const result = sealCompatibilityMatrixRevocationSourceV2(body)
  if (!result.ok) throw new Error(`Fixture revocation source failed: ${result.code}`)
  return result.value
}

function fixtureBody(): CompatibilityEvaluationEvidenceBodyV1 {
  const { matrixId, canonicalMatrix } = fixtureMatrix()
  const source = fixtureRevocationSource()
  return {
    schemaVersion: 'sage.compatibility-evaluation-evidence.v1',
    canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
    evaluationId: 'evaluation:sage.shopify-read',
    attemptId: 'attempt:sage.shopify-read-1',
    matterId: 'matter:sage.shopify-read',
    revisionId: 'revision:sage.shopify-read-1',
    revisionDigest: CONTENT_DIGEST,
    actionScope: 'shopify.orders.read',
    actionIntentDigest: CONTENT_DIGEST,
    targetSemanticDigest: TARGET_SEMANTIC_DIGEST,
    targetEvidenceDigest: TARGET_EVIDENCE_DIGEST,
    runtimeDescriptorDigest: RUNTIME_DESCRIPTOR_DIGEST,
    inventoryEvidenceDigest: INVENTORY_EVIDENCE_DIGEST,
    matrixArtifact: {
      schemaVersion: 'sage.compatibility-evaluation-matrix-artifact-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      matrixId,
      canonicalBytesDigest: `sha256:${sha256(canonicalMatrix)}`,
      artifactReference: artifactReference(canonicalMatrix),
    },
    matchedRuleId: 'rule:sage.shopify.orders.read',
    outcome: 'equivalent',
    reasonCode: 'exact-match',
    reason: 'The approved Shopify read target matches the recorded runtime.',
    evaluatedAt: '2026-09-29T03:00:00.000Z',
    resolverContractVersion: 'sage.compatibility-canonical-json.v2',
    providerProvenance: {
      schemaVersion: 'sage.compatibility-evaluation-provider-provenance.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      targetProviderProvenanceDigest: CONTENT_DIGEST,
      inventoryProviderProvenanceDigest: CONTENT_DIGEST,
      matrixProviderProvenanceDigest: CONTENT_DIGEST,
    },
    revocationSource: {
      schemaVersion: 'sage.compatibility-evaluation-revocation-source-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      sourceId: source.sourceId,
      sourceProvenanceDigest: source.sourceProvenanceDigest,
      sourceLineageDigest: lineageDigest(source.sourceId, null),
    },
    lifecycleState: 'active',
  }
}

function fixtureHistoricalMatrix(): CompatibilityEvaluationHistoricalMatrixV1 {
  const { canonicalMatrix, matrixId } = fixtureMatrix()
  return {
    matrixId,
    canonicalBytesDigest: `sha256:${sha256(canonicalMatrix)}`,
    artifactReference: artifactReference(canonicalMatrix),
    canonicalBytes: canonicalMatrix,
    revocationSource: fixtureRevocationSource(),
  }
}

function expectSuccess<T>(result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly code: string }): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`Expected success, received ${result.code}.`)
  return result.value
}

function expectFailure(result: { readonly ok: true } | { readonly ok: false; readonly code: string }, code: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error(`Expected ${code}.`)
  expect(result.code).toBe(code)
}

describe('WT-02C.3.1 CompatibilityEvaluationEvidence exact codec', () => {
  it('seals a detached immutable evidence record and reproduces its canonical digest', () => {
    const body = fixtureBody()
    const before = structuredClone(body)
    const sealed = expectSuccess(sealCompatibilityEvaluationEvidence(body))
    expect(body).toEqual(before)
    expect(Object.isFrozen(sealed)).toBe(true)
    expect(Object.isFrozen(sealed.matrixArtifact)).toBe(true)
    expect(Object.isFrozen(sealed.providerProvenance)).toBe(true)
    expect(parseCompatibilityEvaluationEvidence(sealed)).toEqual({ ok: true, value: sealed })
    expect(computeCompatibilityEvaluationEvidenceDigest(body)).toBe(sealed.evidenceDigest)
    expect(canonicalizeCompatibilityEvaluationEvidence(body)).toContain('sage.compatibility-evaluation-evidence.v1')
  })

  it('uses an independent sorted-key canonical body and rejects unknown or hostile shapes', () => {
    const body = fixtureBody()
    const canonical = canonicalizeCompatibilityEvaluationEvidence(body)
    expect(canonical.indexOf('"actionIntentDigest"')).toBeLessThan(canonical.indexOf('"actionScope"'))
    expectFailure(sealCompatibilityEvaluationEvidence({ ...body, unexpected: true }), 'evaluation-invalid')
    expectFailure(sealCompatibilityEvaluationEvidence(new Proxy(body, {})), 'evaluation-invalid')
    expectFailure(sealCompatibilityEvaluationEvidence({ ...body, providerProvenance: [] }), 'evaluation-provider-provenance-invalid')
    expectFailure(sealCompatibilityEvaluationEvidence({ ...body, lifecycleState: 'unknown' }), 'evaluation-invalid')
  })

  it('keeps the v2 stable/full bindings and provenance exact', () => {
    const body = fixtureBody()
    expectFailure(sealCompatibilityEvaluationEvidence({ ...body, targetSemanticDigest: CONTENT_DIGEST }), 'evaluation-invalid')
    expectFailure(sealCompatibilityEvaluationEvidence({ ...body, runtimeDescriptorDigest: TARGET_SEMANTIC_DIGEST }), 'evaluation-invalid')
    expectFailure(sealCompatibilityEvaluationEvidence({
      ...body,
      matrixArtifact: { ...body.matrixArtifact, canonicalBytesDigest: 'sha256:not-a-digest' },
    }), 'evaluation-matrix-reference-invalid')
    const sealed = expectSuccess(sealCompatibilityEvaluationEvidence(body))
    expectFailure(parseCompatibilityEvaluationEvidence({ ...sealed, reason: 'tampered' }), 'evaluation-digest-mismatch')
  })

  it('strictly replays the historical matrix without using a current provider', () => {
    const evidence = expectSuccess(sealCompatibilityEvaluationEvidence(fixtureBody()))
    const replay = expectSuccess(strictReplayCompatibilityEvaluationEvidence({
      evidence,
      historicalMatrix: fixtureHistoricalMatrix(),
    }))
    expect(replay.kind).toBe('historical-verified')
    expect(replay.matrixId).toBe(evidence.matrixArtifact.matrixId)
    expect(replay.matchedRuleId).toBe(evidence.matchedRuleId)
    expect(replay.outcome).toBe(evidence.outcome)
    expect(Object.isFrozen(replay)).toBe(true)
  })

  it('fails closed on historical bytes, rule, reason, lifecycle and revocation drift', () => {
    const evidence = expectSuccess(sealCompatibilityEvaluationEvidence(fixtureBody()))
    const history = fixtureHistoricalMatrix()
    expectFailure(strictReplayCompatibilityEvaluationEvidence({
      evidence,
      historicalMatrix: { ...history, canonicalBytes: history.canonicalBytes.replace('exact-match', 'tampered-match') },
    }), 'evaluation-matrix-digest-mismatch')

    const wrongRuleEvidence = expectSuccess(sealCompatibilityEvaluationEvidence({
      ...fixtureBody(),
      matchedRuleId: 'rule:sage.other',
    }))
    expectFailure(strictReplayCompatibilityEvaluationEvidence({ evidence: wrongRuleEvidence, historicalMatrix: history }), 'evaluation-rule-mismatch')

    const wrongReasonEvidence = expectSuccess(sealCompatibilityEvaluationEvidence({
      ...fixtureBody(),
      reason: 'A different historical reason.',
    }))
    expectFailure(strictReplayCompatibilityEvaluationEvidence({ evidence: wrongReasonEvidence, historicalMatrix: history }), 'evaluation-reason-mismatch')

    const purgedEvidence = expectSuccess(sealCompatibilityEvaluationEvidence({
      ...fixtureBody(),
      lifecycleState: 'purged',
    }))
    expectFailure(strictReplayCompatibilityEvaluationEvidence({ evidence: purgedEvidence, historicalMatrix: history }), 'evaluation-historical-artifact-unavailable')
  })

  it('rejects revocation before evaluation and matrix expiry', () => {
    const evidence = expectSuccess(sealCompatibilityEvaluationEvidence(fixtureBody()))
    const history = fixtureHistoricalMatrix()
    const revokedSourceBody: CompatibilityMatrixRevocationSourceBodyV2 = {
      schemaVersion: 'sage.compatibility-matrix-revocation-source.v2',
      canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2',
      createdAt: '2026-09-29T00:00:00.000Z',
      sourceProvenanceDigest: CONTENT_DIGEST,
      entries: [{
        matrixId: history.matrixId,
        revokedAt: '2026-09-29T02:00:00.000Z',
        reasonCode: 'policy-revoked',
        provenanceDigest: CONTENT_DIGEST,
      }],
    }
    const revokedSourceResult = sealCompatibilityMatrixRevocationSourceV2(revokedSourceBody)
    if (!revokedSourceResult.ok) throw new Error(`Fixture revoked source failed: ${revokedSourceResult.code}`)
    const revokedEvidence = expectSuccess(sealCompatibilityEvaluationEvidence({
      ...fixtureBody(),
      revocationSource: {
        ...fixtureBody().revocationSource,
        sourceId: revokedSourceResult.value.sourceId,
        sourceProvenanceDigest: revokedSourceResult.value.sourceProvenanceDigest,
        sourceLineageDigest: lineageDigest(revokedSourceResult.value.sourceId, null),
      },
    }))
    expectFailure(strictReplayCompatibilityEvaluationEvidence({
      evidence: revokedEvidence,
      historicalMatrix: { ...history, revocationSource: revokedSourceResult.value },
    }), 'evaluation-matrix-revoked')
  })

  it('keeps the production import boundary free of I/O and current-time access', () => {
    const kernel = createCompatibilityEvaluationEvidenceKernel()
    expect(Object.isFrozen(kernel)).toBe(true)
    const source = readFileSync(resolve(import.meta.dirname, '../src/security/compatibility-evaluation-evidence.ts'), 'utf8')
    expect(source).not.toMatch(/from ['"]node:(fs|net|child_process|http|https)['"]/u)
    expect(source).not.toMatch(/\b(?:fetch|process|globalThis|new Date\s*\(|Date\.now\s*\()/u)
  })
})
