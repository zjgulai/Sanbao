import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import {
  parseExternalCapabilityDescriptor,
  type ExternalCapabilityDescriptorV1,
  type ExternalCapabilityProtocolRevision,
} from './external-capability.js'

export type ExternalCapabilityEvidenceFailureCode =
  | 'evidence-invalid'
  | 'evidence-schema-unsupported'
  | 'evidence-descriptor-unverified'
  | 'evidence-provenance-missing'
  | 'evidence-host-binding-invalid'
  | 'evidence-connection-binding-invalid'
  | 'evidence-generation-mismatch'
  | 'evidence-observation-incomplete'
  | 'evidence-expired'
  | 'evidence-digest-mismatch'

export type ExternalCapabilityEvidenceKernelResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: ExternalCapabilityEvidenceFailureCode
    readonly reason: string
  }>

export interface ExternalCapabilityEvidenceHostBindingV1 {
  readonly schemaVersion: 'sage.external-capability-host-binding.v1'
  readonly canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1'
  readonly projectionDigest: string
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
}

export interface ExternalCapabilityEvidenceConnectionBindingV1 {
  readonly schemaVersion: 'sage.external-capability-connection-binding.v1'
  readonly canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1'
  readonly connectionGeneration: string
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
  readonly negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  readonly transportState: 'connected'
  readonly discoveryState: 'complete'
  readonly contractState: 'valid'
  readonly toolsObservationDigest: string
}

export interface ExternalCapabilityEvidenceProvenanceV1 {
  readonly schemaVersion: 'sage.external-capability-provenance.v1'
  readonly canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1'
  readonly source: 'c2c5'
  readonly descriptorDigest: string
  readonly artifactEvidenceDigest: string
  readonly launchEvidenceDigest: string
  readonly toolEvidenceDigest: string
}

export interface ExternalCapabilityEvidenceBodyV1 {
  readonly schemaVersion: 'sage.external-capability-evidence.v1'
  readonly canonicalizationVersion: 'sage.external-capability-evidence-canonical-json.v1'
  readonly descriptor: ExternalCapabilityDescriptorV1
  readonly provenance: ExternalCapabilityEvidenceProvenanceV1
  readonly host: ExternalCapabilityEvidenceHostBindingV1
  readonly connection: ExternalCapabilityEvidenceConnectionBindingV1
  readonly observedAt: string
  readonly expiresAt: string
}

export interface ExternalCapabilityEvidenceV1
  extends ExternalCapabilityEvidenceBodyV1 {
  readonly evidenceDigest: string
}

export interface ExternalCapabilityEvidenceFreshnessInputV1 {
  readonly evidence: ExternalCapabilityEvidenceV1
  readonly evaluatedAt: string
}

const EVIDENCE_SCHEMA_VERSION = 'sage.external-capability-evidence.v1'
const HOST_SCHEMA_VERSION = 'sage.external-capability-host-binding.v1'
const CONNECTION_SCHEMA_VERSION = 'sage.external-capability-connection-binding.v1'
const PROVENANCE_SCHEMA_VERSION = 'sage.external-capability-provenance.v1'
const CANONICALIZATION_VERSION = 'sage.external-capability-evidence-canonical-json.v1'
const EVIDENCE_DIGEST = /^urn:sage:external-capability-evidence:sha256:[0-9a-f]{64}$/u
const PROJECTION_DIGEST = /^sha256:[0-9a-f]{64}$/u
const OBSERVATION_DIGEST = /^urn:sage:external-capability-tools-observation:sha256:[0-9a-f]{64}$/u
const ARTIFACT_EVIDENCE_DIGEST = /^urn:sage:external-capability-artifact-evidence:sha256:[0-9a-f]{64}$/u
const LAUNCH_EVIDENCE_DIGEST = /^urn:sage:external-capability-launch-evidence:sha256:[0-9a-f]{64}$/u
const TOOL_EVIDENCE_DIGEST = /^urn:sage:external-capability-tool-evidence:sha256:[0-9a-f]{64}$/u
const BOOT_ID = /^sage-host:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const CONNECTION_GENERATION = /^connection:sage\.[a-z0-9][a-z0-9._-]{0,127}$/u
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const PROTOCOL_REVISIONS: readonly ExternalCapabilityProtocolRevision[] = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]

const FAILURE_REASONS: Readonly<Record<ExternalCapabilityEvidenceFailureCode, string>> = {
  'evidence-invalid': 'The external capability evidence is invalid.',
  'evidence-schema-unsupported': 'The external capability evidence schema is unsupported.',
  'evidence-descriptor-unverified': 'The external capability descriptor is not verified by the C2C.5 boundary.',
  'evidence-provenance-missing': 'Required external capability provenance is missing.',
  'evidence-host-binding-invalid': 'The external capability host binding is invalid.',
  'evidence-connection-binding-invalid': 'The external capability connection binding is invalid.',
  'evidence-generation-mismatch': 'The external capability facts do not share one runtime generation.',
  'evidence-observation-incomplete': 'The external capability observation is incomplete or not contract-valid.',
  'evidence-expired': 'The external capability evidence is outside its freshness window.',
  'evidence-digest-mismatch': 'The external capability evidence digest does not match its content.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly code: ExternalCapabilityEvidenceFailureCode }>

interface ParsedTimestamp {
  readonly text: string
  readonly milliseconds: number
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) freezeDeep(descriptor.value)
  }
  return Object.freeze(value)
}

function success<T>(value: T): ExternalCapabilityEvidenceKernelResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: ExternalCapabilityEvidenceFailureCode): ExternalCapabilityEvidenceKernelResult<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function parsed<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function rejected<T>(code: ExternalCapabilityEvidenceFailureCode): ParseResult<T> {
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
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
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

function digest(namespace: string, value: string): string {
  return `urn:sage:${namespace}:sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function parseHostBinding(value: unknown): ParseResult<ExternalCapabilityEvidenceHostBindingV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'projectionDigest',
    'bootId',
    'runtimeGeneration',
    'activeGeneration',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== HOST_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    typeof record.projectionDigest !== 'string' || !PROJECTION_DIGEST.test(record.projectionDigest) ||
    typeof record.bootId !== 'string' || !BOOT_ID.test(record.bootId) ||
    typeof record.runtimeGeneration !== 'number' || !Number.isSafeInteger(record.runtimeGeneration) || record.runtimeGeneration < 1 ||
    typeof record.activeGeneration !== 'string' || !GENERATION.test(record.activeGeneration)
  ) return rejected('evidence-host-binding-invalid')
  return parsed({
    schemaVersion: HOST_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    projectionDigest: record.projectionDigest,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    activeGeneration: record.activeGeneration,
  })
}

function parseConnectionBinding(value: unknown): ParseResult<ExternalCapabilityEvidenceConnectionBindingV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'connectionGeneration',
    'bootId',
    'runtimeGeneration',
    'activeGeneration',
    'negotiatedProtocolRevision',
    'transportState',
    'discoveryState',
    'contractState',
    'toolsObservationDigest',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== CONNECTION_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    typeof record.connectionGeneration !== 'string' || !CONNECTION_GENERATION.test(record.connectionGeneration) ||
    typeof record.bootId !== 'string' || !BOOT_ID.test(record.bootId) ||
    typeof record.runtimeGeneration !== 'number' || !Number.isSafeInteger(record.runtimeGeneration) || record.runtimeGeneration < 1 ||
    typeof record.activeGeneration !== 'string' || !GENERATION.test(record.activeGeneration) ||
    typeof record.negotiatedProtocolRevision !== 'string' || !PROTOCOL_REVISIONS.includes(record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision) ||
    record.transportState !== 'connected' || record.discoveryState !== 'complete' || record.contractState !== 'valid' ||
    typeof record.toolsObservationDigest !== 'string' || !OBSERVATION_DIGEST.test(record.toolsObservationDigest)
  ) return rejected('evidence-connection-binding-invalid')
  return parsed({
    schemaVersion: CONNECTION_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    connectionGeneration: record.connectionGeneration,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    activeGeneration: record.activeGeneration,
    negotiatedProtocolRevision: record.negotiatedProtocolRevision as ExternalCapabilityProtocolRevision,
    transportState: 'connected',
    discoveryState: 'complete',
    contractState: 'valid',
    toolsObservationDigest: record.toolsObservationDigest,
  })
}

function parseProvenance(value: unknown): ParseResult<ExternalCapabilityEvidenceProvenanceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'source',
    'descriptorDigest',
    'artifactEvidenceDigest',
    'launchEvidenceDigest',
    'toolEvidenceDigest',
  ])
  if (
    record === undefined ||
    record.schemaVersion !== PROVENANCE_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    record.source !== 'c2c5' ||
    typeof record.descriptorDigest !== 'string' || !/^urn:sage:external-capability-descriptor:sha256:[0-9a-f]{64}$/u.test(record.descriptorDigest) ||
    typeof record.artifactEvidenceDigest !== 'string' || !ARTIFACT_EVIDENCE_DIGEST.test(record.artifactEvidenceDigest) ||
    typeof record.launchEvidenceDigest !== 'string' || !LAUNCH_EVIDENCE_DIGEST.test(record.launchEvidenceDigest) ||
    typeof record.toolEvidenceDigest !== 'string' || !TOOL_EVIDENCE_DIGEST.test(record.toolEvidenceDigest)
  ) return rejected('evidence-provenance-missing')
  return parsed({
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    source: 'c2c5',
    descriptorDigest: record.descriptorDigest,
    artifactEvidenceDigest: record.artifactEvidenceDigest,
    launchEvidenceDigest: record.launchEvidenceDigest,
    toolEvidenceDigest: record.toolEvidenceDigest,
  })
}

function parseBody(value: unknown): ParseResult<ExternalCapabilityEvidenceBodyV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'descriptor',
    'provenance',
    'host',
    'connection',
    'observedAt',
    'expiresAt',
  ])
  if (record === undefined) return rejected('evidence-invalid')
  if (record.schemaVersion !== EVIDENCE_SCHEMA_VERSION || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return rejected('evidence-schema-unsupported')
  }
  const descriptor = parseExternalCapabilityDescriptor(record.descriptor)
  if (!descriptor.ok) return rejected('evidence-descriptor-unverified')
  const provenance = parseProvenance(record.provenance)
  if (!provenance.ok) return provenance
  const host = parseHostBinding(record.host)
  if (!host.ok) return host
  const connection = parseConnectionBinding(record.connection)
  if (!connection.ok) return connection
  const observedAt = parseTimestamp(record.observedAt)
  const expiresAt = parseTimestamp(record.expiresAt)
  if (observedAt === undefined || expiresAt === undefined || expiresAt.milliseconds <= observedAt.milliseconds) {
    return rejected('evidence-invalid')
  }
  if (
    provenance.value.descriptorDigest !== descriptor.value.descriptorDigest ||
    connection.value.bootId !== host.value.bootId ||
    connection.value.runtimeGeneration !== host.value.runtimeGeneration ||
    connection.value.activeGeneration !== host.value.activeGeneration
  ) return rejected('evidence-generation-mismatch')
  return parsed({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    descriptor: descriptor.value,
    provenance: provenance.value,
    host: host.value,
    connection: connection.value,
    observedAt: observedAt.text,
    expiresAt: expiresAt.text,
  })
}

function canonicalBody(body: ExternalCapabilityEvidenceBodyV1): Record<string, unknown> {
  return {
    schemaVersion: body.schemaVersion,
    canonicalizationVersion: body.canonicalizationVersion,
    descriptor: body.descriptor,
    provenance: body.provenance,
    host: body.host,
    connection: body.connection,
    observedAt: body.observedAt,
    expiresAt: body.expiresAt,
  }
}

function parseSealed(value: unknown): ParseResult<ExternalCapabilityEvidenceV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'descriptor',
    'provenance',
    'host',
    'connection',
    'observedAt',
    'expiresAt',
    'evidenceDigest',
  ])
  if (record === undefined) return rejected('evidence-invalid')
  const body = parseBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    descriptor: record.descriptor,
    provenance: record.provenance,
    host: record.host,
    connection: record.connection,
    observedAt: record.observedAt,
    expiresAt: record.expiresAt,
  })
  if (!body.ok) return body
  const evidenceDigest = exactString(record.evidenceDigest, EVIDENCE_DIGEST, 160)
  if (evidenceDigest === undefined) return rejected('evidence-invalid')
  const expected = digest('external-capability-evidence', canonicalJson(canonicalBody(body.value)))
  if (evidenceDigest !== expected) return rejected('evidence-digest-mismatch')
  return parsed({ ...body.value, evidenceDigest })
}

export function canonicalizeExternalCapabilityEvidence(value: unknown): string {
  const body = parseBody(value)
  if (!body.ok) throw new TypeError(FAILURE_REASONS[body.code])
  return canonicalJson(canonicalBody(body.value))
}

export function computeExternalCapabilityEvidenceDigest(value: unknown): string {
  return digest('external-capability-evidence', canonicalizeExternalCapabilityEvidence(value))
}

export function sealExternalCapabilityEvidence(
  value: unknown,
): ExternalCapabilityEvidenceKernelResult<ExternalCapabilityEvidenceV1> {
  const body = parseBody(value)
  if (!body.ok) return failure(body.code)
  return success({
    ...body.value,
    evidenceDigest: digest('external-capability-evidence', canonicalJson(canonicalBody(body.value))),
  })
}

export function parseExternalCapabilityEvidence(
  value: unknown,
): ExternalCapabilityEvidenceKernelResult<ExternalCapabilityEvidenceV1> {
  const result = parseSealed(value)
  return result.ok ? success(result.value) : failure(result.code)
}

export function verifyExternalCapabilityEvidenceFreshness(
  input: ExternalCapabilityEvidenceFreshnessInputV1,
): ExternalCapabilityEvidenceKernelResult<ExternalCapabilityEvidenceV1> {
  const evidence = parseSealed(input.evidence)
  if (!evidence.ok) return failure(evidence.code)
  const evaluatedAt = parseTimestamp(input.evaluatedAt)
  const observedAt = parseTimestamp(evidence.value.observedAt)
  const expiresAt = parseTimestamp(evidence.value.expiresAt)
  if (evaluatedAt === undefined || observedAt === undefined || expiresAt === undefined) {
    return failure('evidence-invalid')
  }
  if (evaluatedAt.milliseconds < observedAt.milliseconds || evaluatedAt.milliseconds >= expiresAt.milliseconds) {
    return failure('evidence-expired')
  }
  return success(evidence.value)
}

export function createExternalCapabilityEvidenceKernel(): Readonly<{
  readonly canonicalize: typeof canonicalizeExternalCapabilityEvidence
  readonly computeDigest: typeof computeExternalCapabilityEvidenceDigest
  readonly seal: typeof sealExternalCapabilityEvidence
  readonly parse: typeof parseExternalCapabilityEvidence
  readonly verifyFreshness: typeof verifyExternalCapabilityEvidenceFreshness
}> {
  return Object.freeze({
    canonicalize: canonicalizeExternalCapabilityEvidence,
    computeDigest: computeExternalCapabilityEvidenceDigest,
    seal: sealExternalCapabilityEvidence,
    parse: parseExternalCapabilityEvidence,
    verifyFreshness: verifyExternalCapabilityEvidenceFreshness,
  })
}
