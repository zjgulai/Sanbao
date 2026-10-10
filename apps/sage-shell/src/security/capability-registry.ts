import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import type { EffectClass } from '../domain/business-matter.js'

export type CapabilityRegistryStateV1 =
  | 'candidate'
  | 'approved'
  | 'disabled'
  | 'revoked'

export type CapabilityRegistryFailureCode =
  | 'registry-invalid'
  | 'registry-schema-unsupported'
  | 'registry-entry-invalid'
  | 'registry-descriptor-unverified'
  | 'registry-operation-mapping-invalid'
  | 'registry-approval-required'
  | 'registry-entry-duplicate'
  | 'registry-entry-conflict'
  | 'registry-snapshot-invalid'
  | 'registry-snapshot-digest-mismatch'
  | 'registry-transition-invalid'
  | 'registry-entry-not-found'
  | 'registry-revoked'

export type CapabilityRegistryKernelResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
      readonly ok: false
      readonly code: CapabilityRegistryFailureCode
      readonly reason: string
    }>

export type CapabilityRegistryDescriptorVerification = 'candidate' | 'verified'

export interface CapabilityRegistryDescriptorRefV1 {
  readonly descriptorDigest: string
  readonly artifactSubjectDigest: string
  readonly launchContractDigest: string
  readonly toolContractDigest: string
  readonly verification: CapabilityRegistryDescriptorVerification
  /** The verification path: `c2c5` = the external provider seam; `first-party` = the Sage-owned
   *  composite (C2A runtime-artifact attestation + publication decision, ADR-0285). The source
   *  and its digest namespaces are one fact: they must never be interchangeable. */
  readonly source: 'candidate' | 'c2c5' | 'first-party'
  readonly evidenceDigest?: string
}

export interface CapabilityRegistryAdapterRefV1 {
  readonly identity: string
  readonly version: string
  readonly digest: string
}

export interface CapabilityRegistryOperationMappingV1 {
  readonly operationId: string
  readonly adapter: CapabilityRegistryAdapterRefV1
  readonly effectClass: EffectClass
  readonly dataBoundary: string
  readonly inputContractDigest: string
  readonly outputContractDigest: string
  readonly preflight: 'read-only'
  readonly revokeBehavior: 'deny-new-actions'
}

export interface CapabilityRegistryApprovalV1 {
  readonly decisionId: string
  readonly ownerId: string
  readonly decidedAt: string
  readonly reason: string
}

export interface CapabilityRegistryEntryBodyV1 {
  readonly schemaVersion: 'sage.capability-registry-entry.v1'
  readonly canonicalizationVersion: 'sage.capability-registry-canonical-json.v1'
  readonly capabilityId: string
  readonly capabilityVersion: string
  readonly state: CapabilityRegistryStateV1
  readonly descriptor: CapabilityRegistryDescriptorRefV1
  readonly operations: readonly CapabilityRegistryOperationMappingV1[]
  readonly approvals: readonly CapabilityRegistryApprovalV1[]
  readonly effectiveAt: string
  readonly expiresAt?: string
}

export interface CapabilityRegistrySnapshotBodyV1 {
  readonly schemaVersion: 'sage.capability-registry.v1'
  readonly canonicalizationVersion: 'sage.capability-registry-canonical-json.v1'
  readonly createdAt: string
  readonly entries: readonly CapabilityRegistryEntryBodyV1[]
  readonly supersedesSnapshotId?: string
}

export interface CapabilityRegistrySnapshotV1 extends CapabilityRegistrySnapshotBodyV1 {
  readonly snapshotId: string
}

export interface CapabilityRegistryTransitionInputV1 {
  readonly schemaVersion: 'sage.capability-registry-transition.v1'
  readonly canonicalizationVersion: 'sage.capability-registry-canonical-json.v1'
  readonly current: CapabilityRegistrySnapshotV1
  readonly capabilityId: string
  readonly toState: CapabilityRegistryStateV1
  readonly effectiveAt: string
  readonly reason: string
  readonly approval?: CapabilityRegistryApprovalV1
}

const ENTRY_SCHEMA_VERSION = 'sage.capability-registry-entry.v1'
const REGISTRY_SCHEMA_VERSION = 'sage.capability-registry.v1'
const TRANSITION_SCHEMA_VERSION = 'sage.capability-registry-transition.v1'
const CANONICALIZATION_VERSION = 'sage.capability-registry-canonical-json.v1'
const REGISTRY_DIGEST = /^urn:sage:capability-registry:sha256:[0-9a-f]{64}$/u
const DESCRIPTOR_DIGEST = /^urn:sage:external-capability-descriptor:sha256:[0-9a-f]{64}$/u
const ARTIFACT_DIGEST = /^urn:sage:external-capability-artifact:sha256:[0-9a-f]{64}$/u
const LAUNCH_DIGEST = /^urn:sage:external-capability-launch:sha256:[0-9a-f]{64}$/u
const TOOL_DIGEST = /^urn:sage:external-capability-tool-contract:sha256:[0-9a-f]{64}$/u
const EVIDENCE_DIGEST = /^urn:sage:external-capability-evidence:sha256:[0-9a-f]{64}$/u
// First-party (ADR-0285) digest namespaces: the runtime descriptor line and the Sage-owned
// artifact attestation are content digests, not external-capability URNs.
const FIRST_PARTY_DESCRIPTOR_DIGEST = /^urn:sage:runtime-descriptor:sha256:[0-9a-f]{64}$/u
const FIRST_PARTY_ARTIFACT_DIGEST = /^sha256:[0-9a-f]{64}$/u
const FIRST_PARTY_LAUNCH_DIGEST = /^sha256:[0-9a-f]{64}$/u
const FIRST_PARTY_TOOL_DIGEST = /^sha256:[0-9a-f]{64}$/u
const FIRST_PARTY_EVIDENCE_DIGEST = /^urn:sage:first-party-capability-evidence:sha256:[0-9a-f]{64}$/u
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/u
const CAPABILITY_ID = /^capability:sage\.[a-z0-9][a-z0-9._-]*$/u
const OPERATION_ID = /^[a-z][a-z0-9._-]{0,127}$/u
const DATA_BOUNDARY = /^[a-z][a-z0-9._:-]{0,127}$/u
const DECISION_ID = /^decision:sage\.[a-z0-9][a-z0-9._-]*$/u
const OWNER_ID = /^owner:sage\.[a-z0-9][a-z0-9._-]*$/u
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const SEMANTIC_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]
const STATES: readonly CapabilityRegistryStateV1[] = [
  'candidate',
  'approved',
  'disabled',
  'revoked',
]
const MAX_ENTRIES = 256
const MAX_OPERATIONS = 128
const MAX_APPROVALS = 32

const FAILURE_REASONS: Readonly<Record<CapabilityRegistryFailureCode, string>> = {
  'registry-invalid': 'The capability registry input is invalid.',
  'registry-schema-unsupported': 'The capability registry schema version is unsupported.',
  'registry-entry-invalid': 'The capability registry entry is invalid.',
  'registry-descriptor-unverified': 'The capability descriptor is not verified through its declared provenance path (C2C.5 provider or Sage first-party, ADR-0285).',
  'registry-operation-mapping-invalid': 'The capability operation mapping is invalid or incomplete.',
  'registry-approval-required': 'A product/security approval is required for this registry transition.',
  'registry-entry-duplicate': 'The capability registry contains a duplicate entry.',
  'registry-entry-conflict': 'The capability registry contains conflicting entries.',
  'registry-snapshot-invalid': 'The capability registry snapshot is invalid.',
  'registry-snapshot-digest-mismatch': 'The capability registry snapshot identifier does not match its content.',
  'registry-transition-invalid': 'The capability registry state transition is invalid.',
  'registry-entry-not-found': 'The capability registry entry was not found.',
  'registry-revoked': 'A revoked capability registry entry cannot be reactivated.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly code: CapabilityRegistryFailureCode }>

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
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

function success<T>(value: T): CapabilityRegistryKernelResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: CapabilityRegistryFailureCode): CapabilityRegistryKernelResult<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function parsed<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function rejected<T>(code: CapabilityRegistryFailureCode): ParseResult<T> {
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

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined
    const values: Record<string, unknown> = Object.create(null)
    const keys: string[] = []
    for (const key of ownKeys) {
      if (typeof key !== 'string') return undefined
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) return undefined
      keys.push(key)
      values[key] = descriptor.value
    }
    return { values, keys }
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

function exactArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    if (Object.getPrototypeOf(value) !== Array.prototype) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const ownKeys = Reflect.ownKeys(descriptors)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0 ||
      ownKeys.length !== lengthDescriptor.value + 1
    ) return undefined
    const values: unknown[] = []
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[String(index)]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) return undefined
      values.push(descriptor.value)
    }
    return values
  } catch {
    return undefined
  }
}

function exactString(value: unknown, pattern?: RegExp, maxLength = 512): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    return undefined
  }
  return pattern !== undefined && !pattern.test(value) ? undefined : value
}

function exactTimestamp(value: unknown): string | undefined {
  const timestamp = exactString(value, ISO_UTC_TIMESTAMP, 24)
  if (timestamp === undefined) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/u.exec(timestamp)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  return daysInMonth !== undefined &&
    month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth &&
    hour >= 0 && hour <= 23 &&
    minute >= 0 && minute <= 59 &&
    second >= 0 && second <= 59
    ? timestamp
    : undefined
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function exactVersion(value: unknown): string | undefined {
  return exactString(value, SEMANTIC_VERSION, 64)
}

function exactDigest(value: unknown, pattern: RegExp): string | undefined {
  return exactString(value, pattern, 160)
}

function parseState(value: unknown): CapabilityRegistryStateV1 | undefined {
  return typeof value === 'string' && STATES.includes(value as CapabilityRegistryStateV1)
    ? (value as CapabilityRegistryStateV1)
    : undefined
}

function parseEffectClass(value: unknown): EffectClass | undefined {
  return typeof value === 'string' && EFFECT_CLASSES.includes(value as EffectClass)
    ? (value as EffectClass)
    : undefined
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

function digest(namespace: string, canonical: string): string {
  return `urn:sage:${namespace}:sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.hasOwn(record, key)
}

function parseDescriptor(value: unknown): ParseResult<CapabilityRegistryDescriptorRefV1> {
  const record = exactRecord(value, [
    'descriptorDigest',
    'artifactSubjectDigest',
    'launchContractDigest',
    'toolContractDigest',
    'verification',
    'source',
  ], ['evidenceDigest'])
  if (record === undefined) return rejected('registry-entry-invalid')
  const verification = record.verification
  const source = record.source
  if (
    (verification !== 'candidate' && verification !== 'verified')
    || (source !== 'candidate' && source !== 'c2c5' && source !== 'first-party')
  ) return rejected('registry-entry-invalid')
  // Digest namespaces are source-conditional (ADR-0285): a C2C.5 external descriptor and a Sage
  // first-party runtime descriptor are different classes of evidence and never interchangeable.
  const patterns = source === 'first-party'
    ? {
        descriptor: FIRST_PARTY_DESCRIPTOR_DIGEST,
        artifact: FIRST_PARTY_ARTIFACT_DIGEST,
        launch: FIRST_PARTY_LAUNCH_DIGEST,
        tool: FIRST_PARTY_TOOL_DIGEST,
        evidence: FIRST_PARTY_EVIDENCE_DIGEST,
      }
    : {
        descriptor: DESCRIPTOR_DIGEST,
        artifact: ARTIFACT_DIGEST,
        launch: LAUNCH_DIGEST,
        tool: TOOL_DIGEST,
        evidence: EVIDENCE_DIGEST,
      }
  const descriptorDigest = exactDigest(record.descriptorDigest, patterns.descriptor)
  const artifactSubjectDigest = exactDigest(record.artifactSubjectDigest, patterns.artifact)
  const launchContractDigest = exactDigest(record.launchContractDigest, patterns.launch)
  const toolContractDigest = exactDigest(record.toolContractDigest, patterns.tool)
  if (
    descriptorDigest === undefined ||
    artifactSubjectDigest === undefined ||
    launchContractDigest === undefined ||
    toolContractDigest === undefined
  ) return rejected('registry-entry-invalid')

  if (verification === 'candidate') {
    if (source !== 'candidate' || hasOwn(record, 'evidenceDigest')) {
      return rejected('registry-entry-invalid')
    }
    return parsed({
      descriptorDigest,
      artifactSubjectDigest,
      launchContractDigest,
      toolContractDigest,
      verification,
      source,
    })
  }

  const evidenceDigest = exactDigest(record.evidenceDigest, patterns.evidence)
  if (evidenceDigest === undefined || (source !== 'c2c5' && source !== 'first-party')) {
    return rejected('registry-descriptor-unverified')
  }
  return parsed({
    descriptorDigest,
    artifactSubjectDigest,
    launchContractDigest,
    toolContractDigest,
    verification,
    source,
    evidenceDigest,
  })
}

function parseAdapter(value: unknown): CapabilityRegistryAdapterRefV1 | undefined {
  const record = exactRecord(value, ['identity', 'version', 'digest'])
  if (record === undefined) return undefined
  const identity = exactString(record.identity, /^[a-z0-9@][a-z0-9@:/._-]{0,127}$/u, 128)
  const version = exactVersion(record.version)
  const adapterDigest = exactDigest(record.digest, CONTENT_DIGEST)
  return identity === undefined || version === undefined || adapterDigest === undefined
    ? undefined
    : { identity, version, digest: adapterDigest }
}

function parseOperation(value: unknown): ParseResult<CapabilityRegistryOperationMappingV1> {
  const record = exactRecord(value, [
    'operationId',
    'adapter',
    'effectClass',
    'dataBoundary',
    'inputContractDigest',
    'outputContractDigest',
    'preflight',
    'revokeBehavior',
  ])
  if (record === undefined) return rejected('registry-operation-mapping-invalid')
  const operationId = exactString(record.operationId, OPERATION_ID, 128)
  const adapter = parseAdapter(record.adapter)
  const effectClass = parseEffectClass(record.effectClass)
  const dataBoundary = exactString(record.dataBoundary, DATA_BOUNDARY, 128)
  const inputContractDigest = exactDigest(record.inputContractDigest, CONTENT_DIGEST)
  const outputContractDigest = exactDigest(record.outputContractDigest, CONTENT_DIGEST)
  if (
    operationId === undefined ||
    adapter === undefined ||
    effectClass === undefined ||
    dataBoundary === undefined ||
    inputContractDigest === undefined ||
    outputContractDigest === undefined ||
    record.preflight !== 'read-only' ||
    record.revokeBehavior !== 'deny-new-actions'
  ) return rejected('registry-operation-mapping-invalid')
  return parsed({
    operationId,
    adapter,
    effectClass,
    dataBoundary,
    inputContractDigest,
    outputContractDigest,
    preflight: 'read-only',
    revokeBehavior: 'deny-new-actions',
  })
}

function parseApproval(value: unknown): CapabilityRegistryApprovalV1 | undefined {
  const record = exactRecord(value, ['decisionId', 'ownerId', 'decidedAt', 'reason'])
  if (record === undefined) return undefined
  const decisionId = exactString(record.decisionId, DECISION_ID, 128)
  const ownerId = exactString(record.ownerId, OWNER_ID, 128)
  const decidedAt = exactTimestamp(record.decidedAt)
  const reason = exactString(record.reason, undefined, 512)
  return decisionId === undefined || ownerId === undefined || decidedAt === undefined || reason === undefined
    ? undefined
    : { decisionId, ownerId, decidedAt, reason }
}

function parseEntry(value: unknown): ParseResult<CapabilityRegistryEntryBodyV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'capabilityId',
    'capabilityVersion',
    'state',
    'descriptor',
    'operations',
    'approvals',
    'effectiveAt',
  ], ['expiresAt'])
  if (record === undefined) return rejected('registry-entry-invalid')
  if (record.schemaVersion !== ENTRY_SCHEMA_VERSION || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return rejected('registry-schema-unsupported')
  }
  const capabilityId = exactString(record.capabilityId, CAPABILITY_ID, 160)
  const capabilityVersion = exactVersion(record.capabilityVersion)
  const state = parseState(record.state)
  const descriptor = parseDescriptor(record.descriptor)
  const operations = exactArray(record.operations)
  const approvals = exactArray(record.approvals)
  const effectiveAt = exactTimestamp(record.effectiveAt)
  const expiresAt = hasOwn(record, 'expiresAt') ? exactTimestamp(record.expiresAt) : undefined
  if (
    capabilityId === undefined ||
    capabilityVersion === undefined ||
    state === undefined ||
    descriptor.ok === false ||
    operations === undefined ||
    approvals === undefined ||
    effectiveAt === undefined ||
    (hasOwn(record, 'expiresAt') && expiresAt === undefined) ||
    (expiresAt !== undefined && expiresAt <= effectiveAt)
  ) return rejected('registry-entry-invalid')
  if (operations.length > MAX_OPERATIONS || approvals.length > MAX_APPROVALS) {
    return rejected('registry-entry-invalid')
  }

  const parsedOperations: CapabilityRegistryOperationMappingV1[] = []
  const operationIds = new Set<string>()
  for (const operation of operations) {
    const parsedOperation = parseOperation(operation)
    if (parsedOperation.ok === false) return parsedOperation
    if (operationIds.has(parsedOperation.value.operationId)) return rejected('registry-operation-mapping-invalid')
    operationIds.add(parsedOperation.value.operationId)
    parsedOperations.push(parsedOperation.value)
  }
  const parsedApprovals: CapabilityRegistryApprovalV1[] = []
  const decisionIds = new Set<string>()
  for (const approval of approvals) {
    const parsedApproval = parseApproval(approval)
    if (parsedApproval === undefined) return rejected('registry-entry-invalid')
    if (decisionIds.has(parsedApproval.decisionId)) return rejected('registry-entry-conflict')
    decisionIds.add(parsedApproval.decisionId)
    parsedApprovals.push(parsedApproval)
  }
  const normalized: CapabilityRegistryEntryBodyV1 = {
    schemaVersion: ENTRY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    capabilityId,
    capabilityVersion,
    state,
    descriptor: descriptor.value,
    operations: parsedOperations.sort((left, right) => compareCodeUnits(left.operationId, right.operationId)),
    approvals: parsedApprovals.sort((left, right) => compareCodeUnits(left.decisionId, right.decisionId)),
    effectiveAt,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  }
  if (state === 'approved') {
    if (descriptor.value.verification !== 'verified') return rejected('registry-descriptor-unverified')
    if (parsedOperations.length === 0) return rejected('registry-operation-mapping-invalid')
    if (parsedApprovals.length === 0) return rejected('registry-approval-required')
  }
  return parsed(normalized)
}

function parseSnapshotBody(value: unknown): ParseResult<CapabilityRegistrySnapshotBodyV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'createdAt',
    'entries',
  ], ['supersedesSnapshotId'])
  if (record === undefined) return rejected('registry-snapshot-invalid')
  if (record.schemaVersion !== REGISTRY_SCHEMA_VERSION || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return rejected('registry-schema-unsupported')
  }
  const createdAt = exactTimestamp(record.createdAt)
  const entries = exactArray(record.entries)
  const supersedesSnapshotId = hasOwn(record, 'supersedesSnapshotId')
    ? exactDigest(record.supersedesSnapshotId, REGISTRY_DIGEST)
    : undefined
  if (
    createdAt === undefined ||
    entries === undefined ||
    entries.length > MAX_ENTRIES ||
    (hasOwn(record, 'supersedesSnapshotId') && supersedesSnapshotId === undefined)
  ) return rejected('registry-snapshot-invalid')

  const parsedEntries: CapabilityRegistryEntryBodyV1[] = []
  const capabilityIds = new Set<string>()
  for (const entry of entries) {
    const parsedEntry = parseEntry(entry)
    if (parsedEntry.ok === false) return parsedEntry
    if (capabilityIds.has(parsedEntry.value.capabilityId)) return rejected('registry-entry-duplicate')
    capabilityIds.add(parsedEntry.value.capabilityId)
    parsedEntries.push(parsedEntry.value)
  }
  return parsed({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    createdAt,
    entries: parsedEntries.sort((left, right) => compareCodeUnits(left.capabilityId, right.capabilityId)),
    ...(supersedesSnapshotId === undefined ? {} : { supersedesSnapshotId }),
  })
}

function canonicalDescriptor(descriptor: CapabilityRegistryDescriptorRefV1): Record<string, unknown> {
  return {
    descriptorDigest: descriptor.descriptorDigest,
    artifactSubjectDigest: descriptor.artifactSubjectDigest,
    launchContractDigest: descriptor.launchContractDigest,
    toolContractDigest: descriptor.toolContractDigest,
    verification: descriptor.verification,
    source: descriptor.source,
    ...(descriptor.evidenceDigest === undefined ? {} : { evidenceDigest: descriptor.evidenceDigest }),
  }
}

function canonicalOperation(operation: CapabilityRegistryOperationMappingV1): Record<string, unknown> {
  return {
    operationId: operation.operationId,
    adapter: {
      identity: operation.adapter.identity,
      version: operation.adapter.version,
      digest: operation.adapter.digest,
    },
    effectClass: operation.effectClass,
    dataBoundary: operation.dataBoundary,
    inputContractDigest: operation.inputContractDigest,
    outputContractDigest: operation.outputContractDigest,
    preflight: operation.preflight,
    revokeBehavior: operation.revokeBehavior,
  }
}

function canonicalApproval(approval: CapabilityRegistryApprovalV1): Record<string, unknown> {
  return {
    decisionId: approval.decisionId,
    ownerId: approval.ownerId,
    decidedAt: approval.decidedAt,
    reason: approval.reason,
  }
}

function canonicalEntry(entry: CapabilityRegistryEntryBodyV1): Record<string, unknown> {
  return {
    schemaVersion: entry.schemaVersion,
    canonicalizationVersion: entry.canonicalizationVersion,
    capabilityId: entry.capabilityId,
    capabilityVersion: entry.capabilityVersion,
    state: entry.state,
    descriptor: canonicalDescriptor(entry.descriptor),
    operations: entry.operations.map(canonicalOperation),
    approvals: entry.approvals.map(canonicalApproval),
    effectiveAt: entry.effectiveAt,
    ...(entry.expiresAt === undefined ? {} : { expiresAt: entry.expiresAt }),
  }
}

function canonicalSnapshot(snapshot: CapabilityRegistrySnapshotBodyV1): Record<string, unknown> {
  return {
    schemaVersion: snapshot.schemaVersion,
    canonicalizationVersion: snapshot.canonicalizationVersion,
    createdAt: snapshot.createdAt,
    entries: snapshot.entries.map(canonicalEntry),
    ...(snapshot.supersedesSnapshotId === undefined
      ? {}
      : { supersedesSnapshotId: snapshot.supersedesSnapshotId }),
  }
}

function parseSealedSnapshot(value: unknown): ParseResult<CapabilityRegistrySnapshotV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'createdAt',
    'entries',
    'snapshotId',
  ], ['supersedesSnapshotId'])
  if (record === undefined) return rejected('registry-snapshot-invalid')
  const body = parseSnapshotBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    createdAt: record.createdAt,
    entries: record.entries,
    ...(hasOwn(record, 'supersedesSnapshotId') ? { supersedesSnapshotId: record.supersedesSnapshotId } : {}),
  })
  if (body.ok === false) return body
  const snapshotId = exactDigest(record.snapshotId, REGISTRY_DIGEST)
  if (snapshotId === undefined) return rejected('registry-snapshot-invalid')
  const expected = digest('capability-registry', canonicalJson(canonicalSnapshot(body.value)))
  if (snapshotId !== expected) return rejected('registry-snapshot-digest-mismatch')
  return parsed({ ...body.value, snapshotId })
}

function parseTransition(value: unknown): ParseResult<CapabilityRegistryTransitionInputV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'current',
    'capabilityId',
    'toState',
    'effectiveAt',
    'reason',
  ], ['approval'])
  if (record === undefined) return rejected('registry-transition-invalid')
  if (record.schemaVersion !== TRANSITION_SCHEMA_VERSION || record.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    return rejected('registry-schema-unsupported')
  }
  const current = parseSealedSnapshot(record.current)
  if (current.ok === false) return current
  const capabilityId = exactString(record.capabilityId, CAPABILITY_ID, 160)
  const toState = parseState(record.toState)
  const effectiveAt = exactTimestamp(record.effectiveAt)
  const reason = exactString(record.reason, undefined, 512)
  const approval = hasOwn(record, 'approval') ? parseApproval(record.approval) : undefined
  if (
    capabilityId === undefined ||
    toState === undefined ||
    effectiveAt === undefined ||
    reason === undefined ||
    (hasOwn(record, 'approval') && approval === undefined)
  ) return rejected('registry-transition-invalid')
  return parsed({
    schemaVersion: TRANSITION_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    current: current.value,
    capabilityId,
    toState,
    effectiveAt,
    reason,
    ...(approval === undefined ? {} : { approval }),
  })
}

export function canonicalizeCapabilityRegistryEntry(entry: CapabilityRegistryEntryBodyV1): string {
  const parsedEntry = parseEntry(entry)
  if (parsedEntry.ok === false) throw new TypeError(FAILURE_REASONS[parsedEntry.code])
  return canonicalJson(canonicalEntry(parsedEntry.value))
}

export function computeCapabilityRegistryEntryDigest(entry: CapabilityRegistryEntryBodyV1): string {
  return digest('capability-registry-entry', canonicalizeCapabilityRegistryEntry(entry))
}

export function canonicalizeCapabilityRegistrySnapshot(snapshot: CapabilityRegistrySnapshotBodyV1): string {
  const parsedSnapshot = parseSnapshotBody(snapshot)
  if (parsedSnapshot.ok === false) throw new TypeError(FAILURE_REASONS[parsedSnapshot.code])
  return canonicalJson(canonicalSnapshot(parsedSnapshot.value))
}

export function computeCapabilityRegistrySnapshotId(snapshot: CapabilityRegistrySnapshotBodyV1): string {
  return digest('capability-registry', canonicalizeCapabilityRegistrySnapshot(snapshot))
}

export function sealCapabilityRegistrySnapshot(
  snapshot: CapabilityRegistrySnapshotBodyV1,
): CapabilityRegistryKernelResult<CapabilityRegistrySnapshotV1> {
  const parsedSnapshot = parseSnapshotBody(snapshot)
  if (parsedSnapshot.ok === false) return failure(parsedSnapshot.code)
  const snapshotId = digest('capability-registry', canonicalJson(canonicalSnapshot(parsedSnapshot.value)))
  return success({ ...parsedSnapshot.value, snapshotId })
}

export function parseCapabilityRegistrySnapshot(
  value: unknown,
): CapabilityRegistryKernelResult<CapabilityRegistrySnapshotV1> {
  const parsedSnapshot = parseSealedSnapshot(value)
  return parsedSnapshot.ok === false ? failure(parsedSnapshot.code) : success(parsedSnapshot.value)
}

export function transitionCapabilityRegistry(
  value: unknown,
): CapabilityRegistryKernelResult<CapabilityRegistrySnapshotV1> {
  const parsedTransition = parseTransition(value)
  if (parsedTransition.ok === false) return failure(parsedTransition.code)
  const transition = parsedTransition.value
  const currentEntry = transition.current.entries.find(
    (entry) => entry.capabilityId === transition.capabilityId,
  )
  if (currentEntry === undefined) return failure('registry-entry-not-found')
  if (currentEntry.state === 'revoked') return failure('registry-revoked')
  if (currentEntry.state === transition.toState) return failure('registry-transition-invalid')
  if (transition.toState === 'approved') {
    if (currentEntry.state !== 'candidate' && currentEntry.state !== 'disabled') {
      return failure('registry-transition-invalid')
    }
    if (currentEntry.descriptor.verification !== 'verified') {
      return failure('registry-descriptor-unverified')
    }
    if (currentEntry.operations.length === 0) return failure('registry-operation-mapping-invalid')
    if (transition.approval === undefined) return failure('registry-approval-required')
    if (currentEntry.expiresAt !== undefined && currentEntry.expiresAt <= transition.effectiveAt) {
      return failure('registry-transition-invalid')
    }
  } else if (
    transition.toState !== 'disabled' &&
    transition.toState !== 'revoked'
  ) {
    return failure('registry-transition-invalid')
  }

  const approvals = transition.approval === undefined
    ? currentEntry.approvals
    : [...currentEntry.approvals, transition.approval]
  const updatedEntry: CapabilityRegistryEntryBodyV1 = {
    ...currentEntry,
    state: transition.toState,
    approvals,
    effectiveAt: transition.effectiveAt,
  }
  const entries = transition.current.entries.map((entry) =>
    entry.capabilityId === transition.capabilityId ? updatedEntry : entry,
  )
  return sealCapabilityRegistrySnapshot({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    createdAt: transition.effectiveAt,
    entries,
    supersedesSnapshotId: transition.current.snapshotId,
  })
}

export function createCapabilityRegistryKernel(): Readonly<{
  readonly canonicalizeEntry: typeof canonicalizeCapabilityRegistryEntry
  readonly computeEntryDigest: typeof computeCapabilityRegistryEntryDigest
  readonly canonicalizeSnapshot: typeof canonicalizeCapabilityRegistrySnapshot
  readonly computeSnapshotId: typeof computeCapabilityRegistrySnapshotId
  readonly sealSnapshot: typeof sealCapabilityRegistrySnapshot
  readonly parseSnapshot: typeof parseCapabilityRegistrySnapshot
  readonly transition: typeof transitionCapabilityRegistry
}> {
  return Object.freeze({
    canonicalizeEntry: canonicalizeCapabilityRegistryEntry,
    computeEntryDigest: computeCapabilityRegistryEntryDigest,
    canonicalizeSnapshot: canonicalizeCapabilityRegistrySnapshot,
    computeSnapshotId: computeCapabilityRegistrySnapshotId,
    sealSnapshot: sealCapabilityRegistrySnapshot,
    parseSnapshot: parseCapabilityRegistrySnapshot,
    transition: transitionCapabilityRegistry,
  })
}
