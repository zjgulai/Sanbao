/** T05-mid step 9 support (ADR-0288): build the persistable compatibility evaluation evidence
 *  from the exact facts the admitted chain resolved.
 *
 *  Field mapping (each value's home, none invented):
 *  - canonicalBytesDigest / artifactReference: sha256 of the canonical matrix bytes the provider
 *    returned; the artifactReference urn keeps the same hash (fixture-established forma).
 *  - reasonCode / reason: the matched rule inside those canonical bytes (the same rule the C2
 *    kernel just matched).
 *  - matrixProviderProvenanceDigest: the resolution binding's own field.
 *  - inventoryProviderProvenanceDigest: the inventory evidence's mainObservationProvenanceDigest —
 *    the main-owned observation provenance that produced the admitted inventory.
 *  - sourceLineageDigest: sha256 of `{sourceId, supersedesSourceId|null}` — the forma the
 *    evidence codec's own test fixture establishes; the shipped revocation source supersedes
 *    nothing (null).
 *  - lifecycleState: 'active' — retention / hold transitions belong to the store's lifecycle
 *    port, never to creation.
 *
 *  The builder seals through the codec; anything malformed stays unbuilt (persist then answers
 *  unavailable). It performs no I/O and reads no clock.
 */
import { createHash } from 'node:crypto'

import {
  sealCompatibilityEvaluationEvidence,
  type CompatibilityEvaluationEvidenceBodyV1,
  type CompatibilityEvaluationEvidenceV1,
  type CompatibilityEvaluationHistoricalMatrixV1,
} from '../security/compatibility-evaluation-evidence.js'
import {
  type CompatibilityMatrixProviderAvailableV2,
  type CompatibilityMatrixRevocationSourceV2,
} from '../security/compatibility-matrix-provider.js'

export interface SessionPromptEvaluationEvidenceInput {
  readonly evaluationId: string
  readonly attemptId: string
  readonly matterId: string
  readonly revisionId: string
  readonly revisionDigest: string
  readonly actionScope: string
  readonly actionIntentDigest: string
  readonly targetSemanticDigest: string
  readonly targetEvidenceDigest: string
  readonly runtimeDescriptorDigest: string
  readonly inventoryEvidenceDigest: string
  readonly inventoryProviderProvenanceDigest: string
  readonly targetProviderProvenanceDigest: string
  readonly matrixResult: CompatibilityMatrixProviderAvailableV2
  readonly matchedRuleId: string
  readonly matrixProviderProvenanceDigest: string
  readonly evaluatedAt: string
  readonly revocationSource: CompatibilityMatrixRevocationSourceV2
}

export type SessionPromptEvaluationEvidenceBuild =
  | {
      readonly ok: true
      readonly evidence: CompatibilityEvaluationEvidenceV1
      readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
    }
  | { readonly ok: false; readonly reason: string }

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** The canonical-matrix artifact forma: one hash, two namespaces. Single home — the evidence
 *  builder and the persist step's historical-matrix assembly must never disagree. */
export function matrixBytesReference(canonicalBytes: string): {
  readonly canonicalBytesDigest: string
  readonly artifactReference: string
} {
  const hex = sha256Hex(canonicalBytes)
  return {
    canonicalBytesDigest: `sha256:${hex}`,
    artifactReference: `urn:sage:compatibility-matrix-artifact:sha256:${hex}`,
  }
}

/** The matched rule's reason face, read back from the exact canonical bytes the provider
 *  returned (the kernel matched inside the same bytes moments ago). */
function matchedRuleReason(
  canonicalMatrix: string,
  matchedRuleId: string,
): { readonly reasonCode: string, readonly reason: string } | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(canonicalMatrix)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const rules = (parsed as { rules?: unknown }).rules
  if (!Array.isArray(rules)) return undefined
  const rule = rules.find((candidate) =>
    typeof candidate === 'object' && candidate !== null
    && (candidate as { ruleId?: unknown }).ruleId === matchedRuleId)
  if (rule === undefined) return undefined
  const record = rule as { reasonCode?: unknown, reason?: unknown }
  if (typeof record.reasonCode !== 'string' || typeof record.reason !== 'string') return undefined
  return { reasonCode: record.reasonCode, reason: record.reason }
}

export function buildSessionPromptEvaluationEvidence(
  input: SessionPromptEvaluationEvidenceInput,
): SessionPromptEvaluationEvidenceBuild {
  const reason = matchedRuleReason(input.matrixResult.canonicalMatrix, input.matchedRuleId)
  if (reason === undefined) return { ok: false, reason: 'the matched rule is not in the canonical matrix bytes' }

  const { canonicalBytesDigest, artifactReference } = matrixBytesReference(input.matrixResult.canonicalMatrix)
  const sourceLineageDigest = `sha256:${sha256Hex(JSON.stringify({
    sourceId: input.revocationSource.sourceId,
    supersedesSourceId: input.revocationSource.supersedesSourceId ?? null,
  }))}`

  const body: CompatibilityEvaluationEvidenceBodyV1 = {
    schemaVersion: 'sage.compatibility-evaluation-evidence.v1',
    canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
    evaluationId: input.evaluationId,
    attemptId: input.attemptId,
    matterId: input.matterId,
    revisionId: input.revisionId,
    revisionDigest: input.revisionDigest,
    actionScope: input.actionScope,
    actionIntentDigest: input.actionIntentDigest,
    targetSemanticDigest: input.targetSemanticDigest,
    targetEvidenceDigest: input.targetEvidenceDigest,
    runtimeDescriptorDigest: input.runtimeDescriptorDigest,
    inventoryEvidenceDigest: input.inventoryEvidenceDigest,
    matrixArtifact: {
      schemaVersion: 'sage.compatibility-evaluation-matrix-artifact-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      matrixId: input.matrixResult.matrixId,
      canonicalBytesDigest,
      artifactReference,
    },
    matchedRuleId: input.matchedRuleId,
    outcome: 'equivalent',
    reasonCode: reason.reasonCode,
    reason: reason.reason,
    evaluatedAt: input.evaluatedAt,
    resolverContractVersion: 'sage.compatibility-canonical-json.v2',
    providerProvenance: {
      schemaVersion: 'sage.compatibility-evaluation-provider-provenance.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      targetProviderProvenanceDigest: input.targetProviderProvenanceDigest,
      inventoryProviderProvenanceDigest: input.inventoryProviderProvenanceDigest,
      matrixProviderProvenanceDigest: input.matrixProviderProvenanceDigest,
    },
    revocationSource: {
      schemaVersion: 'sage.compatibility-evaluation-revocation-source-reference.v1',
      canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1',
      sourceId: input.revocationSource.sourceId,
      sourceProvenanceDigest: input.revocationSource.sourceProvenanceDigest,
      sourceLineageDigest,
    },
    lifecycleState: 'active',
  }

  const sealed = sealCompatibilityEvaluationEvidence(body)
  if (!sealed.ok) return { ok: false, reason: `evidence rejected by the kernel: ${sealed.code}: ${sealed.reason}` }

  return {
    ok: true,
    evidence: sealed.value,
    historicalMatrix: {
      matrixId: input.matrixResult.matrixId,
      canonicalBytesDigest,
      artifactReference,
      canonicalBytes: input.matrixResult.canonicalMatrix,
      revocationSource: input.revocationSource,
    },
  }
}
