import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import {
  canonicalizeCompatibilityMatrixV2,
  computeCompatibilityMatrixIdV2,
  type CompatibilityMatrixV2,
  type CompatibilityMatrixV2ProviderResult,
  type CompatibilityMatrixV2Revocation,
} from './compatibility.js'

export interface CompatibilityMatrixBundleArtifactV2 {
  readonly matrixId: string
  readonly canonicalMatrix: string
}

export interface CompatibilityMatrixBundleBodyV2 {
  readonly schemaVersion: 'sage.compatibility-matrix-bundle.v2'
  readonly canonicalizationVersion: 'sage.compatibility-matrix-bundle-canonical-json.v2'
  readonly providerProvenanceDigest: string
  readonly artifacts: readonly CompatibilityMatrixBundleArtifactV2[]
}

export interface CompatibilityMatrixBundleV2 extends CompatibilityMatrixBundleBodyV2 {
  readonly bundleId: string
}

export interface CompatibilityMatrixRevocationSourceBodyV2 {
  readonly schemaVersion: 'sage.compatibility-matrix-revocation-source.v2'
  readonly canonicalizationVersion: 'sage.compatibility-matrix-revocation-canonical-json.v2'
  readonly createdAt: string
  readonly sourceProvenanceDigest: string
  readonly entries: readonly CompatibilityMatrixV2Revocation[]
  readonly supersedesSourceId?: string
}

export interface CompatibilityMatrixRevocationSourceV2
  extends CompatibilityMatrixRevocationSourceBodyV2 {
  readonly sourceId: string
}

export interface CompatibilityMatrixProviderRequestV2 {
  readonly schemaVersion: 'sage.compatibility-matrix-provider-request.v2'
  readonly targetSemanticDigest: string
  readonly runtimeDescriptorDigest: string
  readonly evaluatedAt: string
  readonly matrixId?: string
}

export interface CompatibilityMatrixProviderAvailableV2 {
  readonly kind: 'available'
  readonly bundleId: string
  readonly matrixId: string
  readonly canonicalMatrix: string
  readonly providerProvenanceDigest: string
  readonly revocationSourceId: string
  readonly revocationSourceProvenanceDigest: string
  readonly revocations: readonly CompatibilityMatrixV2Revocation[]
}

export type CompatibilityMatrixProviderFailureCodeV2 =
  | 'matrix-provider-unavailable'
  | 'matrix-request-invalid'
  | 'matrix-not-found'
  | 'matrix-ambiguous'
  | 'matrix-pair-not-found'

export interface CompatibilityMatrixProviderUnavailableV2 {
  readonly kind: 'unavailable'
  readonly code: CompatibilityMatrixProviderFailureCodeV2
  readonly reason: string
}

export type CompatibilityMatrixProviderResultV2 =
  | CompatibilityMatrixProviderAvailableV2
  | CompatibilityMatrixProviderUnavailableV2

export interface CompatibilityMatrixProviderV2 {
  readonly resolve: (input: unknown) => CompatibilityMatrixProviderResultV2
}

export type CompatibilityMatrixProviderParseFailureCodeV2 =
  | 'matrix-bundle-invalid'
  | 'matrix-bundle-schema-unsupported'
  | 'matrix-bundle-artifact-invalid'
  | 'matrix-bundle-artifact-duplicate'
  | 'matrix-bundle-id-mismatch'
  | 'matrix-revocation-source-invalid'
  | 'matrix-revocation-source-schema-unsupported'
  | 'matrix-revocation-duplicate'
  | 'matrix-revocation-source-id-mismatch'

export type CompatibilityMatrixProviderParseResultV2<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
      readonly ok: false
      readonly code: CompatibilityMatrixProviderParseFailureCodeV2
      readonly reason: string
    }>

const BUNDLE_SCHEMA_VERSION = 'sage.compatibility-matrix-bundle.v2'
const BUNDLE_CANONICALIZATION_VERSION =
  'sage.compatibility-matrix-bundle-canonical-json.v2'
const REVOCATION_SOURCE_SCHEMA_VERSION = 'sage.compatibility-matrix-revocation-source.v2'
const REVOCATION_SOURCE_CANONICALIZATION_VERSION =
  'sage.compatibility-matrix-revocation-canonical-json.v2'
const PROVIDER_REQUEST_SCHEMA_VERSION = 'sage.compatibility-matrix-provider-request.v2'
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/u
const MATRIX_ID = /^urn:sage:compatibility-matrix:sha256:[0-9a-f]{64}$/u
const REVOCATION_SOURCE_ID =
  /^urn:sage:compatibility-matrix-revocation-source:sha256:[0-9a-f]{64}$/u
const TARGET_SEMANTIC_DIGEST = /^urn:sage:target-semantic:sha256:[0-9a-f]{64}$/u
const RUNTIME_DESCRIPTOR_DIGEST = /^urn:sage:runtime-descriptor:sha256:[0-9a-f]{64}$/u
const ISO_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/u
const MAX_MATRIX_BYTES = 4_000_000
const MAX_ARTIFACTS = 256
const MAX_REVOCATIONS = 1_024

const FAILURE_REASONS: Readonly<
  Record<CompatibilityMatrixProviderParseFailureCodeV2, string>
> = {
  'matrix-bundle-invalid': 'The bundled compatibility matrix registry is invalid.',
  'matrix-bundle-schema-unsupported':
    'The bundled compatibility matrix registry schema is unsupported.',
  'matrix-bundle-artifact-invalid':
    'A bundled compatibility matrix artifact is invalid.',
  'matrix-bundle-artifact-duplicate':
    'The bundled compatibility matrix registry contains a duplicate matrix artifact.',
  'matrix-bundle-id-mismatch':
    'The bundled compatibility matrix registry identifier does not match its content.',
  'matrix-revocation-source-invalid':
    'The compatibility matrix revocation source is invalid.',
  'matrix-revocation-source-schema-unsupported':
    'The compatibility matrix revocation source schema is unsupported.',
  'matrix-revocation-duplicate':
    'The compatibility matrix revocation source contains a duplicate matrix identifier.',
  'matrix-revocation-source-id-mismatch':
    'The compatibility matrix revocation source identifier does not match its content.',
}

const PROVIDER_FAILURE_REASONS: Readonly<
  Record<CompatibilityMatrixProviderFailureCodeV2, string>
> = {
  'matrix-provider-unavailable':
    'The app-bundled compatibility matrix provider is unavailable.',
  'matrix-request-invalid': 'The compatibility matrix lookup request is invalid.',
  'matrix-not-found': 'No bundled compatibility matrix matches the requested key.',
  'matrix-ambiguous': 'More than one bundled compatibility matrix matches the requested key.',
  'matrix-pair-not-found':
    'The requested matrix does not declare the requested stable digest pair.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

interface ParsedMatrixArtifact extends CompatibilityMatrixBundleArtifactV2 {
  readonly matrix: CompatibilityMatrixV2
}

interface ParsedBundleState {
  readonly bundle: CompatibilityMatrixBundleV2
  readonly artifacts: readonly ParsedMatrixArtifact[]
}

type ParsedResult<T> = CompatibilityMatrixProviderParseResultV2<T>

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hashUrn(namespace: string, canonical: string): string {
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `urn:sage:${namespace}:sha256:${digest}`
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) {
      freezeDeep(descriptor.value)
    }
  }
  return Object.freeze(value)
}

function success<T>(value: T): ParsedResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: CompatibilityMatrixProviderParseFailureCodeV2): ParsedResult<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function providerFailure(
  code: CompatibilityMatrixProviderFailureCodeV2,
): CompatibilityMatrixProviderUnavailableV2 {
  return Object.freeze({
    kind: 'unavailable' as const,
    code,
    reason: PROVIDER_FAILURE_REASONS[code],
  })
}

function inspectPlainRecord(value: unknown): PlainRecordSnapshot | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return undefined
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const keys = Reflect.ownKeys(descriptors)
    if (keys.some((key) => typeof key !== 'string')) return undefined
    const values: Record<string, unknown> = Object.create(null)
    const names: string[] = []
    for (const key of keys) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      values[key] = descriptor.value
      names.push(key)
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
  const inspected = inspectPlainRecord(value)
  if (inspected === undefined) return undefined
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  if (
    requiredKeys.some((key) => !inspected.keys.includes(key)) ||
    inspected.keys.some((key) => !allowed.has(key))
  ) {
    return undefined
  }
  return inspected.values
}

function exactArray(value: unknown, maxLength: number): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    if (Object.getPrototypeOf(value) !== Array.prototype) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const keys = Reflect.ownKeys(descriptors)
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      lengthDescriptor.value > maxLength ||
      keys.length !== lengthDescriptor.value + 1 ||
      keys.some((key) => key !== 'length' && !/^\d+$/u.test(String(key)))
    ) {
      return undefined
    }
    const result: unknown[] = []
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[index]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      result.push(descriptor.value)
    }
    return result
  } catch {
    return undefined
  }
}

function exactString(value: unknown, pattern?: RegExp, maxLength = 256): string | undefined {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value
  ) {
    return undefined
  }
  if (pattern !== undefined && !pattern.test(value)) return undefined
  return value
}

function exactTimestamp(value: unknown): string | undefined {
  const timestamp = exactString(value, ISO_UTC_TIMESTAMP, 24)
  if (timestamp === undefined) return undefined
  const match = ISO_UTC_TIMESTAMP.exec(timestamp)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1]! &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59
    ? timestamp
    : undefined
}

function exactDigest(value: unknown): string | undefined {
  return exactString(value, CONTENT_DIGEST, 71)
}

function canonicalBundleBody(body: CompatibilityMatrixBundleBodyV2): string {
  return JSON.stringify({
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    canonicalizationVersion: BUNDLE_CANONICALIZATION_VERSION,
    providerProvenanceDigest: body.providerProvenanceDigest,
    artifacts: body.artifacts.map(({ matrixId, canonicalMatrix }) => ({
      matrixId,
      canonicalMatrix,
    })),
  })
}

function canonicalRevocationSourceBody(
  body: CompatibilityMatrixRevocationSourceBodyV2,
): string {
  return JSON.stringify({
    schemaVersion: REVOCATION_SOURCE_SCHEMA_VERSION,
    canonicalizationVersion: REVOCATION_SOURCE_CANONICALIZATION_VERSION,
    createdAt: body.createdAt,
    sourceProvenanceDigest: body.sourceProvenanceDigest,
    entries: body.entries.map(({ matrixId, revokedAt, reasonCode, provenanceDigest }) => ({
      matrixId,
      revokedAt,
      reasonCode,
      provenanceDigest,
    })),
    ...(body.supersedesSourceId === undefined
      ? {}
      : { supersedesSourceId: body.supersedesSourceId }),
  })
}

function parseMatrixArtifact(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<ParsedMatrixArtifact> {
  const record = exactRecord(value, ['matrixId', 'canonicalMatrix'])
  if (record === undefined) return failure('matrix-bundle-artifact-invalid')
  const matrixId = exactString(record.matrixId, MATRIX_ID)
  const canonicalMatrix = exactString(record.canonicalMatrix, undefined, MAX_MATRIX_BYTES)
  if (matrixId === undefined || canonicalMatrix === undefined) {
    return failure('matrix-bundle-artifact-invalid')
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(canonicalMatrix)
  } catch {
    return failure('matrix-bundle-artifact-invalid')
  }
  let matrix: CompatibilityMatrixV2
  try {
    if (canonicalizeCompatibilityMatrixV2(decoded as CompatibilityMatrixV2) !== canonicalMatrix) {
      return failure('matrix-bundle-artifact-invalid')
    }
    matrix = decoded as CompatibilityMatrixV2
    if (computeCompatibilityMatrixIdV2(canonicalMatrix) !== matrixId) {
      return failure('matrix-bundle-artifact-invalid')
    }
  } catch {
    return failure('matrix-bundle-artifact-invalid')
  }
  return success({ matrixId, canonicalMatrix, matrix })
}

function normalizeBundleBody(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<ParsedBundleState> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'providerProvenanceDigest',
    'artifacts',
  ], ['bundleId'])
  if (record === undefined) return failure('matrix-bundle-invalid')
  if (
    record.schemaVersion !== BUNDLE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== BUNDLE_CANONICALIZATION_VERSION
  ) {
    return failure('matrix-bundle-schema-unsupported')
  }
  const providerProvenanceDigest = exactDigest(record.providerProvenanceDigest)
  const rawArtifacts = exactArray(record.artifacts, MAX_ARTIFACTS)
  if (providerProvenanceDigest === undefined || rawArtifacts === undefined) {
    return failure('matrix-bundle-invalid')
  }
  const artifacts: ParsedMatrixArtifact[] = []
  const matrixIds = new Set<string>()
  for (const rawArtifact of rawArtifacts) {
    const parsed = parseMatrixArtifact(rawArtifact)
    if (!parsed.ok) return parsed
    if (matrixIds.has(parsed.value.matrixId)) {
      return failure('matrix-bundle-artifact-duplicate')
    }
    matrixIds.add(parsed.value.matrixId)
    artifacts.push(parsed.value)
  }
  artifacts.sort((left, right) => compareStrings(left.matrixId, right.matrixId))
  const body: CompatibilityMatrixBundleBodyV2 = {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    canonicalizationVersion: BUNDLE_CANONICALIZATION_VERSION,
    providerProvenanceDigest,
    artifacts: artifacts.map(({ matrixId, canonicalMatrix }) => ({ matrixId, canonicalMatrix })),
  }
  const bundleId = hashUrn('compatibility-matrix-bundle', canonicalBundleBody(body))
  if (record.bundleId !== undefined && record.bundleId !== bundleId) {
    return failure('matrix-bundle-id-mismatch')
  }
  return success({
    bundle: { ...body, bundleId },
    artifacts,
  })
}

function parseRevocationEntry(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixV2Revocation> {
  const record = exactRecord(value, ['matrixId', 'revokedAt', 'reasonCode', 'provenanceDigest'])
  if (record === undefined) return failure('matrix-revocation-source-invalid')
  const matrixId = exactString(record.matrixId, MATRIX_ID)
  const revokedAt = exactTimestamp(record.revokedAt)
  const reasonCode = exactString(record.reasonCode)
  const provenanceDigest = exactDigest(record.provenanceDigest)
  if (
    matrixId === undefined ||
    revokedAt === undefined ||
    reasonCode === undefined ||
    provenanceDigest === undefined
  ) {
    return failure('matrix-revocation-source-invalid')
  }
  return success({ matrixId, revokedAt, reasonCode, provenanceDigest })
}

function normalizeRevocationSourceBody(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixRevocationSourceV2> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'createdAt',
    'sourceProvenanceDigest',
    'entries',
  ], ['sourceId', 'supersedesSourceId'])
  if (record === undefined) return failure('matrix-revocation-source-invalid')
  if (
    record.schemaVersion !== REVOCATION_SOURCE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== REVOCATION_SOURCE_CANONICALIZATION_VERSION
  ) {
    return failure('matrix-revocation-source-schema-unsupported')
  }
  const createdAt = exactTimestamp(record.createdAt)
  const sourceProvenanceDigest = exactDigest(record.sourceProvenanceDigest)
  const rawEntries = exactArray(record.entries, MAX_REVOCATIONS)
  const supersedesSourceId =
    record.supersedesSourceId === undefined
      ? undefined
      : exactString(record.supersedesSourceId, REVOCATION_SOURCE_ID)
  if (
    createdAt === undefined ||
    sourceProvenanceDigest === undefined ||
    rawEntries === undefined ||
    (record.supersedesSourceId !== undefined && supersedesSourceId === undefined)
  ) {
    return failure('matrix-revocation-source-invalid')
  }
  const entries: CompatibilityMatrixV2Revocation[] = []
  const matrixIds = new Set<string>()
  for (const rawEntry of rawEntries) {
    const parsed = parseRevocationEntry(rawEntry)
    if (!parsed.ok) return parsed
    if (matrixIds.has(parsed.value.matrixId)) {
      return failure('matrix-revocation-duplicate')
    }
    matrixIds.add(parsed.value.matrixId)
    entries.push(parsed.value)
  }
  entries.sort((left, right) => compareStrings(left.matrixId, right.matrixId))
  const body: CompatibilityMatrixRevocationSourceBodyV2 = {
    schemaVersion: REVOCATION_SOURCE_SCHEMA_VERSION,
    canonicalizationVersion: REVOCATION_SOURCE_CANONICALIZATION_VERSION,
    createdAt,
    sourceProvenanceDigest,
    entries,
    ...(supersedesSourceId === undefined ? {} : { supersedesSourceId }),
  }
  const sourceId = hashUrn(
    'compatibility-matrix-revocation-source',
    canonicalRevocationSourceBody(body),
  )
  if (
    record.sourceId !== undefined &&
    (record.sourceId !== sourceId || record.sourceId === supersedesSourceId)
  ) {
    return failure('matrix-revocation-source-id-mismatch')
  }
  return success({ ...body, sourceId })
}

function parseProviderRequest(
  value: unknown,
): CompatibilityMatrixProviderRequestV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'targetSemanticDigest',
    'runtimeDescriptorDigest',
    'evaluatedAt',
  ], ['matrixId'])
  if (record === undefined || record.schemaVersion !== PROVIDER_REQUEST_SCHEMA_VERSION) {
    return undefined
  }
  const targetSemanticDigest = exactString(record.targetSemanticDigest, TARGET_SEMANTIC_DIGEST)
  const runtimeDescriptorDigest = exactString(
    record.runtimeDescriptorDigest,
    RUNTIME_DESCRIPTOR_DIGEST,
  )
  const evaluatedAt = exactTimestamp(record.evaluatedAt)
  const matrixId =
    record.matrixId === undefined ? undefined : exactString(record.matrixId, MATRIX_ID)
  if (
    targetSemanticDigest === undefined ||
    runtimeDescriptorDigest === undefined ||
    evaluatedAt === undefined ||
    (record.matrixId !== undefined && matrixId === undefined)
  ) {
    return undefined
  }
  return {
    schemaVersion: PROVIDER_REQUEST_SCHEMA_VERSION,
    targetSemanticDigest,
    runtimeDescriptorDigest,
    evaluatedAt,
    ...(matrixId === undefined ? {} : { matrixId }),
  }
}

export function canonicalizeCompatibilityMatrixBundleV2(
  body: CompatibilityMatrixBundleBodyV2,
): string {
  const parsed = normalizeBundleBody(body)
  if (!parsed.ok) throw new TypeError(parsed.reason)
  return canonicalBundleBody(parsed.value.bundle)
}

export function computeCompatibilityMatrixBundleIdV2(
  body: CompatibilityMatrixBundleBodyV2,
): string {
  return hashUrn('compatibility-matrix-bundle', canonicalizeCompatibilityMatrixBundleV2(body))
}

export function sealCompatibilityMatrixBundleV2(
  body: CompatibilityMatrixBundleBodyV2,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixBundleV2> {
  const parsed = normalizeBundleBody(body)
  if (!parsed.ok) return parsed
  return success(parsed.value.bundle)
}

export function parseCompatibilityMatrixBundleV2(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixBundleV2> {
  const parsed = normalizeBundleBody(value)
  return parsed.ok ? success(parsed.value.bundle) : parsed
}

export function canonicalizeCompatibilityMatrixRevocationSourceV2(
  body: CompatibilityMatrixRevocationSourceBodyV2,
): string {
  const parsed = normalizeRevocationSourceBody(body)
  if (!parsed.ok) throw new TypeError(parsed.reason)
  return canonicalRevocationSourceBody(parsed.value)
}

export function computeCompatibilityMatrixRevocationSourceIdV2(
  body: CompatibilityMatrixRevocationSourceBodyV2,
): string {
  return hashUrn(
    'compatibility-matrix-revocation-source',
    canonicalizeCompatibilityMatrixRevocationSourceV2(body),
  )
}

export function sealCompatibilityMatrixRevocationSourceV2(
  body: CompatibilityMatrixRevocationSourceBodyV2,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixRevocationSourceV2> {
  const parsed = normalizeRevocationSourceBody(body)
  if (!parsed.ok) return parsed
  return success(parsed.value)
}

export function parseCompatibilityMatrixRevocationSourceV2(
  value: unknown,
): CompatibilityMatrixProviderParseResultV2<CompatibilityMatrixRevocationSourceV2> {
  return normalizeRevocationSourceBody(value)
}

function hasStablePair(
  matrix: CompatibilityMatrixV2,
  targetSemanticDigest: string,
  runtimeDescriptorDigest: string,
): boolean {
  return matrix.rules.some(
    (rule) =>
      rule.targetSemanticDigest === targetSemanticDigest &&
      rule.runtimeDescriptorDigest === runtimeDescriptorDigest,
  )
}

function isActiveAt(matrix: CompatibilityMatrixV2, evaluatedAt: string): boolean {
  const evaluated = Date.parse(evaluatedAt)
  return evaluated >= Date.parse(matrix.validFrom) && evaluated < Date.parse(matrix.expiresAt)
}

function resolveProvider(
  bundle: ParsedBundleState,
  revocationSource: CompatibilityMatrixRevocationSourceV2,
  input: unknown,
): CompatibilityMatrixProviderResultV2 {
  const request = parseProviderRequest(input)
  if (request === undefined) {
    return providerFailure('matrix-request-invalid')
  }

  const candidates = bundle.artifacts.filter((artifact) =>
    hasStablePair(artifact.matrix, request.targetSemanticDigest, request.runtimeDescriptorDigest),
  )
  let selected: ParsedMatrixArtifact | undefined
  if (request.matrixId !== undefined) {
    const requested = bundle.artifacts.find((artifact) => artifact.matrixId === request.matrixId)
    if (requested === undefined) return providerFailure('matrix-not-found')
    if (!hasStablePair(requested.matrix, request.targetSemanticDigest, request.runtimeDescriptorDigest)) {
      return providerFailure('matrix-pair-not-found')
    }
    selected = requested
  } else {
    if (candidates.length === 0) return providerFailure('matrix-not-found')
    const active = candidates.filter((artifact) => isActiveAt(artifact.matrix, request.evaluatedAt))
    if (active.length === 1) {
      selected = active[0]
    } else if (active.length > 1 || candidates.length > 1) {
      return providerFailure('matrix-ambiguous')
    } else {
      selected = candidates[0]
    }
  }
  if (selected === undefined) return providerFailure('matrix-not-found')
  return Object.freeze({
    kind: 'available' as const,
    bundleId: bundle.bundle.bundleId,
    matrixId: selected.matrixId,
    canonicalMatrix: selected.canonicalMatrix,
    providerProvenanceDigest: bundle.bundle.providerProvenanceDigest,
    revocationSourceId: revocationSource.sourceId,
    revocationSourceProvenanceDigest: revocationSource.sourceProvenanceDigest,
    revocations: revocationSource.entries,
  })
}

export function createBundledCompatibilityMatrixProviderV2(
  bundle: unknown,
  revocationSource: unknown,
): CompatibilityMatrixProviderV2 {
  const parsedBundle = normalizeBundleBody(bundle)
  const parsedRevocationSource = parseCompatibilityMatrixRevocationSourceV2(revocationSource)
  return Object.freeze({
    resolve: (input: unknown): CompatibilityMatrixProviderResultV2 => {
      if (!parsedBundle.ok || !parsedRevocationSource.ok) {
        return providerFailure('matrix-provider-unavailable')
      }
      return resolveProvider(parsedBundle.value, parsedRevocationSource.value, input)
    },
  })
}

export function toCompatibilityMatrixV2ProviderResult(
  result: CompatibilityMatrixProviderResultV2,
): CompatibilityMatrixV2ProviderResult {
  if (result.kind === 'unavailable') return { kind: 'unavailable' }
  return Object.freeze({
    kind: 'available' as const,
    matrixId: result.matrixId,
    canonicalMatrix: result.canonicalMatrix,
    providerProvenanceDigest: result.providerProvenanceDigest,
    revocations: result.revocations,
  })
}
