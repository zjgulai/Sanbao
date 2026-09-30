import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import {
  parseCompatibilityMatrixRevocationSourceV2,
  type CompatibilityMatrixRevocationSourceV2,
} from './compatibility-matrix-provider.js'
import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
} from './compatibility.js'

export type CompatibilityEvaluationEvidenceOutcomeV1 =
  | 'equivalent'
  | 'requires-new-revision'

export type CompatibilityEvaluationEvidenceLifecycleStateV1 =
  | 'active'
  | 'retention-expired'
  | 'legal-hold'
  | 'deletion-pending'
  | 'purged'

export type CompatibilityEvaluationEvidenceFailureCodeV1 =
  | 'evaluation-invalid'
  | 'evaluation-schema-unsupported'
  | 'evaluation-digest-mismatch'
  | 'evaluation-matrix-reference-invalid'
  | 'evaluation-provider-provenance-invalid'
  | 'evaluation-revocation-reference-invalid'
  | 'evaluation-historical-artifact-unavailable'
  | 'evaluation-matrix-artifact-invalid'
  | 'evaluation-matrix-id-mismatch'
  | 'evaluation-matrix-digest-mismatch'
  | 'evaluation-matrix-not-active'
  | 'evaluation-matrix-revoked'
  | 'evaluation-rule-not-found'
  | 'evaluation-rule-mismatch'
  | 'evaluation-outcome-mismatch'
  | 'evaluation-reason-mismatch'

export type CompatibilityEvaluationEvidenceResultV1<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: CompatibilityEvaluationEvidenceFailureCodeV1
    readonly reason: string
  }>

export interface CompatibilityEvaluationMatrixArtifactReferenceV1 {
  readonly schemaVersion: 'sage.compatibility-evaluation-matrix-artifact-reference.v1'
  readonly canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1'
  readonly matrixId: string
  readonly canonicalBytesDigest: string
  readonly artifactReference: string
}

export interface CompatibilityEvaluationRevocationSourceReferenceV1 {
  readonly schemaVersion: 'sage.compatibility-evaluation-revocation-source-reference.v1'
  readonly canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1'
  readonly sourceId: string
  readonly sourceProvenanceDigest: string
  readonly sourceLineageDigest: string
}

export interface CompatibilityEvaluationProviderProvenanceV1 {
  readonly schemaVersion: 'sage.compatibility-evaluation-provider-provenance.v1'
  readonly canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1'
  readonly targetProviderProvenanceDigest: string
  readonly inventoryProviderProvenanceDigest: string
  readonly matrixProviderProvenanceDigest: string
}

export interface CompatibilityEvaluationEvidenceBodyV1 {
  readonly schemaVersion: 'sage.compatibility-evaluation-evidence.v1'
  readonly canonicalizationVersion: 'sage.compatibility-evaluation-evidence-canonical-json.v1'
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
  readonly matrixArtifact: CompatibilityEvaluationMatrixArtifactReferenceV1
  readonly matchedRuleId: string
  readonly outcome: CompatibilityEvaluationEvidenceOutcomeV1
  readonly reasonCode: string
  readonly reason: string
  readonly evaluatedAt: string
  readonly resolverContractVersion: 'sage.compatibility-canonical-json.v2'
  readonly providerProvenance: CompatibilityEvaluationProviderProvenanceV1
  readonly revocationSource: CompatibilityEvaluationRevocationSourceReferenceV1
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
}

export interface CompatibilityEvaluationEvidenceV1 extends CompatibilityEvaluationEvidenceBodyV1 {
  readonly evidenceDigest: string
}

export interface CompatibilityEvaluationHistoricalMatrixV1 {
  readonly matrixId: string
  readonly canonicalBytesDigest: string
  readonly artifactReference: string
  readonly canonicalBytes: string
  readonly revocationSource: CompatibilityMatrixRevocationSourceV2
}

export interface CompatibilityEvaluationStrictReplayInputV1 {
  readonly evidence: CompatibilityEvaluationEvidenceV1
  readonly historicalMatrix: CompatibilityEvaluationHistoricalMatrixV1
}

export interface CompatibilityEvaluationStrictReplayV1 {
  readonly kind: 'historical-verified'
  readonly evidence: CompatibilityEvaluationEvidenceV1
  readonly matrixId: string
  readonly matchedRuleId: string
  readonly outcome: CompatibilityEvaluationEvidenceOutcomeV1
  readonly reasonCode: string
  readonly reason: string
}

export interface CompatibilityEvaluationEvidenceKernelV1 {
  readonly canonicalize: (value: unknown) => string
  readonly computeDigest: (value: unknown) => string
  readonly seal: (
    value: unknown,
  ) => CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationEvidenceV1>
  readonly parse: (
    value: unknown,
  ) => CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationEvidenceV1>
  readonly strictReplay: (
    value: unknown,
  ) => CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationStrictReplayV1>
}

const EVIDENCE_SCHEMA_VERSION = 'sage.compatibility-evaluation-evidence.v1'
const MATRIX_ARTIFACT_SCHEMA_VERSION = 'sage.compatibility-evaluation-matrix-artifact-reference.v1'
const REVOCATION_REFERENCE_SCHEMA_VERSION = 'sage.compatibility-evaluation-revocation-source-reference.v1'
const PROVENANCE_SCHEMA_VERSION = 'sage.compatibility-evaluation-provider-provenance.v1'
const CANONICALIZATION_VERSION = 'sage.compatibility-evaluation-evidence-canonical-json.v1'
const RESOLVER_CONTRACT_VERSION = 'sage.compatibility-canonical-json.v2'
const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/u
const EVIDENCE_DIGEST = /^urn:sage:compatibility-evaluation-evidence:sha256:[0-9a-f]{64}$/u
const MATRIX_ID = /^urn:sage:compatibility-matrix:sha256:[0-9a-f]{64}$/u
const MATRIX_ARTIFACT_REFERENCE = /^urn:sage:compatibility-matrix-artifact:sha256:[0-9a-f]{64}$/u
const REVOCATION_SOURCE_ID = /^urn:sage:compatibility-matrix-revocation-source:sha256:[0-9a-f]{64}$/u
const TARGET_SEMANTIC_DIGEST = /^urn:sage:target-semantic:sha256:[0-9a-f]{64}$/u
const TARGET_EVIDENCE_DIGEST = /^urn:sage:target-evidence:sha256:[0-9a-f]{64}$/u
const RUNTIME_DESCRIPTOR_DIGEST = /^urn:sage:runtime-descriptor:sha256:[0-9a-f]{64}$/u
const INVENTORY_EVIDENCE_DIGEST = /^urn:sage:inventory-evidence:sha256:[0-9a-f]{64}$/u
const EVALUATION_ID = /^evaluation:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const ATTEMPT_ID = /^attempt:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const ACTION_SCOPE = /^[a-z][a-z0-9._:-]{0,127}$/u
const RULE_ID = /^[a-z][a-z0-9._:-]{0,127}$/u
const REASON_CODE = /^[a-z][a-z0-9._-]{0,63}$/u
const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,255}$/u
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const MAX_REASON_LENGTH = 1_024
const MAX_MATRIX_BYTES = 4_000_000
const MAX_REVOCATIONS = 1_024
const LIFECYCLE_STATES: readonly CompatibilityEvaluationEvidenceLifecycleStateV1[] = [
  'active',
  'retention-expired',
  'legal-hold',
  'deletion-pending',
  'purged',
]

const FAILURE_REASONS: Readonly<Record<CompatibilityEvaluationEvidenceFailureCodeV1, string>> = {
  'evaluation-invalid': 'The compatibility evaluation evidence is invalid.',
  'evaluation-schema-unsupported': 'The compatibility evaluation evidence schema is unsupported.',
  'evaluation-digest-mismatch': 'The compatibility evaluation evidence digest does not match its canonical content.',
  'evaluation-matrix-reference-invalid': 'The compatibility evaluation matrix reference is invalid.',
  'evaluation-provider-provenance-invalid': 'The compatibility evaluation provider provenance is invalid.',
  'evaluation-revocation-reference-invalid': 'The compatibility evaluation revocation source reference is invalid.',
  'evaluation-historical-artifact-unavailable': 'The historical compatibility matrix artifact is unavailable.',
  'evaluation-matrix-artifact-invalid': 'The historical compatibility matrix artifact is invalid.',
  'evaluation-matrix-id-mismatch': 'The historical compatibility matrix identifier does not match its canonical bytes.',
  'evaluation-matrix-digest-mismatch': 'The historical compatibility matrix bytes digest does not match its content.',
  'evaluation-matrix-not-active': 'The historical compatibility matrix was not active at the evaluation instant.',
  'evaluation-matrix-revoked': 'The historical compatibility matrix was revoked before the evaluation instant.',
  'evaluation-rule-not-found': 'The historical compatibility matrix has no matching rule.',
  'evaluation-rule-mismatch': 'The historical compatibility matrix rule does not match the evidence.',
  'evaluation-outcome-mismatch': 'The historical matrix outcome does not match the evidence.',
  'evaluation-reason-mismatch': 'The historical matrix reason does not match the evidence.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly code: CompatibilityEvaluationEvidenceFailureCodeV1 }>

interface ParsedTimestamp {
  readonly text: string
  readonly milliseconds: number
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hashUrn(namespace: string, canonical: string): string {
  return `urn:sage:${namespace}:sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

function contentDigest(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) freezeDeep(descriptor.value)
  }
  return Object.freeze(value)
}

function success<T>(value: T): CompatibilityEvaluationEvidenceResultV1<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: CompatibilityEvaluationEvidenceFailureCodeV1): CompatibilityEvaluationEvidenceResultV1<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function parsed<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function rejected<T>(code: CompatibilityEvaluationEvidenceFailureCodeV1): ParseResult<T> {
  return { ok: false, code }
}

function inspectPlainRecord(value: unknown): PlainRecordSnapshot | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some((key) => typeof key !== 'string')) return undefined
    const values: Record<string, unknown> = Object.create(null)
    const names: string[] = []
    for (const key of keys) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
        return undefined
      }
      names.push(key)
      values[key] = descriptor.value
    }
    return { values, keys: names }
  } catch {
    return undefined
  }
}

function exactRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): Readonly<Record<string, unknown>> | undefined {
  const snapshot = inspectPlainRecord(value)
  if (snapshot === undefined) return undefined
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (
    requiredKeys.some((key) => !snapshot.keys.includes(key)) ||
    snapshot.keys.some((key) => !allowed.has(key))
  ) return undefined
  return snapshot.values
}

function exactArray(value: unknown, maxLength: number): readonly unknown[] | undefined {
  return Array.isArray(value) && value.length <= maxLength ? value : undefined
}

function exactString(value: unknown, pattern?: RegExp, maxLength = 256): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    return undefined
  }
  return pattern !== undefined && !pattern.test(value) ? undefined : value
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function parseTimestamp(value: unknown): ParsedTimestamp | undefined {
  const text = exactString(value, ISO_UTC_TIMESTAMP, 24)
  if (text === undefined) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/u.exec(text)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const milliseconds = Number(match[7] ?? '0')
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (
    daysInMonth === undefined ||
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth ||
    hour > 23 || minute > 59 || second > 59
  ) return undefined
  const utcMilliseconds = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds)
  return Number.isFinite(utcMilliseconds) ? { text, milliseconds: utcMilliseconds } : undefined
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((member) => canonicalJson(member)).join(',')}]`
  if (typeof value !== 'object' || value === null) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Canonical value is invalid.')
    return encoded
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function parseContentDigest(value: unknown): string | undefined {
  return exactString(value, SHA256_DIGEST, 71)
}

function parseUrn(value: unknown, pattern: RegExp): string | undefined {
  return exactString(value, pattern, 160)
}

function parseMatrixArtifactReference(value: unknown): ParseResult<CompatibilityEvaluationMatrixArtifactReferenceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'matrixId',
    'canonicalBytesDigest',
    'artifactReference',
  ])
  const matrixId = record === undefined ? undefined : parseUrn(record.matrixId, MATRIX_ID)
  const canonicalBytesDigest = record === undefined ? undefined : parseContentDigest(record.canonicalBytesDigest)
  const artifactReference = record === undefined ? undefined : parseUrn(record.artifactReference, MATRIX_ARTIFACT_REFERENCE)
  if (
    record === undefined ||
    record.schemaVersion !== MATRIX_ARTIFACT_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    matrixId === undefined ||
    canonicalBytesDigest === undefined ||
    artifactReference === undefined
  ) return rejected('evaluation-matrix-reference-invalid')
  return parsed({
    schemaVersion: MATRIX_ARTIFACT_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    matrixId,
    canonicalBytesDigest,
    artifactReference,
  })
}

function parseProviderProvenance(value: unknown): ParseResult<CompatibilityEvaluationProviderProvenanceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'targetProviderProvenanceDigest',
    'inventoryProviderProvenanceDigest',
    'matrixProviderProvenanceDigest',
  ])
  const target = record === undefined ? undefined : parseContentDigest(record.targetProviderProvenanceDigest)
  const inventory = record === undefined ? undefined : parseContentDigest(record.inventoryProviderProvenanceDigest)
  const matrix = record === undefined ? undefined : parseContentDigest(record.matrixProviderProvenanceDigest)
  if (
    record === undefined ||
    record.schemaVersion !== PROVENANCE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    target === undefined || inventory === undefined || matrix === undefined
  ) return rejected('evaluation-provider-provenance-invalid')
  return parsed({
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    targetProviderProvenanceDigest: target,
    inventoryProviderProvenanceDigest: inventory,
    matrixProviderProvenanceDigest: matrix,
  })
}

function parseRevocationSourceReference(value: unknown): ParseResult<CompatibilityEvaluationRevocationSourceReferenceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'sourceId',
    'sourceProvenanceDigest',
    'sourceLineageDigest',
  ])
  const sourceId = record === undefined ? undefined : parseUrn(record.sourceId, REVOCATION_SOURCE_ID)
  const sourceProvenanceDigest = record === undefined ? undefined : parseContentDigest(record.sourceProvenanceDigest)
  const sourceLineageDigest = record === undefined ? undefined : parseContentDigest(record.sourceLineageDigest)
  if (
    record === undefined ||
    record.schemaVersion !== REVOCATION_REFERENCE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    sourceId === undefined || sourceProvenanceDigest === undefined || sourceLineageDigest === undefined
  ) return rejected('evaluation-revocation-reference-invalid')
  return parsed({
    schemaVersion: REVOCATION_REFERENCE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    sourceId,
    sourceProvenanceDigest,
    sourceLineageDigest,
  })
}

function parseBody(value: unknown): ParseResult<CompatibilityEvaluationEvidenceBodyV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'evaluationId',
    'attemptId',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionScope',
    'actionIntentDigest',
    'targetSemanticDigest',
    'targetEvidenceDigest',
    'runtimeDescriptorDigest',
    'inventoryEvidenceDigest',
    'matrixArtifact',
    'matchedRuleId',
    'outcome',
    'reasonCode',
    'reason',
    'evaluatedAt',
    'resolverContractVersion',
    'providerProvenance',
    'revocationSource',
    'lifecycleState',
  ])
  if (record === undefined) return rejected('evaluation-invalid')
  if (
    record.schemaVersion !== EVIDENCE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION
  ) return rejected('evaluation-schema-unsupported')
  const evaluationId = exactString(record.evaluationId, EVALUATION_ID)
  const attemptId = exactString(record.attemptId, ATTEMPT_ID)
  const matterId = exactString(record.matterId, IDENTIFIER)
  const revisionId = exactString(record.revisionId, IDENTIFIER)
  const revisionDigest = parseContentDigest(record.revisionDigest)
  const actionScope = exactString(record.actionScope, ACTION_SCOPE)
  const actionIntentDigest = parseContentDigest(record.actionIntentDigest)
  const targetSemanticDigest = parseUrn(record.targetSemanticDigest, TARGET_SEMANTIC_DIGEST)
  const targetEvidenceDigest = parseUrn(record.targetEvidenceDigest, TARGET_EVIDENCE_DIGEST)
  const runtimeDescriptorDigest = parseUrn(record.runtimeDescriptorDigest, RUNTIME_DESCRIPTOR_DIGEST)
  const inventoryEvidenceDigest = parseUrn(record.inventoryEvidenceDigest, INVENTORY_EVIDENCE_DIGEST)
  const matchedRuleId = exactString(record.matchedRuleId, RULE_ID)
  const reasonCode = exactString(record.reasonCode, REASON_CODE)
  const reason = exactString(record.reason, undefined, MAX_REASON_LENGTH)
  const evaluatedAt = parseTimestamp(record.evaluatedAt)
  const matrixArtifact = parseMatrixArtifactReference(record.matrixArtifact)
  const providerProvenance = parseProviderProvenance(record.providerProvenance)
  const revocationSource = parseRevocationSourceReference(record.revocationSource)
  const lifecycleState = exactString(record.lifecycleState)
  if (
    evaluationId === undefined || attemptId === undefined || matterId === undefined || revisionId === undefined ||
    revisionDigest === undefined || actionScope === undefined || actionIntentDigest === undefined ||
    targetSemanticDigest === undefined || targetEvidenceDigest === undefined || runtimeDescriptorDigest === undefined ||
    inventoryEvidenceDigest === undefined || matchedRuleId === undefined ||
    (record.outcome !== 'equivalent' && record.outcome !== 'requires-new-revision') ||
    reasonCode === undefined || reason === undefined || evaluatedAt === undefined ||
    record.resolverContractVersion !== RESOLVER_CONTRACT_VERSION ||
    !LIFECYCLE_STATES.includes(lifecycleState as CompatibilityEvaluationEvidenceLifecycleStateV1) ||
    !matrixArtifact.ok || !providerProvenance.ok || !revocationSource.ok
  ) {
    if (matrixArtifact.ok === false) return matrixArtifact
    if (providerProvenance.ok === false) return providerProvenance
    if (revocationSource.ok === false) return revocationSource
    return rejected('evaluation-invalid')
  }
  return parsed({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    evaluationId,
    attemptId,
    matterId,
    revisionId,
    revisionDigest,
    actionScope,
    actionIntentDigest,
    targetSemanticDigest,
    targetEvidenceDigest,
    runtimeDescriptorDigest,
    inventoryEvidenceDigest,
    matrixArtifact: matrixArtifact.value,
    matchedRuleId,
    outcome: record.outcome,
    reasonCode,
    reason,
    evaluatedAt: evaluatedAt.text,
    resolverContractVersion: RESOLVER_CONTRACT_VERSION,
    providerProvenance: providerProvenance.value,
    revocationSource: revocationSource.value,
    lifecycleState: lifecycleState as CompatibilityEvaluationEvidenceLifecycleStateV1,
  })
}

function canonicalBody(body: CompatibilityEvaluationEvidenceBodyV1): CompatibilityEvaluationEvidenceBodyV1 {
  return {
    schemaVersion: body.schemaVersion,
    canonicalizationVersion: body.canonicalizationVersion,
    evaluationId: body.evaluationId,
    attemptId: body.attemptId,
    matterId: body.matterId,
    revisionId: body.revisionId,
    revisionDigest: body.revisionDigest,
    actionScope: body.actionScope,
    actionIntentDigest: body.actionIntentDigest,
    targetSemanticDigest: body.targetSemanticDigest,
    targetEvidenceDigest: body.targetEvidenceDigest,
    runtimeDescriptorDigest: body.runtimeDescriptorDigest,
    inventoryEvidenceDigest: body.inventoryEvidenceDigest,
    matrixArtifact: body.matrixArtifact,
    matchedRuleId: body.matchedRuleId,
    outcome: body.outcome,
    reasonCode: body.reasonCode,
    reason: body.reason,
    evaluatedAt: body.evaluatedAt,
    resolverContractVersion: body.resolverContractVersion,
    providerProvenance: body.providerProvenance,
    revocationSource: body.revocationSource,
    lifecycleState: body.lifecycleState,
  }
}

function parseSealed(value: unknown): ParseResult<CompatibilityEvaluationEvidenceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'evaluationId',
    'attemptId',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionScope',
    'actionIntentDigest',
    'targetSemanticDigest',
    'targetEvidenceDigest',
    'runtimeDescriptorDigest',
    'inventoryEvidenceDigest',
    'matrixArtifact',
    'matchedRuleId',
    'outcome',
    'reasonCode',
    'reason',
    'evaluatedAt',
    'resolverContractVersion',
    'providerProvenance',
    'revocationSource',
    'lifecycleState',
    'evidenceDigest',
  ])
  if (record === undefined) return rejected('evaluation-invalid')
  const body = parseBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    evaluationId: record.evaluationId,
    attemptId: record.attemptId,
    matterId: record.matterId,
    revisionId: record.revisionId,
    revisionDigest: record.revisionDigest,
    actionScope: record.actionScope,
    actionIntentDigest: record.actionIntentDigest,
    targetSemanticDigest: record.targetSemanticDigest,
    targetEvidenceDigest: record.targetEvidenceDigest,
    runtimeDescriptorDigest: record.runtimeDescriptorDigest,
    inventoryEvidenceDigest: record.inventoryEvidenceDigest,
    matrixArtifact: record.matrixArtifact,
    matchedRuleId: record.matchedRuleId,
    outcome: record.outcome,
    reasonCode: record.reasonCode,
    reason: record.reason,
    evaluatedAt: record.evaluatedAt,
    resolverContractVersion: record.resolverContractVersion,
    providerProvenance: record.providerProvenance,
    revocationSource: record.revocationSource,
    lifecycleState: record.lifecycleState,
  })
  if (!body.ok) return body
  const evidenceDigest = parseUrn(record.evidenceDigest, EVIDENCE_DIGEST)
  if (evidenceDigest === undefined) return rejected('evaluation-invalid')
  const expected = hashUrn('compatibility-evaluation-evidence', canonicalJson(canonicalBody(body.value)))
  return evidenceDigest === expected
    ? parsed({ ...body.value, evidenceDigest })
    : rejected('evaluation-digest-mismatch')
}

function parseHistoricalMatrix(value: unknown): ParseResult<CompatibilityEvaluationHistoricalMatrixV1> {
  const record = exactRecord(value, [
    'matrixId',
    'canonicalBytesDigest',
    'artifactReference',
    'canonicalBytes',
    'revocationSource',
  ])
  const matrixId = record === undefined ? undefined : parseUrn(record.matrixId, MATRIX_ID)
  const canonicalBytesDigest = record === undefined ? undefined : parseContentDigest(record.canonicalBytesDigest)
  const artifactReference = record === undefined ? undefined : parseUrn(record.artifactReference, MATRIX_ARTIFACT_REFERENCE)
  const canonicalBytes = record === undefined ? undefined : exactString(record.canonicalBytes, undefined, MAX_MATRIX_BYTES)
  if (record === undefined || matrixId === undefined || canonicalBytesDigest === undefined || artifactReference === undefined || canonicalBytes === undefined) {
    return rejected('evaluation-historical-artifact-unavailable')
  }
  const revocationSource = parseCompatibilityMatrixRevocationSourceV2(record.revocationSource)
  if (!revocationSource.ok) return rejected('evaluation-revocation-reference-invalid')
  return parsed({ matrixId, canonicalBytesDigest, artifactReference, canonicalBytes, revocationSource: revocationSource.value })
}

function parseMatrix(canonicalBytes: string): CompatibilityMatrixV2 | undefined {
  try {
    const decoded: unknown = JSON.parse(canonicalBytes)
    if (canonicalizeCompatibilityMatrixV2(decoded as CompatibilityMatrixV2) !== canonicalBytes) return undefined
    return decoded as CompatibilityMatrixV2
  } catch {
    return undefined
  }
}

function sourceLineageDigest(source: CompatibilityMatrixRevocationSourceV2): string {
  return contentDigest(canonicalJson({
    sourceId: source.sourceId,
    supersedesSourceId: source.supersedesSourceId ?? null,
  }))
}

function replayInternal(value: unknown): ParseResult<CompatibilityEvaluationStrictReplayV1> {
  const record = exactRecord(value, ['evidence', 'historicalMatrix'])
  if (record === undefined) return rejected('evaluation-invalid')
  const evidence = parseSealed(record.evidence)
  if (!evidence.ok) return evidence
  if (evidence.value.lifecycleState === 'purged' || evidence.value.lifecycleState === 'deletion-pending') {
    return rejected('evaluation-historical-artifact-unavailable')
  }
  const historicalMatrix = parseHistoricalMatrix(record.historicalMatrix)
  if (!historicalMatrix.ok) return historicalMatrix
  const artifact = evidence.value.matrixArtifact
  if (
    historicalMatrix.value.matrixId !== artifact.matrixId ||
    historicalMatrix.value.artifactReference !== artifact.artifactReference
  ) return rejected('evaluation-matrix-id-mismatch')
  if (contentDigest(historicalMatrix.value.canonicalBytes) !== historicalMatrix.value.canonicalBytesDigest ||
    historicalMatrix.value.canonicalBytesDigest !== artifact.canonicalBytesDigest) {
    return rejected('evaluation-matrix-digest-mismatch')
  }
  const expectedArtifactReference = hashUrn('compatibility-matrix-artifact', historicalMatrix.value.canonicalBytes)
  if (expectedArtifactReference !== artifact.artifactReference) return rejected('evaluation-matrix-id-mismatch')
  const matrix = parseMatrix(historicalMatrix.value.canonicalBytes)
  if (matrix === undefined) return rejected('evaluation-matrix-artifact-invalid')
  if (computeCompatibilityMatrixIdV2(historicalMatrix.value.canonicalBytes) !== historicalMatrix.value.matrixId) {
    return rejected('evaluation-matrix-id-mismatch')
  }
  if (historicalMatrix.value.revocationSource.sourceId !== evidence.value.revocationSource.sourceId ||
    historicalMatrix.value.revocationSource.sourceProvenanceDigest !== evidence.value.revocationSource.sourceProvenanceDigest ||
    sourceLineageDigest(historicalMatrix.value.revocationSource) !== evidence.value.revocationSource.sourceLineageDigest) {
    return rejected('evaluation-revocation-reference-invalid')
  }
  const evaluatedAt = parseTimestamp(evidence.value.evaluatedAt)
  if (evaluatedAt === undefined || evaluatedAt.milliseconds < Date.parse(matrix.validFrom) || evaluatedAt.milliseconds >= Date.parse(matrix.expiresAt)) {
    return rejected('evaluation-matrix-not-active')
  }
  if (historicalMatrix.value.revocationSource.entries.some((entry) => entry.matrixId === artifact.matrixId && Date.parse(entry.revokedAt) <= evaluatedAt.milliseconds)) {
    return rejected('evaluation-matrix-revoked')
  }
  const matches = matrix.rules.filter((rule) =>
    rule.targetSemanticDigest === evidence.value.targetSemanticDigest &&
    rule.runtimeDescriptorDigest === evidence.value.runtimeDescriptorDigest,
  )
  if (matches.length === 0) return rejected('evaluation-rule-not-found')
  if (matches.length !== 1 || matches[0] === undefined || matches[0].ruleId !== evidence.value.matchedRuleId) {
    return rejected('evaluation-rule-mismatch')
  }
  const rule = matches[0]
  if (rule.outcome !== evidence.value.outcome) return rejected('evaluation-outcome-mismatch')
  if (rule.reasonCode !== evidence.value.reasonCode || rule.reason !== evidence.value.reason) {
    return rejected('evaluation-reason-mismatch')
  }
  return parsed({
    kind: 'historical-verified',
    evidence: evidence.value,
    matrixId: artifact.matrixId,
    matchedRuleId: rule.ruleId,
    outcome: rule.outcome,
    reasonCode: rule.reasonCode,
    reason: rule.reason,
  })
}

export function canonicalizeCompatibilityEvaluationEvidence(value: unknown): string {
  const body = parseBody(value)
  if (!body.ok) throw new TypeError(FAILURE_REASONS[body.code])
  return canonicalJson(canonicalBody(body.value))
}

export function computeCompatibilityEvaluationEvidenceDigest(value: unknown): string {
  return hashUrn(
    'compatibility-evaluation-evidence',
    canonicalizeCompatibilityEvaluationEvidence(value),
  )
}

export function sealCompatibilityEvaluationEvidence(
  value: unknown,
): CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationEvidenceV1> {
  const body = parseBody(value)
  if (!body.ok) return failure(body.code)
  return success({
    ...body.value,
    evidenceDigest: hashUrn(
      'compatibility-evaluation-evidence',
      canonicalJson(canonicalBody(body.value)),
    ),
  })
}

export function parseCompatibilityEvaluationEvidence(
  value: unknown,
): CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationEvidenceV1> {
  const result = parseSealed(value)
  return result.ok ? success(result.value) : failure(result.code)
}

export function strictReplayCompatibilityEvaluationEvidence(
  value: unknown,
): CompatibilityEvaluationEvidenceResultV1<CompatibilityEvaluationStrictReplayV1> {
  const result = replayInternal(value)
  return result.ok ? success(result.value) : failure(result.code)
}

export function createCompatibilityEvaluationEvidenceKernel(): CompatibilityEvaluationEvidenceKernelV1 {
  return Object.freeze({
    canonicalize: canonicalizeCompatibilityEvaluationEvidence,
    computeDigest: computeCompatibilityEvaluationEvidenceDigest,
    seal: sealCompatibilityEvaluationEvidence,
    parse: parseCompatibilityEvaluationEvidence,
    strictReplay: strictReplayCompatibilityEvaluationEvidence,
  })
}
