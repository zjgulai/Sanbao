import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import type { EffectClass } from '../domain/business-matter.js'

export type CompatibilityTargetRequirementStateV1 = 'active' | 'revoked'

export interface CompatibilityTargetActionRequirementV1 {
  readonly actionScope: string
  readonly effectClass: EffectClass
  readonly requiresDecision: boolean
}

export interface CompatibilityTargetPolicyRequirementV1 {
  readonly identity: string
  readonly version: string
  readonly digest: string
}

export interface CompatibilityTargetComponentRequirementV1 {
  readonly identity: string
  readonly version: string
  readonly artifactDigest: string
  readonly contractDigest: string
  readonly behaviorConfigurationDigest: string
}

export interface CompatibilityTargetOwnerDecisionV1 {
  readonly decisionId: string
  readonly ownerId: string
  readonly decidedAt: string
  readonly reason: string
}

export interface CompatibilityTargetRequirementBodyV1 {
  readonly schemaVersion: 'sage.compatibility-target-requirement-entry.v1'
  readonly canonicalizationVersion: 'sage.compatibility-target-requirement-canonical-json.v1'
  readonly requirementId: string
  readonly requirementVersion: string
  readonly state: CompatibilityTargetRequirementStateV1
  readonly actionRequirements: readonly CompatibilityTargetActionRequirementV1[]
  readonly permissionRequirements: readonly CompatibilityTargetPolicyRequirementV1[]
  readonly dataBoundaryRequirements: readonly CompatibilityTargetPolicyRequirementV1[]
  readonly provider: CompatibilityTargetComponentRequirementV1
  readonly model: CompatibilityTargetComponentRequirementV1
  readonly agent: CompatibilityTargetComponentRequirementV1
  readonly preset: CompatibilityTargetComponentRequirementV1
  readonly capabilities: readonly CompatibilityTargetComponentRequirementV1[]
  readonly ownerDecision: CompatibilityTargetOwnerDecisionV1
  readonly effectiveAt: string
  readonly expiresAt?: string
  readonly revokedAt?: string
  readonly revocationReason?: string
}

export interface CompatibilityTargetRequirementV1 extends CompatibilityTargetRequirementBodyV1 {
  readonly requirementDigest: string
}

export interface CompatibilityTargetRequirementSnapshotBodyV1 {
  readonly schemaVersion: 'sage.compatibility-target-requirement.v1'
  readonly canonicalizationVersion: 'sage.compatibility-target-requirement-canonical-json.v1'
  readonly createdAt: string
  readonly publicationDecision: CompatibilityTargetOwnerDecisionV1
  readonly entries: readonly CompatibilityTargetRequirementBodyV1[]
  readonly supersedesSnapshotId?: string
}

export interface CompatibilityTargetRequirementSnapshotV1
  extends Omit<CompatibilityTargetRequirementSnapshotBodyV1, 'entries'> {
  readonly entries: readonly CompatibilityTargetRequirementV1[]
  readonly snapshotId: string
}

export interface CompatibilityTargetProviderRequestV1 {
  readonly requirementId: string
  readonly actionScope: string
  readonly evaluatedAt: string
}

export interface CompatibilityTargetProviderAvailableV1 {
  readonly kind: 'available'
  readonly snapshotId: string
  readonly requirement: CompatibilityTargetRequirementV1
}

export type CompatibilityTargetProviderFailureCodeV1 =
  | 'requirement-provider-unavailable'
  | 'requirement-request-invalid'
  | 'requirement-not-found'
  | 'requirement-revoked'
  | 'requirement-not-effective'
  | 'requirement-expired'
  | 'requirement-action-not-declared'

export interface CompatibilityTargetProviderUnavailableV1 {
  readonly kind: 'unavailable'
  readonly code: CompatibilityTargetProviderFailureCodeV1
  readonly reason: string
}

export type CompatibilityTargetProviderResultV1 =
  | CompatibilityTargetProviderAvailableV1
  | CompatibilityTargetProviderUnavailableV1

export type CompatibilityTargetRequirementFailureCodeV1 =
  | 'requirement-invalid'
  | 'requirement-schema-unsupported'
  | 'requirement-entry-invalid'
  | 'requirement-digest-mismatch'
  | 'requirement-entry-duplicate'
  | 'requirement-action-duplicate'
  | 'requirement-policy-duplicate'
  | 'requirement-snapshot-invalid'
  | 'requirement-snapshot-digest-mismatch'
  | 'requirement-snapshot-lineage-invalid'

export type CompatibilityTargetRequirementResultV1<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: CompatibilityTargetRequirementFailureCodeV1
    readonly reason: string
  }>

export interface CompatibilityTargetProviderV1 {
  readonly resolve: (input: unknown) => CompatibilityTargetProviderResultV1
}

export interface CompatibilityTargetRequirementKernelV1 {
  readonly canonicalizeRequirement: (
    body: CompatibilityTargetRequirementBodyV1,
  ) => string
  readonly computeRequirementDigest: (
    body: CompatibilityTargetRequirementBodyV1,
  ) => string
  readonly sealRequirement: (
    body: CompatibilityTargetRequirementBodyV1,
  ) => CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1>
  readonly parseRequirement: (
    value: unknown,
  ) => CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1>
  readonly canonicalizeSnapshot: (
    body: CompatibilityTargetRequirementSnapshotBodyV1,
  ) => string
  readonly computeSnapshotId: (
    body: CompatibilityTargetRequirementSnapshotBodyV1,
  ) => string
  readonly sealSnapshot: (
    body: CompatibilityTargetRequirementSnapshotBodyV1,
  ) => CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementSnapshotV1>
  readonly parseSnapshot: (
    value: unknown,
  ) => CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementSnapshotV1>
}

const ENTRY_SCHEMA_VERSION = 'sage.compatibility-target-requirement-entry.v1'
const REGISTRY_SCHEMA_VERSION = 'sage.compatibility-target-requirement.v1'
const CANONICALIZATION_VERSION = 'sage.compatibility-target-requirement-canonical-json.v1'
const REQUIREMENT_DIGEST = /^urn:sage:compatibility-target-requirement:sha256:[0-9a-f]{64}$/u
const SNAPSHOT_ID = /^urn:sage:compatibility-target-requirement-snapshot:sha256:[0-9a-f]{64}$/u
const CONTENT_DIGEST = /^sha256:[0-9a-f]{64}$/u
const REQUIREMENT_ID = /^requirement:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
// Component identities mirror the RUNTIME side's identities verbatim — the requirement must be
// able to name exactly what the sealed descriptor names (`provider:deepseek-official`,
// `model:deepseek-official/deepseek-flash`, `agent:@deepseek-ai/dsh-agent`, `preset:set`). The
// fixture era's `:sage…`-only grammar rejected every real identity; the asymmetry surfaced on the
// first real publication composition (2026-10-10) because the V2 descriptor side has always
// accepted bare strings. Garbage stays rejected: lowercase kind, bounded token remainder.
const COMPONENT_IDENTITY = /^[a-z][a-z0-9._-]{0,31}:@?[a-z0-9][a-z0-9._@/-]*$/u
const POLICY_IDENTITY = /^[a-z][a-z0-9._-]{0,31}:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const ACTION_SCOPE = /^[a-z][a-z0-9._:-]{0,127}$/u
const DECISION_ID = /^decision:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const OWNER_ID = /^owner:sage(?:[._-][a-z0-9][a-z0-9._-]*)?$/u
const ISO_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?Z$/u
const EXACT_SEMVER =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const EXACT_CALENDAR_VERSION = /^(\d{4})-(\d{2})-(\d{2})$/u
const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]

const FAILURE_REASONS: Readonly<Record<CompatibilityTargetRequirementFailureCodeV1, string>> = {
  'requirement-invalid': 'The compatibility target requirement is invalid.',
  'requirement-schema-unsupported': 'The compatibility target requirement schema is unsupported.',
  'requirement-entry-invalid': 'The compatibility target requirement entry is invalid.',
  'requirement-digest-mismatch': 'The compatibility target requirement digest does not match its canonical content.',
  'requirement-entry-duplicate': 'The compatibility target requirement registry contains a duplicate entry.',
  'requirement-action-duplicate': 'The compatibility target requirement contains a duplicate action.',
  'requirement-policy-duplicate': 'The compatibility target requirement contains a duplicate policy.',
  'requirement-snapshot-invalid': 'The compatibility target requirement snapshot is invalid.',
  'requirement-snapshot-digest-mismatch': 'The compatibility target requirement snapshot identifier does not match its content.',
  'requirement-snapshot-lineage-invalid': 'The compatibility target requirement snapshot lineage is invalid.',
}

const PROVIDER_FAILURE_REASONS: Readonly<Record<CompatibilityTargetProviderFailureCodeV1, string>> = {
  'requirement-provider-unavailable': 'The bundled compatibility target requirement snapshot is unavailable.',
  'requirement-request-invalid': 'The compatibility target requirement lookup request is invalid.',
  'requirement-not-found': 'The requested compatibility target requirement was not found.',
  'requirement-revoked': 'The requested compatibility target requirement has been revoked.',
  'requirement-not-effective': 'The requested compatibility target requirement is not effective yet.',
  'requirement-expired': 'The requested compatibility target requirement has expired.',
  'requirement-action-not-declared': 'The requested action is not declared by the target requirement.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly code: CompatibilityTargetRequirementFailureCodeV1 }>

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  if (typeof value !== 'object' || value === null) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Canonical value is invalid.')
    return encoded
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort(compareStrings)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) freezeDeep(descriptor.value)
  }
  return Object.freeze(value)
}

function success<T>(value: T): CompatibilityTargetRequirementResultV1<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: CompatibilityTargetRequirementFailureCodeV1): CompatibilityTargetRequirementResultV1<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function providerFailure(
  code: CompatibilityTargetProviderFailureCodeV1,
): CompatibilityTargetProviderUnavailableV1 {
  return Object.freeze({ kind: 'unavailable' as const, code, reason: PROVIDER_FAILURE_REASONS[code] })
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
      ) return undefined
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
  ) return undefined
  return inspected.values
}

function exactArray(value: unknown): readonly unknown[] | undefined {
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
      keys.length !== lengthDescriptor.value + 1 ||
      keys.some((key) => key !== 'length' && !/^\d+$/u.test(String(key)))
    ) return undefined
    const result: unknown[] = []
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[index]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) return undefined
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
  ) return undefined
  if (pattern !== undefined && !pattern.test(value)) return undefined
  return value
}

function exactBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
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
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) return undefined
  return timestamp
}

function exactVersion(value: unknown): string | undefined {
  const version = exactString(value, undefined, 128)
  if (version === undefined) return undefined
  if (EXACT_SEMVER.test(version)) return version
  const dateParts = EXACT_CALENDAR_VERSION.exec(version)
  if (dateParts === null) return undefined
  const year = Number(dateParts[1])
  const month = Number(dateParts[2])
  const day = Number(dateParts[3])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!
    ? version
    : undefined
}

function exactContentDigest(value: unknown): string | undefined {
  return exactString(value, CONTENT_DIGEST, 71)
}

function parseActionRequirements(value: unknown): ParseResult<readonly CompatibilityTargetActionRequirementV1[]> {
  const values = exactArray(value)
  if (values === undefined) return { ok: false, code: 'requirement-entry-invalid' }
  const actions: CompatibilityTargetActionRequirementV1[] = []
  const seen = new Set<string>()
  for (const candidate of values) {
    const record = exactRecord(candidate, ['actionScope', 'effectClass', 'requiresDecision'])
    const actionScope = record === undefined ? undefined : exactString(record.actionScope, ACTION_SCOPE, 128)
    const effectClass = record === undefined ? undefined : exactString(record.effectClass, undefined, 32)
    const requiresDecision = record === undefined ? undefined : exactBoolean(record.requiresDecision)
    if (
      actionScope === undefined ||
      effectClass === undefined ||
      !EFFECT_CLASSES.includes(effectClass as EffectClass) ||
      requiresDecision === undefined
    ) return { ok: false, code: 'requirement-entry-invalid' }
    if (seen.has(actionScope)) return { ok: false, code: 'requirement-action-duplicate' }
    seen.add(actionScope)
    actions.push({ actionScope, effectClass: effectClass as EffectClass, requiresDecision })
  }
  actions.sort((left, right) => compareStrings(left.actionScope, right.actionScope))
  return { ok: true, value: actions }
}

function parsePolicyRequirements(
  value: unknown,
): ParseResult<readonly CompatibilityTargetPolicyRequirementV1[]> {
  const values = exactArray(value)
  if (values === undefined) return { ok: false, code: 'requirement-entry-invalid' }
  const policies: CompatibilityTargetPolicyRequirementV1[] = []
  const seen = new Set<string>()
  for (const candidate of values) {
    const record = exactRecord(candidate, ['identity', 'version', 'digest'])
    const identity = record === undefined ? undefined : exactString(record.identity, POLICY_IDENTITY, 128)
    const version = record === undefined ? undefined : exactVersion(record.version)
    const digestValue = record === undefined ? undefined : exactContentDigest(record.digest)
    if (identity === undefined || version === undefined || digestValue === undefined) {
      return { ok: false, code: 'requirement-entry-invalid' }
    }
    if (seen.has(identity)) return { ok: false, code: 'requirement-policy-duplicate' }
    seen.add(identity)
    policies.push({ identity, version, digest: digestValue })
  }
  policies.sort((left, right) => compareStrings(left.identity, right.identity))
  return { ok: true, value: policies }
}

function parseComponentRequirement(
  value: unknown,
): CompatibilityTargetComponentRequirementV1 | undefined {
  const record = exactRecord(value, [
    'identity',
    'version',
    'artifactDigest',
    'contractDigest',
    'behaviorConfigurationDigest',
  ])
  if (record === undefined) return undefined
  const identity = exactString(record.identity, COMPONENT_IDENTITY, 128)
  const version = exactVersion(record.version)
  const artifactDigest = exactContentDigest(record.artifactDigest)
  const contractDigest = exactContentDigest(record.contractDigest)
  const behaviorConfigurationDigest = exactContentDigest(record.behaviorConfigurationDigest)
  if (
    identity === undefined ||
    version === undefined ||
    artifactDigest === undefined ||
    contractDigest === undefined ||
    behaviorConfigurationDigest === undefined
  ) return undefined
  return { identity, version, artifactDigest, contractDigest, behaviorConfigurationDigest }
}

function parseOwnerDecision(value: unknown): CompatibilityTargetOwnerDecisionV1 | undefined {
  const record = exactRecord(value, ['decisionId', 'ownerId', 'decidedAt', 'reason'])
  if (record === undefined) return undefined
  const decisionId = exactString(record.decisionId, DECISION_ID, 128)
  const ownerId = exactString(record.ownerId, OWNER_ID, 128)
  const decidedAt = exactTimestamp(record.decidedAt)
  const reason = exactString(record.reason, undefined, 1024)
  if (decisionId === undefined || ownerId === undefined || decidedAt === undefined || reason === undefined) {
    return undefined
  }
  return { decisionId, ownerId, decidedAt, reason }
}

function parseRequirementBody(value: unknown): ParseResult<CompatibilityTargetRequirementBodyV1> {
  const record = exactRecord(
    value,
    [
      'schemaVersion',
      'canonicalizationVersion',
      'requirementId',
      'requirementVersion',
      'state',
      'actionRequirements',
      'permissionRequirements',
      'dataBoundaryRequirements',
      'provider',
      'model',
      'agent',
      'preset',
      'capabilities',
      'ownerDecision',
      'effectiveAt',
    ],
    ['expiresAt', 'revokedAt', 'revocationReason'],
  )
  if (record === undefined) return { ok: false, code: 'requirement-entry-invalid' }
  if (
    record.schemaVersion !== ENTRY_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION
  ) return { ok: false, code: 'requirement-schema-unsupported' }

  const requirementId = exactString(record.requirementId, REQUIREMENT_ID, 128)
  const requirementVersion = exactVersion(record.requirementVersion)
  const state = exactString(record.state, undefined, 16)
  const actionRequirements = parseActionRequirements(record.actionRequirements)
  const permissionRequirements = parsePolicyRequirements(record.permissionRequirements)
  const dataBoundaryRequirements = parsePolicyRequirements(record.dataBoundaryRequirements)
  if (!actionRequirements.ok) return actionRequirements
  if (!permissionRequirements.ok) return permissionRequirements
  if (!dataBoundaryRequirements.ok) return dataBoundaryRequirements
  const provider = parseComponentRequirement(record.provider)
  const model = parseComponentRequirement(record.model)
  const agent = parseComponentRequirement(record.agent)
  const preset = parseComponentRequirement(record.preset)
  const capabilityValues = exactArray(record.capabilities)
  const capabilities: CompatibilityTargetComponentRequirementV1[] = []
  const capabilityIdentities = new Set<string>()
  if (capabilityValues !== undefined) {
    for (const candidate of capabilityValues) {
      const capability = parseComponentRequirement(candidate)
      if (capability === undefined) return { ok: false, code: 'requirement-entry-invalid' }
      if (capabilityIdentities.has(capability.identity)) {
        return { ok: false, code: 'requirement-entry-duplicate' }
      }
      capabilityIdentities.add(capability.identity)
      capabilities.push(capability)
    }
  }
  const ownerDecision = parseOwnerDecision(record.ownerDecision)
  const effectiveAt = exactTimestamp(record.effectiveAt)
  const expiresAt = record.expiresAt === undefined ? undefined : exactTimestamp(record.expiresAt)
  const revokedAt = record.revokedAt === undefined ? undefined : exactTimestamp(record.revokedAt)
  const revocationReason = record.revocationReason === undefined
    ? undefined
    : exactString(record.revocationReason, undefined, 1024)
  if (
    requirementId === undefined ||
    requirementVersion === undefined ||
    state === undefined ||
    !(['active', 'revoked'] as readonly string[]).includes(state) ||
    provider === undefined ||
    model === undefined ||
    agent === undefined ||
    preset === undefined ||
    capabilityValues === undefined ||
    ownerDecision === undefined ||
    effectiveAt === undefined ||
    (record.expiresAt !== undefined && expiresAt === undefined) ||
    (record.revokedAt !== undefined && revokedAt === undefined) ||
    (record.revocationReason !== undefined && revocationReason === undefined)
  ) return { ok: false, code: 'requirement-entry-invalid' }

  const effectiveMillis = Date.parse(effectiveAt)
  const decidedMillis = Date.parse(ownerDecision.decidedAt)
  if (decidedMillis > effectiveMillis) return { ok: false, code: 'requirement-entry-invalid' }
  if (expiresAt !== undefined && Date.parse(expiresAt) <= effectiveMillis) {
    return { ok: false, code: 'requirement-entry-invalid' }
  }
  if (state === 'active' && (revokedAt !== undefined || revocationReason !== undefined)) {
    return { ok: false, code: 'requirement-entry-invalid' }
  }
  if (state === 'revoked' && (revokedAt === undefined || revocationReason === undefined)) {
    return { ok: false, code: 'requirement-entry-invalid' }
  }
  if (revokedAt !== undefined && Date.parse(revokedAt) < effectiveMillis) {
    return { ok: false, code: 'requirement-entry-invalid' }
  }
  capabilities.sort((left, right) => compareStrings(left.identity, right.identity))
  return {
    ok: true,
    value: {
      schemaVersion: ENTRY_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      requirementId,
      requirementVersion,
      state: state as CompatibilityTargetRequirementStateV1,
      actionRequirements: actionRequirements.value,
      permissionRequirements: permissionRequirements.value,
      dataBoundaryRequirements: dataBoundaryRequirements.value,
      provider,
      model,
      agent,
      preset,
      capabilities,
      ownerDecision,
      effectiveAt,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      ...(revokedAt === undefined ? {} : { revokedAt }),
      ...(revocationReason === undefined ? {} : { revocationReason }),
    },
  }
}

function parseRequirement(value: unknown): ParseResult<CompatibilityTargetRequirementV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'requirementId',
    'requirementVersion',
    'state',
    'actionRequirements',
    'permissionRequirements',
    'dataBoundaryRequirements',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'ownerDecision',
    'effectiveAt',
    'requirementDigest',
  ], ['expiresAt', 'revokedAt', 'revocationReason'])
  if (record === undefined) return { ok: false, code: 'requirement-invalid' }
  const body = parseRequirementBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    requirementId: record.requirementId,
    requirementVersion: record.requirementVersion,
    state: record.state,
    actionRequirements: record.actionRequirements,
    permissionRequirements: record.permissionRequirements,
    dataBoundaryRequirements: record.dataBoundaryRequirements,
    provider: record.provider,
    model: record.model,
    agent: record.agent,
    preset: record.preset,
    capabilities: record.capabilities,
    ownerDecision: record.ownerDecision,
    effectiveAt: record.effectiveAt,
    ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt }),
    ...(record.revokedAt === undefined ? {} : { revokedAt: record.revokedAt }),
    ...(record.revocationReason === undefined ? {} : { revocationReason: record.revocationReason }),
  })
  if (!body.ok) return body
  const requirementDigest = exactString(record.requirementDigest, REQUIREMENT_DIGEST, 120)
  if (requirementDigest === undefined) return { ok: false, code: 'requirement-invalid' }
  const expected = `urn:sage:compatibility-target-requirement:sha256:${digest(canonicalJson(body.value))}`
  if (requirementDigest !== expected) return { ok: false, code: 'requirement-digest-mismatch' }
  return { ok: true, value: { ...body.value, requirementDigest } }
}

function normalizeRequirementBody(
  body: CompatibilityTargetRequirementBodyV1,
): ParseResult<CompatibilityTargetRequirementBodyV1> {
  return parseRequirementBody(body)
}

function canonicalRequirementBody(body: CompatibilityTargetRequirementBodyV1): string {
  const normalized = normalizeRequirementBody(body)
  if (!normalized.ok) throw new TypeError(normalized.code)
  return canonicalJson(normalized.value)
}

function requirementDigest(body: CompatibilityTargetRequirementBodyV1): string {
  return `urn:sage:compatibility-target-requirement:sha256:${digest(canonicalRequirementBody(body))}`
}

function parseSnapshotBody(
  value: unknown,
): ParseResult<CompatibilityTargetRequirementSnapshotBodyV1> {
  const record = exactRecord(
    value,
    ['schemaVersion', 'canonicalizationVersion', 'createdAt', 'publicationDecision', 'entries'],
    ['supersedesSnapshotId'],
  )
  if (record === undefined) return { ok: false, code: 'requirement-snapshot-invalid' }
  if (
    record.schemaVersion !== REGISTRY_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION
  ) return { ok: false, code: 'requirement-schema-unsupported' }
  const createdAt = exactTimestamp(record.createdAt)
  const publicationDecision = parseOwnerDecision(record.publicationDecision)
  const entriesValue = exactArray(record.entries)
  const supersedesSnapshotId = record.supersedesSnapshotId === undefined
    ? undefined
    : exactString(record.supersedesSnapshotId, SNAPSHOT_ID, 130)
  if (
    createdAt === undefined ||
    publicationDecision === undefined ||
    entriesValue === undefined ||
    (record.supersedesSnapshotId !== undefined && supersedesSnapshotId === undefined)
  ) return { ok: false, code: 'requirement-snapshot-invalid' }
  const entries: CompatibilityTargetRequirementBodyV1[] = []
  const identities = new Set<string>()
  for (const entryValue of entriesValue) {
    const entry = parseRequirementBody(entryValue)
    if (!entry.ok) return entry
    if (identities.has(entry.value.requirementId)) {
      return { ok: false, code: 'requirement-entry-duplicate' }
    }
    identities.add(entry.value.requirementId)
    entries.push(entry.value)
  }
  if (Date.parse(publicationDecision.decidedAt) > Date.parse(createdAt)) {
    return { ok: false, code: 'requirement-snapshot-lineage-invalid' }
  }
  entries.sort((left, right) => compareStrings(left.requirementId, right.requirementId))
  return {
    ok: true,
    value: {
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      canonicalizationVersion: CANONICALIZATION_VERSION,
      createdAt,
      publicationDecision,
      entries,
      ...(supersedesSnapshotId === undefined ? {} : { supersedesSnapshotId }),
    },
  }
}

function sealEntryUnchecked(body: CompatibilityTargetRequirementBodyV1): CompatibilityTargetRequirementV1 {
  return { ...body, requirementDigest: requirementDigest(body) }
}

function normalizeSnapshotBody(
  body: CompatibilityTargetRequirementSnapshotBodyV1,
): ParseResult<CompatibilityTargetRequirementSnapshotBodyV1 & {
  readonly entries: readonly CompatibilityTargetRequirementV1[]
}> {
  const normalized = parseSnapshotBody(body)
  if (!normalized.ok) return normalized
  return {
    ok: true,
    value: {
      ...normalized.value,
      entries: normalized.value.entries.map(sealEntryUnchecked),
    },
  }
}

function canonicalSnapshotBody(body: CompatibilityTargetRequirementSnapshotBodyV1): string {
  const normalized = normalizeSnapshotBody(body)
  if (!normalized.ok) throw new TypeError(normalized.code)
  return canonicalJson(normalized.value)
}

function snapshotId(body: CompatibilityTargetRequirementSnapshotBodyV1): string {
  return `urn:sage:compatibility-target-requirement-snapshot:sha256:${digest(canonicalSnapshotBody(body))}`
}

function parseSnapshot(value: unknown): ParseResult<CompatibilityTargetRequirementSnapshotV1> {
  const record = exactRecord(
    value,
    [
      'schemaVersion',
      'canonicalizationVersion',
      'createdAt',
      'publicationDecision',
      'entries',
      'snapshotId',
    ],
    ['supersedesSnapshotId'],
  )
  if (record === undefined) return { ok: false, code: 'requirement-snapshot-invalid' }
  const entriesValue = exactArray(record.entries)
  if (entriesValue === undefined) return { ok: false, code: 'requirement-snapshot-invalid' }
  const parsedEntries: CompatibilityTargetRequirementV1[] = []
  for (const entry of entriesValue) {
    const parsed = parseRequirement(entry)
    if (!parsed.ok) return { ok: false, code: 'requirement-snapshot-invalid' }
    parsedEntries.push(parsed.value)
  }
  const body: CompatibilityTargetRequirementSnapshotBodyV1 = {
    schemaVersion: record.schemaVersion as CompatibilityTargetRequirementSnapshotBodyV1['schemaVersion'],
    canonicalizationVersion: record.canonicalizationVersion as CompatibilityTargetRequirementSnapshotBodyV1['canonicalizationVersion'],
    createdAt: record.createdAt as string,
    publicationDecision: record.publicationDecision as CompatibilityTargetOwnerDecisionV1,
    entries: parsedEntries.map(({ requirementDigest: _digest, ...entry }) => entry),
    ...(record.supersedesSnapshotId === undefined ? {} : { supersedesSnapshotId: record.supersedesSnapshotId as string }),
  }
  const normalized = normalizeSnapshotBody(body)
  if (!normalized.ok) return { ok: false, code: 'requirement-snapshot-invalid' }
  const snapshotIdValue = exactString(record.snapshotId, SNAPSHOT_ID, 130)
  if (snapshotIdValue === undefined) return { ok: false, code: 'requirement-snapshot-invalid' }
  const expected = snapshotId(body)
  if (snapshotIdValue !== expected) return { ok: false, code: 'requirement-snapshot-digest-mismatch' }
  if (parsedEntries.length !== normalized.value.entries.length) {
    return { ok: false, code: 'requirement-snapshot-invalid' }
  }
  return {
    ok: true,
    value: {
      ...normalized.value,
      snapshotId: snapshotIdValue,
    },
  }
}

function parseProviderRequest(value: unknown): CompatibilityTargetProviderRequestV1 | undefined {
  const record = exactRecord(value, ['requirementId', 'actionScope', 'evaluatedAt'])
  if (record === undefined) return undefined
  const requirementId = exactString(record.requirementId, REQUIREMENT_ID, 128)
  const actionScope = exactString(record.actionScope, ACTION_SCOPE, 128)
  const evaluatedAt = exactTimestamp(record.evaluatedAt)
  if (requirementId === undefined || actionScope === undefined || evaluatedAt === undefined) return undefined
  return { requirementId, actionScope, evaluatedAt }
}

function resolveProvider(
  parsedSnapshot: ParseResult<CompatibilityTargetRequirementSnapshotV1>,
  input: unknown,
): CompatibilityTargetProviderResultV1 {
  if (!parsedSnapshot.ok) return providerFailure('requirement-provider-unavailable')
  const request = parseProviderRequest(input)
  if (request === undefined) return providerFailure('requirement-request-invalid')
  const requirement = parsedSnapshot.value.entries.find((entry) => entry.requirementId === request.requirementId)
  if (requirement === undefined) return providerFailure('requirement-not-found')
  if (requirement.state === 'revoked') return providerFailure('requirement-revoked')
  const evaluatedMillis = Date.parse(request.evaluatedAt)
  if (evaluatedMillis < Date.parse(requirement.effectiveAt)) {
    return providerFailure('requirement-not-effective')
  }
  if (requirement.expiresAt !== undefined && evaluatedMillis >= Date.parse(requirement.expiresAt)) {
    return providerFailure('requirement-expired')
  }
  if (!requirement.actionRequirements.some((action) => action.actionScope === request.actionScope)) {
    return providerFailure('requirement-action-not-declared')
  }
  return Object.freeze({
    kind: 'available' as const,
    snapshotId: parsedSnapshot.value.snapshotId,
    requirement,
  })
}

export function canonicalizeCompatibilityTargetRequirement(
  body: CompatibilityTargetRequirementBodyV1,
): string {
  return canonicalRequirementBody(body)
}

export function computeCompatibilityTargetRequirementDigest(
  body: CompatibilityTargetRequirementBodyV1,
): string {
  return requirementDigest(body)
}

export function sealCompatibilityTargetRequirement(
  body: CompatibilityTargetRequirementBodyV1,
): CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1> {
  const parsed = parseRequirementBody(body)
  if (!parsed.ok) return failure(parsed.code)
  return success(sealEntryUnchecked(parsed.value))
}

export function parseCompatibilityTargetRequirement(
  value: unknown,
): CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementV1> {
  const parsed = parseRequirement(value)
  if (!parsed.ok) return failure(parsed.code)
  return success(parsed.value)
}

export function canonicalizeCompatibilityTargetRequirementSnapshot(
  body: CompatibilityTargetRequirementSnapshotBodyV1,
): string {
  return canonicalSnapshotBody(body)
}

export function computeCompatibilityTargetRequirementSnapshotId(
  body: CompatibilityTargetRequirementSnapshotBodyV1,
): string {
  return snapshotId(body)
}

export function sealCompatibilityTargetRequirementSnapshot(
  body: CompatibilityTargetRequirementSnapshotBodyV1,
): CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementSnapshotV1> {
  const normalized = normalizeSnapshotBody(body)
  if (!normalized.ok) return failure(normalized.code)
  return success({ ...normalized.value, snapshotId: snapshotId(body) })
}

export function parseCompatibilityTargetRequirementSnapshot(
  value: unknown,
): CompatibilityTargetRequirementResultV1<CompatibilityTargetRequirementSnapshotV1> {
  const parsed = parseSnapshot(value)
  if (!parsed.ok) return failure(parsed.code)
  return success(parsed.value)
}

export function createBundledCompatibilityTargetProvider(
  snapshot: unknown,
): CompatibilityTargetProviderV1 {
  const parsedSnapshot = parseCompatibilityTargetRequirementSnapshot(snapshot)
  return Object.freeze({
    resolve: (input: unknown): CompatibilityTargetProviderResultV1 => {
      if (!parsedSnapshot.ok) return providerFailure('requirement-provider-unavailable')
      return resolveProvider(parsedSnapshot, input)
    },
  })
}

export function createCompatibilityTargetRequirementKernel(): CompatibilityTargetRequirementKernelV1 {
  return Object.freeze({
    canonicalizeRequirement: canonicalizeCompatibilityTargetRequirement,
    computeRequirementDigest: computeCompatibilityTargetRequirementDigest,
    sealRequirement: sealCompatibilityTargetRequirement,
    parseRequirement: parseCompatibilityTargetRequirement,
    canonicalizeSnapshot: canonicalizeCompatibilityTargetRequirementSnapshot,
    computeSnapshotId: computeCompatibilityTargetRequirementSnapshotId,
    sealSnapshot: sealCompatibilityTargetRequirementSnapshot,
    parseSnapshot: parseCompatibilityTargetRequirementSnapshot,
  })
}
