import { createHash } from 'node:crypto'

import {
  canonicalizeCompatibilityEvaluationEvidence,
  parseCompatibilityEvaluationEvidence,
  sealCompatibilityEvaluationEvidence,
  strictReplayCompatibilityEvaluationEvidence,
  type CompatibilityEvaluationEvidenceLifecycleStateV1,
  type CompatibilityEvaluationEvidenceV1,
  type CompatibilityEvaluationHistoricalMatrixV1,
  type CompatibilityEvaluationStrictReplayV1,
} from '../security/compatibility-evaluation-evidence.js'
import {
  canonicalizeCompatibilityMatrixRevocationSourceV2,
  parseCompatibilityMatrixRevocationSourceV2,
  type CompatibilityMatrixRevocationSourceV2,
} from '../security/compatibility-matrix-provider.js'

export type CompatibilityEvaluationEvidencePersistenceFailureCodeV1 =
  | 'compatibility-evidence-invalid'
  | 'compatibility-evidence-corrupt'
  | 'compatibility-evidence-unavailable'
  | 'compatibility-evidence-not-found'
  | 'compatibility-evidence-conflict'
  | 'compatibility-evidence-legal-hold'
  | 'compatibility-evidence-invalid-transition'
  | 'compatibility-evidence-purged'
  | 'compatibility-evidence-operation-conflict'

export type CompatibilityEvaluationEvidencePersistenceResultV1<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: CompatibilityEvaluationEvidencePersistenceFailureCodeV1
    readonly reason: string
  }>

export interface CompatibilityEvaluationEvidencePersistenceInputV1 {
  readonly evidence: CompatibilityEvaluationEvidenceV1
  readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
}

export interface PreparedCompatibilityEvaluationEvidenceV1
  extends CompatibilityEvaluationEvidencePersistenceInputV1 {
  readonly evidenceCanonicalBytes: string
  readonly matrixCanonicalBytes: string
  readonly revocationSourceCanonicalBytes: string
  readonly strictReplay: CompatibilityEvaluationStrictReplayV1
}

export interface CompatibilityEvaluationEvidenceRecordV1
  extends Omit<PreparedCompatibilityEvaluationEvidenceV1, 'strictReplay'> {
  readonly strictReplay?: CompatibilityEvaluationStrictReplayV1
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CompatibilityEvaluationEvidenceLoadV1 {
  readonly kind: 'loaded'
  readonly record: CompatibilityEvaluationEvidenceRecordV1
}

export type CompatibilityEvaluationEvidenceLoadResultV1 =
  | Readonly<{ readonly kind: 'not-found' }>
  | CompatibilityEvaluationEvidenceLoadV1
  | Readonly<{
    readonly kind: 'blocked'
    readonly reason:
      | 'corrupt'
      | 'unsupported-schema'
      | 'io-unavailable'
      | 'purged'
  }>

export interface CompatibilityEvaluationEvidenceExportV1 {
  readonly schemaVersion: 'sage.compatibility-evaluation-evidence-export.v1'
  readonly evidence: CompatibilityEvaluationEvidenceV1
  readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly exportedAt: string
  readonly exportOperationId: string
  readonly exportDigest: string
  readonly currentAuthorizationStatement: 'not-current-authorization'
}

export type CompatibilityEvaluationEvidenceOperationResultV1<T> =
  | Readonly<{ readonly kind: 'completed'; readonly value: T }>
  | Readonly<{ readonly kind: 'replayed'; readonly value: T }>
  | Readonly<{
    readonly kind: 'blocked'
    readonly code: CompatibilityEvaluationEvidencePersistenceFailureCodeV1
  }>

export interface CompatibilityEvaluationEvidenceLifecycleResultV1 {
  readonly evaluationId: string
  readonly operationId: string
  readonly previousState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
}

export interface CompatibilityEvaluationEvidencePurgeResultV1
  extends CompatibilityEvaluationEvidenceLifecycleResultV1 {
  readonly purgedBytes: true
}

export interface CompatibilityEvaluationEvidenceRestoreResultV1 {
  readonly evaluationId: string
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly evidenceDigest: string
}

export interface CompatibilityEvaluationEvidencePortV1 {
  load(evaluationId: string): CompatibilityEvaluationEvidenceLoadResultV1
  exportEvidence(input: {
    readonly evaluationId: string
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceExportV1>
  restoreEvidence(input: {
    readonly bundle: unknown
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceRestoreResultV1>
  transitionLifecycle(input: {
    readonly evaluationId: string
    readonly operationId: string
    readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceLifecycleResultV1>
  purgeEvidence(input: {
    readonly evaluationId: string
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidencePurgeResultV1>
}

const EXPORT_SCHEMA_VERSION = 'sage.compatibility-evaluation-evidence-export.v1'
const EXPORT_DIGEST_NAMESPACE = 'urn:sage:compatibility-evaluation-export:sha256:'
const OPERATION_ID = /^operation:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const LIFECYCLE_STATES: readonly CompatibilityEvaluationEvidenceLifecycleStateV1[] = [
  'active',
  'retention-expired',
  'legal-hold',
  'deletion-pending',
  'purged',
]

const FAILURE_REASONS: Readonly<
  Record<CompatibilityEvaluationEvidencePersistenceFailureCodeV1, string>
> = {
  'compatibility-evidence-invalid': 'The compatibility evaluation evidence persistence input is invalid.',
  'compatibility-evidence-corrupt': 'The persisted compatibility evaluation evidence is corrupt.',
  'compatibility-evidence-unavailable': 'The compatibility evaluation evidence is unavailable.',
  'compatibility-evidence-not-found': 'The compatibility evaluation evidence was not found.',
  'compatibility-evidence-conflict': 'The compatibility evaluation evidence conflicts with an existing record.',
  'compatibility-evidence-legal-hold': 'The compatibility evaluation evidence is protected by legal hold.',
  'compatibility-evidence-invalid-transition': 'The compatibility evaluation evidence lifecycle transition is invalid.',
  'compatibility-evidence-purged': 'The compatibility evaluation evidence has been purged.',
  'compatibility-evidence-operation-conflict': 'The evidence operation id was already used for another request.',
}

function failure<T>(
  code: CompatibilityEvaluationEvidencePersistenceFailureCodeV1,
): CompatibilityEvaluationEvidencePersistenceResultV1<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function isUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_TIMESTAMP.test(value)) return false
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return false
  const normalized = value.includes('.') ? value : value.replace(/Z$/u, '.000Z')
  return new Date(timestamp).toISOString() === normalized
}

function canonicalExportBody(input: {
  readonly evidence: CompatibilityEvaluationEvidenceV1
  readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly exportedAt: string
  readonly exportOperationId: string
}): string {
  return JSON.stringify({
    schemaVersion: EXPORT_SCHEMA_VERSION,
    evidence: input.evidence,
    historicalMatrix: input.historicalMatrix,
    lifecycleState: input.lifecycleState,
    exportedAt: input.exportedAt,
    exportOperationId: input.exportOperationId,
    currentAuthorizationStatement: 'not-current-authorization',
  })
}

function computeExportDigest(body: string): string {
  return `${EXPORT_DIGEST_NAMESPACE}${createHash('sha256').update(body, 'utf8').digest('hex')}`
}

function parseExport(value: unknown):
  | { readonly ok: true; readonly value: CompatibilityEvaluationEvidenceExportV1 }
  | { readonly ok: false } {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false }
    const record = value as Record<string, unknown>
    if (
      record.schemaVersion !== EXPORT_SCHEMA_VERSION
      || record.currentAuthorizationStatement !== 'not-current-authorization'
      || typeof record.exportedAt !== 'string'
      || !isUtcTimestamp(record.exportedAt)
      || typeof record.exportOperationId !== 'string'
      || !OPERATION_ID.test(record.exportOperationId)
      || typeof record.exportDigest !== 'string'
      || !/^urn:sage:compatibility-evaluation-export:sha256:[0-9a-f]{64}$/u.test(record.exportDigest)
      || !LIFECYCLE_STATES.includes(record.lifecycleState as CompatibilityEvaluationEvidenceLifecycleStateV1)
    ) return { ok: false }

    const evidence = parseCompatibilityEvaluationEvidence(record.evidence)
    if (!evidence.ok) return { ok: false }
    const historicalMatrix = record.historicalMatrix
    const replay = strictReplayCompatibilityEvaluationEvidence({
      evidence: evidence.value,
      historicalMatrix,
    })
    if (!replay.ok) return { ok: false }
    const body = canonicalExportBody({
      evidence: evidence.value,
      historicalMatrix: historicalMatrix as CompatibilityEvaluationHistoricalMatrixV1,
      lifecycleState: record.lifecycleState as CompatibilityEvaluationEvidenceLifecycleStateV1,
      exportedAt: record.exportedAt,
      exportOperationId: record.exportOperationId,
    })
    if (computeExportDigest(body) !== record.exportDigest) return { ok: false }
    return {
      ok: true,
      value: Object.freeze({
        schemaVersion: EXPORT_SCHEMA_VERSION,
        evidence: evidence.value,
        historicalMatrix: historicalMatrix as CompatibilityEvaluationHistoricalMatrixV1,
        lifecycleState: record.lifecycleState as CompatibilityEvaluationEvidenceLifecycleStateV1,
        exportedAt: record.exportedAt,
        exportOperationId: record.exportOperationId,
        exportDigest: record.exportDigest,
        currentAuthorizationStatement: 'not-current-authorization' as const,
      }),
    }
  } catch {
    return { ok: false }
  }
}

export function prepareCompatibilityEvaluationEvidence(
  input: unknown,
): CompatibilityEvaluationEvidencePersistenceResultV1<PreparedCompatibilityEvaluationEvidenceV1> {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return failure('compatibility-evidence-invalid')
    }
    const record = input as Record<string, unknown>
    const evidenceResult = parseCompatibilityEvaluationEvidence(record.evidence)
    if (!evidenceResult.ok) return failure('compatibility-evidence-invalid')
    const historicalMatrix = record.historicalMatrix as CompatibilityEvaluationHistoricalMatrixV1
    const replay = strictReplayCompatibilityEvaluationEvidence({
      evidence: evidenceResult.value,
      historicalMatrix,
    })
    if (!replay.ok) return failure('compatibility-evidence-invalid')
    const { evidenceDigest: _evidenceDigest, ...body } = evidenceResult.value
    const evidenceCanonicalBytes = canonicalizeCompatibilityEvaluationEvidence(body)
    const revocationSourceResult = parseCompatibilityMatrixRevocationSourceV2(
      historicalMatrix.revocationSource,
    )
    if (!revocationSourceResult.ok) return failure('compatibility-evidence-invalid')
    const revocationSourceCanonicalBytes = canonicalizeCompatibilityMatrixRevocationSourceV2(
      revocationSourceResult.value,
    )
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        evidence: evidenceResult.value,
        historicalMatrix: Object.freeze({
          ...historicalMatrix,
          revocationSource: revocationSourceResult.value,
        }),
        evidenceCanonicalBytes,
        matrixCanonicalBytes: historicalMatrix.canonicalBytes,
        revocationSourceCanonicalBytes,
        strictReplay: replay.value,
      }),
    })
  } catch {
    return failure('compatibility-evidence-invalid')
  }
}

export function createCompatibilityEvaluationEvidenceExport(input: {
  readonly record: CompatibilityEvaluationEvidenceRecordV1
  readonly operationId: string
}): CompatibilityEvaluationEvidencePersistenceResultV1<CompatibilityEvaluationEvidenceExportV1> {
  if (!OPERATION_ID.test(input.operationId) || !isUtcTimestamp(input.record.updatedAt)) {
    return failure('compatibility-evidence-invalid')
  }
  const body = canonicalExportBody({
    evidence: input.record.evidence,
    historicalMatrix: input.record.historicalMatrix,
    lifecycleState: input.record.lifecycleState,
    exportedAt: input.record.updatedAt,
    exportOperationId: input.operationId,
  })
  return Object.freeze({
    ok: true as const,
    value: Object.freeze({
      schemaVersion: EXPORT_SCHEMA_VERSION,
      evidence: input.record.evidence,
      historicalMatrix: input.record.historicalMatrix,
      lifecycleState: input.record.lifecycleState,
      exportedAt: input.record.updatedAt,
      exportOperationId: input.operationId,
      exportDigest: computeExportDigest(body),
      currentAuthorizationStatement: 'not-current-authorization' as const,
    }),
  })
}

export function parseCompatibilityEvaluationEvidenceExport(
  value: unknown,
): CompatibilityEvaluationEvidencePersistenceResultV1<CompatibilityEvaluationEvidenceExportV1> {
  const result = parseExport(value)
  return result.ok ? result : failure('compatibility-evidence-invalid')
}

export function compatibilityEvaluationEvidenceFailureReason(
  code: CompatibilityEvaluationEvidencePersistenceFailureCodeV1,
): string {
  return FAILURE_REASONS[code]
}

export function isCompatibilityEvaluationEvidenceLifecycleState(
  value: unknown,
): value is CompatibilityEvaluationEvidenceLifecycleStateV1 {
  return typeof value === 'string' && LIFECYCLE_STATES.includes(value as CompatibilityEvaluationEvidenceLifecycleStateV1)
}

export function isCompatibilityEvaluationEvidenceOperationId(value: unknown): value is string {
  return typeof value === 'string' && OPERATION_ID.test(value)
}

export function isCompatibilityEvaluationEvidenceUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && isUtcTimestamp(value)
}

export function parsePersistedCompatibilityEvaluationEvidence(input: {
  readonly evidenceCanonicalBytes: string
  readonly matrixCanonicalBytes: string
  readonly revocationSourceCanonicalBytes: string
  readonly lifecycleState: unknown
  readonly createdAt: unknown
  readonly updatedAt: unknown
}): CompatibilityEvaluationEvidencePersistenceResultV1<
  Omit<CompatibilityEvaluationEvidenceRecordV1, 'evidence' | 'historicalMatrix' | 'strictReplay'>
  & {
    readonly evidence: CompatibilityEvaluationEvidenceV1
    readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
  readonly strictReplay?: CompatibilityEvaluationStrictReplayV1
  }
> {
  try {
    if (
      typeof input.evidenceCanonicalBytes !== 'string'
      || typeof input.matrixCanonicalBytes !== 'string'
      || typeof input.revocationSourceCanonicalBytes !== 'string'
      || !isCompatibilityEvaluationEvidenceLifecycleState(input.lifecycleState)
      || !isCompatibilityEvaluationEvidenceUtcTimestamp(input.createdAt)
      || !isCompatibilityEvaluationEvidenceUtcTimestamp(input.updatedAt)
    ) return failure('compatibility-evidence-corrupt')
    const body = JSON.parse(input.evidenceCanonicalBytes) as Record<string, unknown>
    const evidenceBodyResult = parseCompatibilityEvaluationEvidence({
      ...body,
      evidenceDigest: `urn:sage:compatibility-evaluation-evidence:sha256:${createHash('sha256').update(input.evidenceCanonicalBytes, 'utf8').digest('hex')}`,
    })
    if (!evidenceBodyResult.ok) return failure('compatibility-evidence-corrupt')
    const revocationSource = parseCompatibilityMatrixRevocationSourceV2(
      JSON.parse(input.revocationSourceCanonicalBytes),
    )
    if (!revocationSource.ok) return failure('compatibility-evidence-corrupt')
    const historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1 = {
      matrixId: evidenceBodyResult.value.matrixArtifact.matrixId,
      canonicalBytesDigest: evidenceBodyResult.value.matrixArtifact.canonicalBytesDigest,
      artifactReference: evidenceBodyResult.value.matrixArtifact.artifactReference,
      canonicalBytes: input.matrixCanonicalBytes,
      revocationSource: revocationSource.value,
    }
    let strictReplay: CompatibilityEvaluationStrictReplayV1 | undefined
    if (input.lifecycleState === 'deletion-pending') {
      const { evidenceDigest: _evidenceDigest, ...bodyWithoutDigest } = evidenceBodyResult.value
      const replayable = sealCompatibilityEvaluationEvidence({
        ...bodyWithoutDigest,
        lifecycleState: 'active',
      })
      if (!replayable.ok) return failure('compatibility-evidence-corrupt')
      const replay = strictReplayCompatibilityEvaluationEvidence({
        evidence: replayable.value,
        historicalMatrix,
      })
      if (!replay.ok) return failure('compatibility-evidence-corrupt')
      strictReplay = replay.value
    } else {
      const replay = strictReplayCompatibilityEvaluationEvidence({
        evidence: evidenceBodyResult.value,
        historicalMatrix,
      })
      if (!replay.ok) return failure('compatibility-evidence-corrupt')
      strictReplay = replay.value
    }
    return Object.freeze({
      ok: true as const,
      value: Object.freeze({
        evidence: evidenceBodyResult.value,
        historicalMatrix: Object.freeze(historicalMatrix),
        evidenceCanonicalBytes: input.evidenceCanonicalBytes,
        matrixCanonicalBytes: input.matrixCanonicalBytes,
        revocationSourceCanonicalBytes: input.revocationSourceCanonicalBytes,
        lifecycleState: input.lifecycleState,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        ...(strictReplay === undefined ? {} : { strictReplay }),
      }),
    })
  } catch {
    return failure('compatibility-evidence-corrupt')
  }
}

export function makeCompatibilityEvaluationEvidenceOperationReceipt(input: {
  readonly operationId: string
  readonly evaluationId: string
  readonly operation: 'export' | 'restore' | 'transition' | 'purge' | 'recovery'
  readonly state: CompatibilityEvaluationEvidenceLifecycleStateV1 | 'completed'
  readonly occurredAt: string
}): string {
  return JSON.stringify({
    schemaVersion: 'sage.compatibility-evaluation-evidence-operation-receipt.v1',
    operationId: input.operationId,
    evaluationId: input.evaluationId,
    operation: input.operation,
    state: input.state,
    occurredAt: input.occurredAt,
  })
}

export function parseCompatibilityEvaluationEvidenceExportForRestore(
  value: unknown,
): CompatibilityEvaluationEvidencePersistenceResultV1<CompatibilityEvaluationEvidenceExportV1> {
  return parseCompatibilityEvaluationEvidenceExport(value)
}

export const COMPATIBILITY_EVALUATION_EVIDENCE_SCHEMA_VERSION =
  'sage.compatibility-evaluation-evidence.v1' as const
