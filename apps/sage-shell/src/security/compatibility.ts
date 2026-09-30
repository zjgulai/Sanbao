import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import type {
  ActionPolicy,
  EffectClass,
  VersionedIdentity,
} from '../domain/business-matter.js'

export type CompatibilityUnknownCode =
  | 'invalid-request'
  | 'target-invalid'
  | 'target-digest-mismatch'
  | 'inventory-invalid'
  | 'inventory-digest-mismatch'
  | 'inventory-not-active'
  | 'matrix-provider-unavailable'
  | 'matrix-artifact-invalid'
  | 'matrix-id-mismatch'
  | 'matrix-not-active'
  | 'matrix-revoked'
  | 'matrix-rule-duplicate'
  | 'matrix-rule-conflict'
  | 'matrix-rule-ambiguous'
  | 'no-matching-rule'

export interface CompatibilityCapabilityRequirement extends VersionedIdentity {
  readonly contractDigest: string
}

export interface RuntimeCapabilityIdentity extends VersionedIdentity {
  readonly configurationDigest: string
  readonly contractDigest: string
}

export interface CompatibilityTargetBody {
  readonly schemaVersion: 'sage.compatibility-target.v1'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v1'
  readonly matterId: string
  readonly revisionId: string
  readonly revisionDigest: string
  readonly actionPolicies: readonly ActionPolicy[]
  readonly permissionBoundaryDigest: string
  readonly dataDestinationDigest: string
  readonly provider: VersionedIdentity
  readonly model: VersionedIdentity
  readonly agent: VersionedIdentity
  readonly preset: VersionedIdentity
  readonly capabilities: readonly CompatibilityCapabilityRequirement[]
}

export interface CompatibilityTarget extends CompatibilityTargetBody {
  readonly targetDigest: string
}

export interface RuntimeInventoryBody {
  readonly schemaVersion: 'sage.runtime-inventory.v1'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v1'
  readonly activeGeneration: number
  readonly receiptDigest: string
  readonly materializationDigest: string
  readonly host: VersionedIdentity
  readonly harness: VersionedIdentity
  readonly provider: VersionedIdentity
  readonly model: VersionedIdentity
  readonly agent: VersionedIdentity
  readonly preset: VersionedIdentity
  readonly capabilities: readonly RuntimeCapabilityIdentity[]
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly observedAt: string
  readonly expiresAt: string
}

export interface RuntimeInventory extends RuntimeInventoryBody {
  readonly inventoryDigest: string
}

export interface CompatibilityMatrixRule {
  readonly ruleId: string
  readonly targetDigest: string
  readonly inventoryDigest: string
  readonly outcome: 'equivalent' | 'requires-new-revision'
  readonly reasonCode: string
  readonly reason: string
}

export interface CompatibilityMatrix {
  readonly schemaVersion: 'sage.compatibility-matrix.v1'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v1'
  readonly semanticVersion: '1.0.0'
  readonly targetContractVersion: 'sage.compatibility-target.v1'
  readonly inventoryContractVersion: 'sage.runtime-inventory.v1'
  readonly issuer: VersionedIdentity
  readonly validFrom: string
  readonly expiresAt: string
  readonly rules: readonly CompatibilityMatrixRule[]
}

export interface CompatibilityMatrixRevocation {
  readonly matrixId: string
  readonly revokedAt: string
  readonly reasonCode: string
}

export interface CompatibilityMatrixAvailable {
  readonly kind: 'available'
  readonly matrixId: string
  readonly canonicalMatrix: string
  readonly revocations: readonly CompatibilityMatrixRevocation[]
}

export interface CompatibilityMatrixUnavailable {
  readonly kind: 'unavailable'
}

export type CompatibilityMatrixProviderResult =
  | CompatibilityMatrixAvailable
  | CompatibilityMatrixUnavailable

export interface CompatibilityResolveInput {
  readonly evaluatedAt: string
  readonly currentRevision: {
    readonly matterId: string
    readonly revisionId: string
    readonly digest: string
  }
  readonly target: CompatibilityTarget
  readonly inventory: RuntimeInventory
  readonly matrix: CompatibilityMatrixProviderResult
}

export interface EquivalentCompatibilityResolution {
  readonly outcome: 'equivalent'
  readonly code: 'exact-match'
  readonly matrixId: string
  readonly reason: string
}

export interface NewRevisionCompatibilityResolution {
  readonly outcome: 'requires-new-revision'
  readonly code: 'semantic-change'
  readonly matrixId: string
  readonly reason: string
}

export interface UnknownCompatibilityResolution {
  readonly outcome: 'unknown'
  readonly code: CompatibilityUnknownCode
  readonly matrixId?: string
  readonly reason: string
}

export type CompatibilityResolution =
  | EquivalentCompatibilityResolution
  | NewRevisionCompatibilityResolution
  | UnknownCompatibilityResolution

export interface CompatibilityResolver {
  readonly resolve: (input: unknown) => CompatibilityResolution
}

const EFFECT_CLASSES: readonly EffectClass[] = [
  'local-read',
  'local-write',
  'external-read',
  'external-write',
  'privileged',
]

const UNKNOWN_REASONS: Readonly<Record<CompatibilityUnknownCode, string>> = {
  'invalid-request': 'The compatibility request is invalid.',
  'target-invalid': 'The compatibility target is invalid or not bound to the current revision.',
  'target-digest-mismatch': 'The compatibility target digest does not match its canonical content.',
  'inventory-invalid': 'The runtime inventory is invalid.',
  'inventory-digest-mismatch': 'The runtime inventory digest does not match its canonical content.',
  'inventory-not-active': 'The runtime inventory is not active at the evaluation instant.',
  'matrix-provider-unavailable': 'The compatibility matrix provider is unavailable.',
  'matrix-artifact-invalid': 'The compatibility matrix artifact is invalid.',
  'matrix-id-mismatch': 'The compatibility matrix identifier does not match its canonical content.',
  'matrix-not-active': 'The compatibility matrix is not active at the evaluation instant.',
  'matrix-revoked': 'The compatibility matrix was revoked before the evaluation instant.',
  'matrix-rule-duplicate': 'The compatibility matrix contains a duplicate rule identifier.',
  'matrix-rule-conflict': 'The compatibility matrix contains conflicting rules for this pair.',
  'matrix-rule-ambiguous': 'The compatibility matrix contains more than one rule for this pair.',
  'no-matching-rule': 'The compatibility matrix has no exact rule for this target and inventory pair.',
}

const TARGET_SCHEMA_VERSION = 'sage.compatibility-target.v1'
const INVENTORY_SCHEMA_VERSION = 'sage.runtime-inventory.v1'
const MATRIX_SCHEMA_VERSION = 'sage.compatibility-matrix.v1'
const CANONICALIZATION_VERSION = 'sage.compatibility-canonical-json.v1'
const MATRIX_SEMANTIC_VERSION = '1.0.0'
const MATRIX_AUTHORITY_IDENTITY = 'authority:sage-compatibility'
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u
const TARGET_DIGEST = /^urn:sage:compatibility-target:sha256:[0-9a-f]{64}$/u
const INVENTORY_DIGEST = /^urn:sage:runtime-inventory:sha256:[0-9a-f]{64}$/u
const MATRIX_ID = /^urn:sage:compatibility-matrix:sha256:[0-9a-f]{64}$/u

interface ParsedRequest {
  readonly evaluatedAt: string
  readonly currentRevision: CompatibilityResolveInput['currentRevision']
  readonly target: unknown
  readonly inventory: unknown
  readonly matrix: unknown
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  try {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      utilTypes.isProxy(value)
    ) {
      return undefined
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined

    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(descriptors)
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return undefined
    }

    const snapshot: Record<string, unknown> = Object.create(null)
    for (const key of expectedKeys) {
      const descriptor = descriptors[key]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      snapshot[key] = descriptor.value
    }
    return snapshot
  } catch {
    return undefined
  }
}

function exactArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return undefined
    if (Object.getPrototypeOf(value) !== Array.prototype) return undefined

    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined ||
      !Object.hasOwn(lengthDescriptor, 'value') ||
      typeof lengthDescriptor.value !== 'number' ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 0
    ) {
      return undefined
    }

    const length = lengthDescriptor.value
    const keys = Reflect.ownKeys(descriptors)
    if (keys.length !== length + 1) return undefined

    const snapshot: unknown[] = []
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)]
      if (
        descriptor === undefined ||
        !Object.hasOwn(descriptor, 'value') ||
        descriptor.enumerable !== true
      ) {
        return undefined
      }
      snapshot.push(descriptor.value)
    }
    return snapshot
  } catch {
    return undefined
  }
}

function exactString(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    return undefined
  }
  return value
}

function exactTimestamp(value: unknown): string | undefined {
  const timestamp = exactString(value)
  if (timestamp === undefined || !ISO_UTC_TIMESTAMP.test(timestamp)) return undefined
  const milliseconds = Date.parse(timestamp)
  if (Number.isNaN(milliseconds)) return undefined
  const normalized = timestamp.includes('.')
    ? timestamp
    : timestamp.replace(/Z$/u, '.000Z')
  return new Date(milliseconds).toISOString() === normalized ? timestamp : undefined
}

function exactNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

function parseVersionedIdentity(value: unknown): VersionedIdentity | undefined {
  const record = exactRecord(value, ['identity', 'version', 'digest'])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = exactString(record.version)
  const digest = exactString(record.digest)
  if (identity === undefined || version === undefined || digest === undefined) {
    return undefined
  }
  return { identity, version, digest }
}

function parseActionPolicy(value: unknown): ActionPolicy | undefined {
  const record = exactRecord(value, ['actionScope', 'effectClass', 'requiresDecision'])
  if (record === undefined) return undefined
  const actionScope = exactString(record.actionScope)
  if (
    actionScope === undefined ||
    typeof record.effectClass !== 'string' ||
    !EFFECT_CLASSES.includes(record.effectClass as EffectClass) ||
    typeof record.requiresDecision !== 'boolean'
  ) {
    return undefined
  }
  return {
    actionScope,
    effectClass: record.effectClass as EffectClass,
    requiresDecision: record.requiresDecision,
  }
}

function parseActionPolicies(value: unknown): readonly ActionPolicy[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const policies: ActionPolicy[] = []
  const scopes = new Set<string>()
  for (const candidate of values) {
    const policy = parseActionPolicy(candidate)
    if (policy === undefined || scopes.has(policy.actionScope)) return undefined
    scopes.add(policy.actionScope)
    policies.push(policy)
  }
  return policies.sort((left, right) => {
    const byScope = compareStrings(left.actionScope, right.actionScope)
    if (byScope !== 0) return byScope
    const byEffect = compareStrings(left.effectClass, right.effectClass)
    if (byEffect !== 0) return byEffect
    return Number(left.requiresDecision) - Number(right.requiresDecision)
  })
}

function parseTargetCapability(
  value: unknown,
): CompatibilityCapabilityRequirement | undefined {
  const record = exactRecord(value, ['identity', 'version', 'digest', 'contractDigest'])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = exactString(record.version)
  const digest = exactString(record.digest)
  const contractDigest = exactString(record.contractDigest)
  if (
    identity === undefined ||
    version === undefined ||
    digest === undefined ||
    contractDigest === undefined
  ) {
    return undefined
  }
  return { identity, version, digest, contractDigest }
}

function parseTargetCapabilities(
  value: unknown,
): readonly CompatibilityCapabilityRequirement[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const capabilities: CompatibilityCapabilityRequirement[] = []
  const identities = new Set<string>()
  for (const candidate of values) {
    const capability = parseTargetCapability(candidate)
    if (capability === undefined || identities.has(capability.identity)) return undefined
    identities.add(capability.identity)
    capabilities.push(capability)
  }
  return capabilities.sort((left, right) => compareStrings(left.identity, right.identity))
}

function parseRuntimeCapability(value: unknown): RuntimeCapabilityIdentity | undefined {
  const record = exactRecord(value, [
    'identity',
    'version',
    'digest',
    'configurationDigest',
    'contractDigest',
  ])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = exactString(record.version)
  const digest = exactString(record.digest)
  const configurationDigest = exactString(record.configurationDigest)
  const contractDigest = exactString(record.contractDigest)
  if (
    identity === undefined ||
    version === undefined ||
    digest === undefined ||
    configurationDigest === undefined ||
    contractDigest === undefined
  ) {
    return undefined
  }
  return { identity, version, digest, configurationDigest, contractDigest }
}

function parseRuntimeCapabilities(
  value: unknown,
): readonly RuntimeCapabilityIdentity[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const capabilities: RuntimeCapabilityIdentity[] = []
  const identities = new Set<string>()
  for (const candidate of values) {
    const capability = parseRuntimeCapability(candidate)
    if (capability === undefined || identities.has(capability.identity)) return undefined
    identities.add(capability.identity)
    capabilities.push(capability)
  }
  return capabilities.sort((left, right) => compareStrings(left.identity, right.identity))
}

function parseTargetBody(value: unknown): CompatibilityTargetBody | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionPolicies',
    'permissionBoundaryDigest',
    'dataDestinationDigest',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
  ])
  if (record === undefined) return undefined
  const matterId = exactString(record.matterId)
  const revisionId = exactString(record.revisionId)
  const revisionDigest = exactString(record.revisionDigest)
  const actionPolicies = parseActionPolicies(record.actionPolicies)
  const permissionBoundaryDigest = exactString(record.permissionBoundaryDigest)
  const dataDestinationDigest = exactString(record.dataDestinationDigest)
  const provider = parseVersionedIdentity(record.provider)
  const model = parseVersionedIdentity(record.model)
  const agent = parseVersionedIdentity(record.agent)
  const preset = parseVersionedIdentity(record.preset)
  const capabilities = parseTargetCapabilities(record.capabilities)
  if (
    record.schemaVersion !== TARGET_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    matterId === undefined ||
    revisionId === undefined ||
    revisionDigest === undefined ||
    actionPolicies === undefined ||
    permissionBoundaryDigest === undefined ||
    dataDestinationDigest === undefined ||
    provider === undefined ||
    model === undefined ||
    agent === undefined ||
    preset === undefined ||
    capabilities === undefined
  ) {
    return undefined
  }
  return {
    schemaVersion: TARGET_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    matterId,
    revisionId,
    revisionDigest,
    actionPolicies,
    permissionBoundaryDigest,
    dataDestinationDigest,
    provider,
    model,
    agent,
    preset,
    capabilities,
  }
}

function parseTarget(value: unknown): CompatibilityTarget | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionPolicies',
    'permissionBoundaryDigest',
    'dataDestinationDigest',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'targetDigest',
  ])
  if (record === undefined) return undefined
  const targetDigest = exactString(record.targetDigest)
  if (targetDigest === undefined) return undefined
  const body = parseTargetBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    matterId: record.matterId,
    revisionId: record.revisionId,
    revisionDigest: record.revisionDigest,
    actionPolicies: record.actionPolicies,
    permissionBoundaryDigest: record.permissionBoundaryDigest,
    dataDestinationDigest: record.dataDestinationDigest,
    provider: record.provider,
    model: record.model,
    agent: record.agent,
    preset: record.preset,
    capabilities: record.capabilities,
  })
  return body === undefined ? undefined : { ...body, targetDigest }
}

function parseInventoryBody(value: unknown): RuntimeInventoryBody | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'activeGeneration',
    'receiptDigest',
    'materializationDigest',
    'host',
    'harness',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'bootId',
    'runtimeGeneration',
    'observedAt',
    'expiresAt',
  ])
  if (record === undefined) return undefined
  const activeGeneration = exactNonNegativeInteger(record.activeGeneration)
  const receiptDigest = exactString(record.receiptDigest)
  const materializationDigest = exactString(record.materializationDigest)
  const host = parseVersionedIdentity(record.host)
  const harness = parseVersionedIdentity(record.harness)
  const provider = parseVersionedIdentity(record.provider)
  const model = parseVersionedIdentity(record.model)
  const agent = parseVersionedIdentity(record.agent)
  const preset = parseVersionedIdentity(record.preset)
  const capabilities = parseRuntimeCapabilities(record.capabilities)
  const bootId = exactString(record.bootId)
  const runtimeGeneration = exactNonNegativeInteger(record.runtimeGeneration)
  const observedAt = exactTimestamp(record.observedAt)
  const expiresAt = exactTimestamp(record.expiresAt)
  if (
    record.schemaVersion !== INVENTORY_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    activeGeneration === undefined ||
    receiptDigest === undefined ||
    materializationDigest === undefined ||
    host === undefined ||
    harness === undefined ||
    provider === undefined ||
    model === undefined ||
    agent === undefined ||
    preset === undefined ||
    capabilities === undefined ||
    bootId === undefined ||
    runtimeGeneration === undefined ||
    observedAt === undefined ||
    expiresAt === undefined ||
    Date.parse(observedAt) >= Date.parse(expiresAt)
  ) {
    return undefined
  }
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    activeGeneration,
    receiptDigest,
    materializationDigest,
    host,
    harness,
    provider,
    model,
    agent,
    preset,
    capabilities,
    bootId,
    runtimeGeneration,
    observedAt,
    expiresAt,
  }
}

function parseInventory(value: unknown): RuntimeInventory | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'activeGeneration',
    'receiptDigest',
    'materializationDigest',
    'host',
    'harness',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'bootId',
    'runtimeGeneration',
    'observedAt',
    'expiresAt',
    'inventoryDigest',
  ])
  if (record === undefined) return undefined
  const inventoryDigest = exactString(record.inventoryDigest)
  if (inventoryDigest === undefined) return undefined
  const body = parseInventoryBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    activeGeneration: record.activeGeneration,
    receiptDigest: record.receiptDigest,
    materializationDigest: record.materializationDigest,
    host: record.host,
    harness: record.harness,
    provider: record.provider,
    model: record.model,
    agent: record.agent,
    preset: record.preset,
    capabilities: record.capabilities,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    observedAt: record.observedAt,
    expiresAt: record.expiresAt,
  })
  return body === undefined ? undefined : { ...body, inventoryDigest }
}

function parseRule(value: unknown): CompatibilityMatrixRule | undefined {
  const record = exactRecord(value, [
    'ruleId',
    'targetDigest',
    'inventoryDigest',
    'outcome',
    'reasonCode',
    'reason',
  ])
  if (record === undefined) return undefined
  const ruleId = exactString(record.ruleId)
  const targetDigest = exactString(record.targetDigest)
  const inventoryDigest = exactString(record.inventoryDigest)
  const reasonCode = exactString(record.reasonCode)
  const reason = exactString(record.reason)
  if (
    ruleId === undefined ||
    targetDigest === undefined ||
    !TARGET_DIGEST.test(targetDigest) ||
    inventoryDigest === undefined ||
    !INVENTORY_DIGEST.test(inventoryDigest) ||
    (record.outcome !== 'equivalent' && record.outcome !== 'requires-new-revision') ||
    reasonCode === undefined ||
    reason === undefined
  ) {
    return undefined
  }
  return {
    ruleId,
    targetDigest,
    inventoryDigest,
    outcome: record.outcome,
    reasonCode,
    reason,
  }
}

function compareRules(left: CompatibilityMatrixRule, right: CompatibilityMatrixRule): number {
  for (const key of [
    'ruleId',
    'targetDigest',
    'inventoryDigest',
    'outcome',
    'reasonCode',
    'reason',
  ] as const) {
    const compared = compareStrings(left[key], right[key])
    if (compared !== 0) return compared
  }
  return 0
}

function parseMatrix(value: unknown): CompatibilityMatrix | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'semanticVersion',
    'targetContractVersion',
    'inventoryContractVersion',
    'issuer',
    'validFrom',
    'expiresAt',
    'rules',
  ])
  if (record === undefined) return undefined
  const issuer = parseVersionedIdentity(record.issuer)
  const validFrom = exactTimestamp(record.validFrom)
  const expiresAt = exactTimestamp(record.expiresAt)
  const rawRules = exactArray(record.rules)
  if (
    record.schemaVersion !== MATRIX_SCHEMA_VERSION ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION ||
    record.semanticVersion !== MATRIX_SEMANTIC_VERSION ||
    record.targetContractVersion !== TARGET_SCHEMA_VERSION ||
    record.inventoryContractVersion !== INVENTORY_SCHEMA_VERSION ||
    issuer === undefined ||
    issuer.identity !== MATRIX_AUTHORITY_IDENTITY ||
    validFrom === undefined ||
    expiresAt === undefined ||
    Date.parse(validFrom) >= Date.parse(expiresAt) ||
    rawRules === undefined
  ) {
    return undefined
  }
  const rules: CompatibilityMatrixRule[] = []
  for (const candidate of rawRules) {
    const parsed = parseRule(candidate)
    if (parsed === undefined) return undefined
    rules.push(parsed)
  }
  rules.sort(compareRules)
  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    semanticVersion: MATRIX_SEMANTIC_VERSION,
    targetContractVersion: TARGET_SCHEMA_VERSION,
    inventoryContractVersion: INVENTORY_SCHEMA_VERSION,
    issuer,
    validFrom,
    expiresAt,
    rules,
  }
}

function canonicalIdentity(identity: VersionedIdentity): VersionedIdentity {
  return {
    identity: identity.identity,
    version: identity.version,
    digest: identity.digest,
  }
}

function canonicalTargetBody(target: CompatibilityTargetBody): CompatibilityTargetBody {
  return {
    schemaVersion: TARGET_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    matterId: target.matterId,
    revisionId: target.revisionId,
    revisionDigest: target.revisionDigest,
    actionPolicies: target.actionPolicies.map((policy) => ({
      actionScope: policy.actionScope,
      effectClass: policy.effectClass,
      requiresDecision: policy.requiresDecision,
    })),
    permissionBoundaryDigest: target.permissionBoundaryDigest,
    dataDestinationDigest: target.dataDestinationDigest,
    provider: canonicalIdentity(target.provider),
    model: canonicalIdentity(target.model),
    agent: canonicalIdentity(target.agent),
    preset: canonicalIdentity(target.preset),
    capabilities: target.capabilities.map((capability) => ({
      identity: capability.identity,
      version: capability.version,
      digest: capability.digest,
      contractDigest: capability.contractDigest,
    })),
  }
}

function canonicalInventoryBody(inventory: RuntimeInventoryBody): RuntimeInventoryBody {
  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    activeGeneration: inventory.activeGeneration,
    receiptDigest: inventory.receiptDigest,
    materializationDigest: inventory.materializationDigest,
    host: canonicalIdentity(inventory.host),
    harness: canonicalIdentity(inventory.harness),
    provider: canonicalIdentity(inventory.provider),
    model: canonicalIdentity(inventory.model),
    agent: canonicalIdentity(inventory.agent),
    preset: canonicalIdentity(inventory.preset),
    capabilities: inventory.capabilities.map((capability) => ({
      identity: capability.identity,
      version: capability.version,
      digest: capability.digest,
      configurationDigest: capability.configurationDigest,
      contractDigest: capability.contractDigest,
    })),
    bootId: inventory.bootId,
    runtimeGeneration: inventory.runtimeGeneration,
    observedAt: inventory.observedAt,
    expiresAt: inventory.expiresAt,
  }
}

function canonicalMatrixBody(matrix: CompatibilityMatrix): CompatibilityMatrix {
  return {
    schemaVersion: MATRIX_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    semanticVersion: MATRIX_SEMANTIC_VERSION,
    targetContractVersion: TARGET_SCHEMA_VERSION,
    inventoryContractVersion: INVENTORY_SCHEMA_VERSION,
    issuer: canonicalIdentity(matrix.issuer),
    validFrom: matrix.validFrom,
    expiresAt: matrix.expiresAt,
    rules: matrix.rules.map((candidate) => ({
      ruleId: candidate.ruleId,
      targetDigest: candidate.targetDigest,
      inventoryDigest: candidate.inventoryDigest,
      outcome: candidate.outcome,
      reasonCode: candidate.reasonCode,
      reason: candidate.reason,
    })),
  }
}

function hashUrn(namespace: string, canonical: string): string {
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex')
  return `urn:sage:${namespace}:sha256:${digest}`
}

export function computeCompatibilityTargetDigest(target: CompatibilityTargetBody): string {
  const parsed = parseTargetBody(target)
  if (parsed === undefined) throw new TypeError('Invalid compatibility target body.')
  return hashUrn('compatibility-target', JSON.stringify(canonicalTargetBody(parsed)))
}

export function computeRuntimeInventoryDigest(inventory: RuntimeInventoryBody): string {
  const parsed = parseInventoryBody(inventory)
  if (parsed === undefined) throw new TypeError('Invalid runtime inventory body.')
  return hashUrn('runtime-inventory', JSON.stringify(canonicalInventoryBody(parsed)))
}

export function canonicalizeCompatibilityMatrix(matrix: CompatibilityMatrix): string {
  const parsed = parseMatrix(matrix)
  if (parsed === undefined) throw new TypeError('Invalid compatibility matrix.')
  return JSON.stringify(canonicalMatrixBody(parsed))
}

export function computeCompatibilityMatrixId(canonicalMatrix: string): string {
  return hashUrn('compatibility-matrix', canonicalMatrix)
}

function parseCurrentRevision(
  value: unknown,
): CompatibilityResolveInput['currentRevision'] | undefined {
  const record = exactRecord(value, ['matterId', 'revisionId', 'digest'])
  if (record === undefined) return undefined
  const matterId = exactString(record.matterId)
  const revisionId = exactString(record.revisionId)
  const digest = exactString(record.digest)
  return matterId === undefined || revisionId === undefined || digest === undefined
    ? undefined
    : { matterId, revisionId, digest }
}

function parseRequest(value: unknown): ParsedRequest | undefined {
  const record = exactRecord(value, [
    'evaluatedAt',
    'currentRevision',
    'target',
    'inventory',
    'matrix',
  ])
  if (record === undefined) return undefined
  const evaluatedAt = exactTimestamp(record.evaluatedAt)
  const currentRevision = parseCurrentRevision(record.currentRevision)
  if (evaluatedAt === undefined || currentRevision === undefined) return undefined
  return {
    evaluatedAt,
    currentRevision,
    target: record.target,
    inventory: record.inventory,
    matrix: record.matrix,
  }
}

function parseRevocations(
  value: unknown,
): readonly CompatibilityMatrixRevocation[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const revocations: CompatibilityMatrixRevocation[] = []
  const matrixIds = new Set<string>()
  for (const candidate of values) {
    const record = exactRecord(candidate, ['matrixId', 'revokedAt', 'reasonCode'])
    if (record === undefined) return undefined
    const matrixId = exactString(record.matrixId)
    const revokedAt = exactTimestamp(record.revokedAt)
    const reasonCode = exactString(record.reasonCode)
    if (
      matrixId === undefined ||
      !MATRIX_ID.test(matrixId) ||
      revokedAt === undefined ||
      reasonCode === undefined ||
      matrixIds.has(matrixId)
    ) {
      return undefined
    }
    matrixIds.add(matrixId)
    revocations.push({ matrixId, revokedAt, reasonCode })
  }
  return revocations.sort((left, right) => compareStrings(left.matrixId, right.matrixId))
}

function parseProviderResult(value: unknown): CompatibilityMatrixProviderResult | undefined {
  const unavailable = exactRecord(value, ['kind'])
  if (unavailable?.kind === 'unavailable') return { kind: 'unavailable' }

  const available = exactRecord(value, [
    'kind',
    'matrixId',
    'canonicalMatrix',
    'revocations',
  ])
  if (available?.kind !== 'available') return undefined
  const matrixId = exactString(available.matrixId)
  const canonicalMatrix = exactString(available.canonicalMatrix)
  const revocations = parseRevocations(available.revocations)
  if (matrixId === undefined || canonicalMatrix === undefined || revocations === undefined) {
    return undefined
  }
  return { kind: 'available', matrixId, canonicalMatrix, revocations }
}

function unknown(
  code: CompatibilityUnknownCode,
  matrixId?: string,
): UnknownCompatibilityResolution {
  return matrixId === undefined
    ? Object.freeze({ outcome: 'unknown' as const, code, reason: UNKNOWN_REASONS[code] })
    : Object.freeze({
        outcome: 'unknown' as const,
        code,
        matrixId,
        reason: UNKNOWN_REASONS[code],
      })
}

function resolveInternal(input: unknown): CompatibilityResolution {
  const request = parseRequest(input)
  if (request === undefined) return unknown('invalid-request')

  const target = parseTarget(request.target)
  if (
    target === undefined ||
    target.matterId !== request.currentRevision.matterId ||
    target.revisionId !== request.currentRevision.revisionId ||
    target.revisionDigest !== request.currentRevision.digest
  ) {
    return unknown('target-invalid')
  }
  const targetBody: CompatibilityTargetBody = canonicalTargetBody(target)
  if (target.targetDigest !== computeCompatibilityTargetDigest(targetBody)) {
    return unknown('target-digest-mismatch')
  }

  const inventory = parseInventory(request.inventory)
  if (inventory === undefined) return unknown('inventory-invalid')
  const inventoryBody: RuntimeInventoryBody = canonicalInventoryBody(inventory)
  if (inventory.inventoryDigest !== computeRuntimeInventoryDigest(inventoryBody)) {
    return unknown('inventory-digest-mismatch')
  }
  const evaluatedAt = Date.parse(request.evaluatedAt)
  if (
    evaluatedAt < Date.parse(inventory.observedAt) ||
    evaluatedAt >= Date.parse(inventory.expiresAt)
  ) {
    return unknown('inventory-not-active')
  }

  const providerResult = parseProviderResult(request.matrix)
  if (providerResult === undefined) return unknown('matrix-artifact-invalid')
  if (providerResult.kind === 'unavailable') {
    return unknown('matrix-provider-unavailable')
  }
  if (!MATRIX_ID.test(providerResult.matrixId)) return unknown('matrix-id-mismatch')

  let decoded: unknown
  try {
    decoded = JSON.parse(providerResult.canonicalMatrix)
  } catch {
    return unknown('matrix-artifact-invalid')
  }
  const matrix = parseMatrix(decoded)
  if (matrix === undefined) {
    return unknown('matrix-artifact-invalid')
  }
  if (canonicalizeCompatibilityMatrix(matrix) !== providerResult.canonicalMatrix) {
    return unknown('matrix-artifact-invalid')
  }
  if (computeCompatibilityMatrixId(providerResult.canonicalMatrix) !== providerResult.matrixId) {
    return unknown('matrix-id-mismatch')
  }

  if (
    evaluatedAt < Date.parse(matrix.validFrom) ||
    evaluatedAt >= Date.parse(matrix.expiresAt)
  ) {
    return unknown('matrix-not-active', providerResult.matrixId)
  }
  if (
    providerResult.revocations.some(
      (revocation) =>
        revocation.matrixId === providerResult.matrixId &&
        Date.parse(revocation.revokedAt) <= evaluatedAt,
    )
  ) {
    return unknown('matrix-revoked', providerResult.matrixId)
  }

  const ruleIds = new Set<string>()
  for (const candidate of matrix.rules) {
    if (ruleIds.has(candidate.ruleId)) {
      return unknown('matrix-rule-duplicate', providerResult.matrixId)
    }
    ruleIds.add(candidate.ruleId)
  }

  const rulesByPair = new Map<string, CompatibilityMatrixRule[]>()
  for (const candidate of matrix.rules) {
    const pair = `${candidate.targetDigest}\u0000${candidate.inventoryDigest}`
    const group = rulesByPair.get(pair)
    if (group === undefined) {
      rulesByPair.set(pair, [candidate])
    } else {
      group.push(candidate)
    }
  }
  let hasAmbiguousPair = false
  for (const group of rulesByPair.values()) {
    if (group.length < 2) continue
    if (new Set(group.map((candidate) => candidate.outcome)).size > 1) {
      return unknown('matrix-rule-conflict', providerResult.matrixId)
    }
    hasAmbiguousPair = true
  }
  if (hasAmbiguousPair) {
    return unknown('matrix-rule-ambiguous', providerResult.matrixId)
  }

  const matches = matrix.rules.filter(
    (candidate) =>
      candidate.targetDigest === target.targetDigest &&
      candidate.inventoryDigest === inventory.inventoryDigest,
  )
  if (matches.length === 0) return unknown('no-matching-rule', providerResult.matrixId)
  if (matches.length > 1) {
    const outcomes = new Set(matches.map((candidate) => candidate.outcome))
    return outcomes.size > 1
      ? unknown('matrix-rule-conflict', providerResult.matrixId)
      : unknown('matrix-rule-ambiguous', providerResult.matrixId)
  }

  const match = matches[0]
  if (match?.outcome === 'equivalent') {
    return Object.freeze({
      outcome: 'equivalent' as const,
      code: 'exact-match' as const,
      matrixId: providerResult.matrixId,
      reason: 'One exact compatibility rule authorizes this target and inventory pair.',
    })
  }
  if (match?.outcome === 'requires-new-revision') {
    return Object.freeze({
      outcome: 'requires-new-revision' as const,
      code: 'semantic-change' as const,
      matrixId: providerResult.matrixId,
      reason: 'One exact compatibility rule requires a new revision for this pair.',
    })
  }
  return unknown('no-matching-rule', providerResult.matrixId)
}

export function resolveCompatibility(input: unknown): CompatibilityResolution {
  try {
    return resolveInternal(input)
  } catch {
    return unknown('invalid-request')
  }
}

export function createCompatibilityResolver(): CompatibilityResolver {
  return Object.freeze({ resolve: resolveCompatibility })
}

// Compatibility V2 — WT-02C.1B.
// The V1 region above is frozen migration evidence and must remain unchanged.

export interface CompatibilityComponentRequirementV2 {
  readonly identity: string
  readonly version: string
  readonly artifactDigest: string
  readonly contractDigest: string
  readonly behaviorConfigurationDigest: string
}

export interface CompatibilityCapabilityRequirementV2
  extends CompatibilityComponentRequirementV2 {
  readonly registryDescriptorDigest: string
  readonly adapterMappingDigest: string
}

export interface RuntimeComponentDescriptorV2 {
  readonly identity: string
  readonly version: string
  readonly artifactDigest: string
  readonly contractDigest: string
  readonly behaviorConfigurationDigest: string
}

export interface RuntimeCapabilityDescriptorV2 extends RuntimeComponentDescriptorV2 {
  readonly registryDescriptorDigest: string
  readonly adapterMappingDigest: string
}

export interface CompatibilityTargetSemanticBodyV2 {
  readonly schemaVersion: 'sage.compatibility-target-semantic.v2'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v2'
  readonly actionPolicies: readonly ActionPolicy[]
  readonly permissionPolicyDigest: string
  readonly dataDestinationPolicyDigest: string
  readonly provider: CompatibilityComponentRequirementV2
  readonly model: CompatibilityComponentRequirementV2
  readonly agent: CompatibilityComponentRequirementV2
  readonly preset: CompatibilityComponentRequirementV2
  readonly capabilities: readonly CompatibilityCapabilityRequirementV2[]
  readonly protocolContractDigest: string
  readonly launchPolicyDigest: string
  readonly overlayPolicyDigest: string
}

export interface CompatibilityTargetSemanticV2 extends CompatibilityTargetSemanticBodyV2 {
  readonly targetSemanticDigest: string
}

export interface CompatibilityTargetEvidenceBodyV2 {
  readonly schemaVersion: 'sage.compatibility-target-evidence.v2'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v2'
  readonly targetSemanticDigest: string
  readonly matterId: string
  readonly revisionId: string
  readonly revisionDigest: string
  readonly actionScope: string
  readonly actionIntentDigest: string
  readonly organizationBoundaryDigest: string
  readonly accountBoundaryDigest: string
  readonly resourceBoundaryDigest: string
  readonly decisionDigest: string
  readonly attemptId: string
  readonly issuedAt: string
  readonly targetProviderProvenanceDigest: string
}

export interface CompatibilityTargetEvidenceV2 extends CompatibilityTargetEvidenceBodyV2 {
  readonly targetEvidenceDigest: string
}

export interface RuntimeDescriptorBodyV2 {
  readonly schemaVersion: 'sage.runtime-descriptor.v2'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v2'
  readonly host: RuntimeComponentDescriptorV2
  readonly harness: RuntimeComponentDescriptorV2
  readonly provider: RuntimeComponentDescriptorV2
  readonly model: RuntimeComponentDescriptorV2
  readonly agent: RuntimeComponentDescriptorV2
  readonly preset: RuntimeComponentDescriptorV2
  readonly capabilities: readonly RuntimeCapabilityDescriptorV2[]
  readonly protocolContractDigest: string
  readonly launchPolicyDigest: string
  readonly overlayPolicyDigest: string
}

export interface RuntimeDescriptorV2 extends RuntimeDescriptorBodyV2 {
  readonly runtimeDescriptorDigest: string
}

export interface RuntimeInventoryEvidenceBodyV2 {
  readonly schemaVersion: 'sage.runtime-inventory-evidence.v2'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v2'
  readonly runtimeDescriptorDigest: string
  readonly activeGeneration: string
  readonly receiptDigest: string
  readonly materializationInstanceDigest: string
  readonly artifactAttestationDigest: string
  readonly registrySnapshotDigest: string
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly observedAt: string
  readonly expiresAt: string
  readonly healthObservationDigest: string
  readonly livenessObservationDigest: string
  readonly instanceAuthorityDigest: string
  readonly mainObservationProvenanceDigest: string
}

export interface RuntimeInventoryEvidenceV2 extends RuntimeInventoryEvidenceBodyV2 {
  readonly inventoryEvidenceDigest: string
}

export interface CompatibilityMatrixRuleV2 {
  readonly ruleId: string
  readonly targetSemanticDigest: string
  readonly runtimeDescriptorDigest: string
  readonly outcome: 'equivalent' | 'requires-new-revision'
  readonly reasonCode: string
  readonly reason: string
}

export interface CompatibilityMatrixV2 {
  readonly schemaVersion: 'sage.compatibility-matrix.v2'
  readonly canonicalizationVersion: 'sage.compatibility-canonical-json.v2'
  readonly semanticVersion: '2.0.0'
  readonly targetContractVersion: 'sage.compatibility-target-semantic.v2'
  readonly runtimeContractVersion: 'sage.runtime-descriptor.v2'
  readonly issuer: VersionedIdentity
  readonly validFrom: string
  readonly expiresAt: string
  readonly rules: readonly CompatibilityMatrixRuleV2[]
}

export interface CompatibilityMatrixV2Revocation {
  readonly matrixId: string
  readonly revokedAt: string
  readonly reasonCode: string
  readonly provenanceDigest: string
}

export interface CompatibilityMatrixV2Available {
  readonly kind: 'available'
  readonly matrixId: string
  readonly canonicalMatrix: string
  readonly providerProvenanceDigest: string
  readonly revocations: readonly CompatibilityMatrixV2Revocation[]
}

export interface CompatibilityMatrixV2Unavailable {
  readonly kind: 'unavailable'
}

export type CompatibilityMatrixV2ProviderResult =
  | CompatibilityMatrixV2Available
  | CompatibilityMatrixV2Unavailable

export interface CompatibilityResolveInputV2 {
  readonly evaluatedAt: string
  readonly currentRevision: {
    readonly matterId: string
    readonly revisionId: string
    readonly digest: string
  }
  readonly targetSemantic: CompatibilityTargetSemanticV2
  readonly targetEvidence: CompatibilityTargetEvidenceV2
  readonly runtimeDescriptor: RuntimeDescriptorV2
  readonly inventoryEvidence: RuntimeInventoryEvidenceV2
  readonly matrix: CompatibilityMatrixV2ProviderResult
}

export interface CompatibilityResolutionBindingV2 {
  readonly evaluatedAt: string
  readonly actionScope: string
  readonly matrixId: string
  readonly matchedRuleId: string
  readonly targetSemanticDigest: string
  readonly targetEvidenceDigest: string
  readonly runtimeDescriptorDigest: string
  readonly inventoryEvidenceDigest: string
  readonly matrixProviderProvenanceDigest: string
}

export type CompatibilityUnknownCodeV2 =
  | 'invalid-request'
  | 'target-semantic-invalid'
  | 'target-semantic-digest-mismatch'
  | 'target-evidence-invalid'
  | 'target-evidence-digest-mismatch'
  | 'target-stable-binding-mismatch'
  | 'target-not-current'
  | 'target-action-not-declared'
  | 'runtime-descriptor-invalid'
  | 'runtime-descriptor-digest-mismatch'
  | 'inventory-evidence-invalid'
  | 'inventory-evidence-digest-mismatch'
  | 'runtime-stable-binding-mismatch'
  | 'inventory-not-active'
  | 'matrix-provider-unavailable'
  | 'matrix-artifact-invalid'
  | 'matrix-id-mismatch'
  | 'matrix-not-active'
  | 'matrix-revoked'
  | 'matrix-rule-duplicate'
  | 'matrix-rule-conflict'
  | 'matrix-rule-ambiguous'
  | 'no-matching-rule'

export interface EquivalentCompatibilityResolutionV2 {
  readonly outcome: 'equivalent'
  readonly code: 'exact-match'
  readonly reasonCode: string
  readonly reason: string
  readonly binding: CompatibilityResolutionBindingV2
}

export interface NewRevisionCompatibilityResolutionV2 {
  readonly outcome: 'requires-new-revision'
  readonly code: 'semantic-change'
  readonly reasonCode: string
  readonly reason: string
  readonly binding: CompatibilityResolutionBindingV2
}

export interface UnknownCompatibilityResolutionV2 {
  readonly outcome: 'unknown'
  readonly code: CompatibilityUnknownCodeV2
  readonly matrixId?: string
  readonly reason: string
}

export type CompatibilityResolutionV2 =
  | EquivalentCompatibilityResolutionV2
  | NewRevisionCompatibilityResolutionV2
  | UnknownCompatibilityResolutionV2

export interface CompatibilityResolverV2 {
  readonly resolve: (input: unknown) => CompatibilityResolutionV2
}

const TARGET_SEMANTIC_SCHEMA_VERSION_V2 = 'sage.compatibility-target-semantic.v2'
const TARGET_EVIDENCE_SCHEMA_VERSION_V2 = 'sage.compatibility-target-evidence.v2'
const RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2 = 'sage.runtime-descriptor.v2'
const INVENTORY_EVIDENCE_SCHEMA_VERSION_V2 = 'sage.runtime-inventory-evidence.v2'
const MATRIX_SCHEMA_VERSION_V2 = 'sage.compatibility-matrix.v2'
const CANONICALIZATION_VERSION_V2 = 'sage.compatibility-canonical-json.v2'
const MATRIX_SEMANTIC_VERSION_V2 = '2.0.0'
const SHA256_CONTENT_DIGEST_V2 = /^sha256:[0-9a-f]{64}$/u
const TARGET_SEMANTIC_DIGEST_V2 = /^urn:sage:target-semantic:sha256:[0-9a-f]{64}$/u
const TARGET_EVIDENCE_DIGEST_V2 = /^urn:sage:target-evidence:sha256:[0-9a-f]{64}$/u
const RUNTIME_DESCRIPTOR_DIGEST_V2 = /^urn:sage:runtime-descriptor:sha256:[0-9a-f]{64}$/u
const INVENTORY_EVIDENCE_DIGEST_V2 = /^urn:sage:inventory-evidence:sha256:[0-9a-f]{64}$/u
const MATRIX_ID_V2 = /^urn:sage:compatibility-matrix:sha256:[0-9a-f]{64}$/u
const PROFILE_GENERATION_V2 = /^[a-z0-9][a-z0-9-]{0,63}$/u
const EXACT_SEMVER_V2 =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u
const EXACT_CALENDAR_VERSION_V2 = /^(\d{4})-(\d{2})-(\d{2})$/u

const UNKNOWN_REASONS_V2: Readonly<Record<CompatibilityUnknownCodeV2, string>> = {
  'invalid-request': 'The V2 compatibility request is invalid.',
  'target-semantic-invalid': 'The V2 compatibility target semantic descriptor is invalid.',
  'target-semantic-digest-mismatch':
    'The V2 target semantic digest does not match its canonical content.',
  'target-evidence-invalid': 'The V2 compatibility target evidence is invalid.',
  'target-evidence-digest-mismatch':
    'The V2 target evidence digest does not match its canonical content.',
  'target-stable-binding-mismatch':
    'The V2 target evidence does not bind the validated target semantic descriptor.',
  'target-not-current': 'The V2 target evidence is not bound to the current revision.',
  'target-action-not-declared':
    'The V2 target evidence action is not declared by the target semantic descriptor.',
  'runtime-descriptor-invalid': 'The V2 runtime descriptor is invalid.',
  'runtime-descriptor-digest-mismatch':
    'The V2 runtime descriptor digest does not match its canonical content.',
  'inventory-evidence-invalid': 'The V2 runtime inventory evidence is invalid.',
  'inventory-evidence-digest-mismatch':
    'The V2 inventory evidence digest does not match its canonical content.',
  'runtime-stable-binding-mismatch':
    'The V2 inventory evidence does not bind the validated runtime descriptor.',
  'inventory-not-active': 'The V2 inventory evidence is not active at the evaluation instant.',
  'matrix-provider-unavailable': 'The V2 compatibility matrix provider is unavailable.',
  'matrix-artifact-invalid': 'The V2 compatibility matrix artifact is invalid.',
  'matrix-id-mismatch':
    'The V2 compatibility matrix identifier does not match its canonical content.',
  'matrix-not-active': 'The V2 compatibility matrix is not active at the evaluation instant.',
  'matrix-revoked': 'The V2 compatibility matrix was revoked before the evaluation instant.',
  'matrix-rule-duplicate': 'The V2 compatibility matrix contains a duplicate rule identifier.',
  'matrix-rule-conflict':
    'The V2 compatibility matrix contains conflicting rules for one stable pair.',
  'matrix-rule-ambiguous':
    'The V2 compatibility matrix contains more than one rule for one stable pair.',
  'no-matching-rule':
    'The V2 compatibility matrix has no exact rule for this stable target and runtime pair.',
}

interface ParsedRequestV2 {
  readonly evaluatedAt: string
  readonly currentRevision: CompatibilityResolveInputV2['currentRevision']
  readonly targetSemantic: unknown
  readonly targetEvidence: unknown
  readonly runtimeDescriptor: unknown
  readonly inventoryEvidence: unknown
  readonly matrix: unknown
}

function parseContentDigestV2(value: unknown): string | undefined {
  const digest = exactString(value)
  return digest !== undefined && SHA256_CONTENT_DIGEST_V2.test(digest) ? digest : undefined
}

function parseImmutableVersionV2(value: unknown): string | undefined {
  const version = exactString(value)
  if (version === undefined) return undefined
  if (EXACT_SEMVER_V2.test(version)) return version

  const dateParts = EXACT_CALENDAR_VERSION_V2.exec(version)
  if (dateParts === null) return undefined
  const year = Number(dateParts[1])
  const month = Number(dateParts[2])
  const day = Number(dateParts[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? version
    : undefined
}

function parseComponentRequirementV2(
  value: unknown,
): CompatibilityComponentRequirementV2 | undefined {
  const record = exactRecord(value, [
    'identity',
    'version',
    'artifactDigest',
    'contractDigest',
    'behaviorConfigurationDigest',
  ])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = parseImmutableVersionV2(record.version)
  const artifactDigest = parseContentDigestV2(record.artifactDigest)
  const contractDigest = parseContentDigestV2(record.contractDigest)
  const behaviorConfigurationDigest = parseContentDigestV2(
    record.behaviorConfigurationDigest,
  )
  if (
    identity === undefined ||
    version === undefined ||
    artifactDigest === undefined ||
    contractDigest === undefined ||
    behaviorConfigurationDigest === undefined
  ) {
    return undefined
  }
  return {
    identity,
    version,
    artifactDigest,
    contractDigest,
    behaviorConfigurationDigest,
  }
}

function parseCapabilityRequirementV2(
  value: unknown,
): CompatibilityCapabilityRequirementV2 | undefined {
  const record = exactRecord(value, [
    'identity',
    'version',
    'artifactDigest',
    'contractDigest',
    'behaviorConfigurationDigest',
    'registryDescriptorDigest',
    'adapterMappingDigest',
  ])
  if (record === undefined) return undefined
  const component = parseComponentRequirementV2({
    identity: record.identity,
    version: record.version,
    artifactDigest: record.artifactDigest,
    contractDigest: record.contractDigest,
    behaviorConfigurationDigest: record.behaviorConfigurationDigest,
  })
  const registryDescriptorDigest = parseContentDigestV2(record.registryDescriptorDigest)
  const adapterMappingDigest = parseContentDigestV2(record.adapterMappingDigest)
  if (
    component === undefined ||
    registryDescriptorDigest === undefined ||
    adapterMappingDigest === undefined
  ) {
    return undefined
  }
  return { ...component, registryDescriptorDigest, adapterMappingDigest }
}

function parseRuntimeComponentDescriptorV2(
  value: unknown,
): RuntimeComponentDescriptorV2 | undefined {
  return parseComponentRequirementV2(value)
}

function parseRuntimeCapabilityDescriptorV2(
  value: unknown,
): RuntimeCapabilityDescriptorV2 | undefined {
  return parseCapabilityRequirementV2(value)
}

function parseCapabilityRequirementsV2(
  value: unknown,
): readonly CompatibilityCapabilityRequirementV2[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const capabilities: CompatibilityCapabilityRequirementV2[] = []
  const identities = new Set<string>()
  for (const candidate of values) {
    const capability = parseCapabilityRequirementV2(candidate)
    if (capability === undefined || identities.has(capability.identity)) return undefined
    identities.add(capability.identity)
    capabilities.push(capability)
  }
  return capabilities.sort((left, right) => compareStrings(left.identity, right.identity))
}

function parseRuntimeCapabilitiesV2(
  value: unknown,
): readonly RuntimeCapabilityDescriptorV2[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const capabilities: RuntimeCapabilityDescriptorV2[] = []
  const identities = new Set<string>()
  for (const candidate of values) {
    const capability = parseRuntimeCapabilityDescriptorV2(candidate)
    if (capability === undefined || identities.has(capability.identity)) return undefined
    identities.add(capability.identity)
    capabilities.push(capability)
  }
  return capabilities.sort((left, right) => compareStrings(left.identity, right.identity))
}

function parseTargetSemanticBodyV2(
  value: unknown,
): CompatibilityTargetSemanticBodyV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'actionPolicies',
    'permissionPolicyDigest',
    'dataDestinationPolicyDigest',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'protocolContractDigest',
    'launchPolicyDigest',
    'overlayPolicyDigest',
  ])
  if (record === undefined) return undefined
  const actionPolicies = parseActionPolicies(record.actionPolicies)
  const permissionPolicyDigest = parseContentDigestV2(record.permissionPolicyDigest)
  const dataDestinationPolicyDigest = parseContentDigestV2(record.dataDestinationPolicyDigest)
  const provider = parseComponentRequirementV2(record.provider)
  const model = parseComponentRequirementV2(record.model)
  const agent = parseComponentRequirementV2(record.agent)
  const preset = parseComponentRequirementV2(record.preset)
  const capabilities = parseCapabilityRequirementsV2(record.capabilities)
  const protocolContractDigest = parseContentDigestV2(record.protocolContractDigest)
  const launchPolicyDigest = parseContentDigestV2(record.launchPolicyDigest)
  const overlayPolicyDigest = parseContentDigestV2(record.overlayPolicyDigest)
  if (
    record.schemaVersion !== TARGET_SEMANTIC_SCHEMA_VERSION_V2 ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION_V2 ||
    actionPolicies === undefined ||
    permissionPolicyDigest === undefined ||
    dataDestinationPolicyDigest === undefined ||
    provider === undefined ||
    model === undefined ||
    agent === undefined ||
    preset === undefined ||
    capabilities === undefined ||
    protocolContractDigest === undefined ||
    launchPolicyDigest === undefined ||
    overlayPolicyDigest === undefined
  ) {
    return undefined
  }
  return {
    schemaVersion: TARGET_SEMANTIC_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    actionPolicies,
    permissionPolicyDigest,
    dataDestinationPolicyDigest,
    provider,
    model,
    agent,
    preset,
    capabilities,
    protocolContractDigest,
    launchPolicyDigest,
    overlayPolicyDigest,
  }
}

function parseTargetSemanticV2(value: unknown): CompatibilityTargetSemanticV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'actionPolicies',
    'permissionPolicyDigest',
    'dataDestinationPolicyDigest',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'protocolContractDigest',
    'launchPolicyDigest',
    'overlayPolicyDigest',
    'targetSemanticDigest',
  ])
  if (record === undefined) return undefined
  const targetSemanticDigest = exactString(record.targetSemanticDigest)
  if (
    targetSemanticDigest === undefined ||
    !TARGET_SEMANTIC_DIGEST_V2.test(targetSemanticDigest)
  ) {
    return undefined
  }
  const body = parseTargetSemanticBodyV2({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    actionPolicies: record.actionPolicies,
    permissionPolicyDigest: record.permissionPolicyDigest,
    dataDestinationPolicyDigest: record.dataDestinationPolicyDigest,
    provider: record.provider,
    model: record.model,
    agent: record.agent,
    preset: record.preset,
    capabilities: record.capabilities,
    protocolContractDigest: record.protocolContractDigest,
    launchPolicyDigest: record.launchPolicyDigest,
    overlayPolicyDigest: record.overlayPolicyDigest,
  })
  return body === undefined ? undefined : { ...body, targetSemanticDigest }
}

function parseTargetEvidenceBodyV2(
  value: unknown,
): CompatibilityTargetEvidenceBodyV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'targetSemanticDigest',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionScope',
    'actionIntentDigest',
    'organizationBoundaryDigest',
    'accountBoundaryDigest',
    'resourceBoundaryDigest',
    'decisionDigest',
    'attemptId',
    'issuedAt',
    'targetProviderProvenanceDigest',
  ])
  if (record === undefined) return undefined
  const targetSemanticDigest = exactString(record.targetSemanticDigest)
  const matterId = exactString(record.matterId)
  const revisionId = exactString(record.revisionId)
  const revisionDigest = parseContentDigestV2(record.revisionDigest)
  const actionScope = exactString(record.actionScope)
  const actionIntentDigest = parseContentDigestV2(record.actionIntentDigest)
  const organizationBoundaryDigest = parseContentDigestV2(record.organizationBoundaryDigest)
  const accountBoundaryDigest = parseContentDigestV2(record.accountBoundaryDigest)
  const resourceBoundaryDigest = parseContentDigestV2(record.resourceBoundaryDigest)
  const decisionDigest = parseContentDigestV2(record.decisionDigest)
  const attemptId = exactString(record.attemptId)
  const issuedAt = exactTimestamp(record.issuedAt)
  const targetProviderProvenanceDigest = parseContentDigestV2(
    record.targetProviderProvenanceDigest,
  )
  if (
    record.schemaVersion !== TARGET_EVIDENCE_SCHEMA_VERSION_V2 ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION_V2 ||
    targetSemanticDigest === undefined ||
    !TARGET_SEMANTIC_DIGEST_V2.test(targetSemanticDigest) ||
    matterId === undefined ||
    revisionId === undefined ||
    revisionDigest === undefined ||
    actionScope === undefined ||
    actionIntentDigest === undefined ||
    organizationBoundaryDigest === undefined ||
    accountBoundaryDigest === undefined ||
    resourceBoundaryDigest === undefined ||
    decisionDigest === undefined ||
    attemptId === undefined ||
    issuedAt === undefined ||
    targetProviderProvenanceDigest === undefined
  ) {
    return undefined
  }
  return {
    schemaVersion: TARGET_EVIDENCE_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    targetSemanticDigest,
    matterId,
    revisionId,
    revisionDigest,
    actionScope,
    actionIntentDigest,
    organizationBoundaryDigest,
    accountBoundaryDigest,
    resourceBoundaryDigest,
    decisionDigest,
    attemptId,
    issuedAt,
    targetProviderProvenanceDigest,
  }
}

function parseTargetEvidenceV2(value: unknown): CompatibilityTargetEvidenceV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'targetSemanticDigest',
    'matterId',
    'revisionId',
    'revisionDigest',
    'actionScope',
    'actionIntentDigest',
    'organizationBoundaryDigest',
    'accountBoundaryDigest',
    'resourceBoundaryDigest',
    'decisionDigest',
    'attemptId',
    'issuedAt',
    'targetProviderProvenanceDigest',
    'targetEvidenceDigest',
  ])
  if (record === undefined) return undefined
  const targetEvidenceDigest = exactString(record.targetEvidenceDigest)
  if (targetEvidenceDigest === undefined || !TARGET_EVIDENCE_DIGEST_V2.test(targetEvidenceDigest)) {
    return undefined
  }
  const body = parseTargetEvidenceBodyV2({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    targetSemanticDigest: record.targetSemanticDigest,
    matterId: record.matterId,
    revisionId: record.revisionId,
    revisionDigest: record.revisionDigest,
    actionScope: record.actionScope,
    actionIntentDigest: record.actionIntentDigest,
    organizationBoundaryDigest: record.organizationBoundaryDigest,
    accountBoundaryDigest: record.accountBoundaryDigest,
    resourceBoundaryDigest: record.resourceBoundaryDigest,
    decisionDigest: record.decisionDigest,
    attemptId: record.attemptId,
    issuedAt: record.issuedAt,
    targetProviderProvenanceDigest: record.targetProviderProvenanceDigest,
  })
  return body === undefined ? undefined : { ...body, targetEvidenceDigest }
}

function parseRuntimeDescriptorBodyV2(value: unknown): RuntimeDescriptorBodyV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'host',
    'harness',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'protocolContractDigest',
    'launchPolicyDigest',
    'overlayPolicyDigest',
  ])
  if (record === undefined) return undefined
  const host = parseRuntimeComponentDescriptorV2(record.host)
  const harness = parseRuntimeComponentDescriptorV2(record.harness)
  const provider = parseRuntimeComponentDescriptorV2(record.provider)
  const model = parseRuntimeComponentDescriptorV2(record.model)
  const agent = parseRuntimeComponentDescriptorV2(record.agent)
  const preset = parseRuntimeComponentDescriptorV2(record.preset)
  const capabilities = parseRuntimeCapabilitiesV2(record.capabilities)
  const protocolContractDigest = parseContentDigestV2(record.protocolContractDigest)
  const launchPolicyDigest = parseContentDigestV2(record.launchPolicyDigest)
  const overlayPolicyDigest = parseContentDigestV2(record.overlayPolicyDigest)
  if (
    record.schemaVersion !== RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2 ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION_V2 ||
    host === undefined ||
    harness === undefined ||
    provider === undefined ||
    model === undefined ||
    agent === undefined ||
    preset === undefined ||
    capabilities === undefined ||
    protocolContractDigest === undefined ||
    launchPolicyDigest === undefined ||
    overlayPolicyDigest === undefined
  ) {
    return undefined
  }
  return {
    schemaVersion: RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    host,
    harness,
    provider,
    model,
    agent,
    preset,
    capabilities,
    protocolContractDigest,
    launchPolicyDigest,
    overlayPolicyDigest,
  }
}

function parseRuntimeDescriptorV2(value: unknown): RuntimeDescriptorV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'host',
    'harness',
    'provider',
    'model',
    'agent',
    'preset',
    'capabilities',
    'protocolContractDigest',
    'launchPolicyDigest',
    'overlayPolicyDigest',
    'runtimeDescriptorDigest',
  ])
  if (record === undefined) return undefined
  const runtimeDescriptorDigest = exactString(record.runtimeDescriptorDigest)
  if (
    runtimeDescriptorDigest === undefined ||
    !RUNTIME_DESCRIPTOR_DIGEST_V2.test(runtimeDescriptorDigest)
  ) {
    return undefined
  }
  const body = parseRuntimeDescriptorBodyV2({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    host: record.host,
    harness: record.harness,
    provider: record.provider,
    model: record.model,
    agent: record.agent,
    preset: record.preset,
    capabilities: record.capabilities,
    protocolContractDigest: record.protocolContractDigest,
    launchPolicyDigest: record.launchPolicyDigest,
    overlayPolicyDigest: record.overlayPolicyDigest,
  })
  return body === undefined ? undefined : { ...body, runtimeDescriptorDigest }
}

function parseInventoryEvidenceBodyV2(
  value: unknown,
): RuntimeInventoryEvidenceBodyV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'runtimeDescriptorDigest',
    'activeGeneration',
    'receiptDigest',
    'materializationInstanceDigest',
    'artifactAttestationDigest',
    'registrySnapshotDigest',
    'bootId',
    'runtimeGeneration',
    'observedAt',
    'expiresAt',
    'healthObservationDigest',
    'livenessObservationDigest',
    'instanceAuthorityDigest',
    'mainObservationProvenanceDigest',
  ])
  if (record === undefined) return undefined
  const runtimeDescriptorDigest = exactString(record.runtimeDescriptorDigest)
  const activeGeneration = exactString(record.activeGeneration)
  const receiptDigest = parseContentDigestV2(record.receiptDigest)
  const materializationInstanceDigest = parseContentDigestV2(
    record.materializationInstanceDigest,
  )
  const artifactAttestationDigest = parseContentDigestV2(record.artifactAttestationDigest)
  const registrySnapshotDigest = parseContentDigestV2(record.registrySnapshotDigest)
  const bootId = exactString(record.bootId)
  const runtimeGeneration = exactNonNegativeInteger(record.runtimeGeneration)
  const observedAt = exactTimestamp(record.observedAt)
  const expiresAt = exactTimestamp(record.expiresAt)
  const healthObservationDigest = parseContentDigestV2(record.healthObservationDigest)
  const livenessObservationDigest = parseContentDigestV2(record.livenessObservationDigest)
  const instanceAuthorityDigest = parseContentDigestV2(record.instanceAuthorityDigest)
  const mainObservationProvenanceDigest = parseContentDigestV2(
    record.mainObservationProvenanceDigest,
  )
  if (
    record.schemaVersion !== INVENTORY_EVIDENCE_SCHEMA_VERSION_V2 ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION_V2 ||
    runtimeDescriptorDigest === undefined ||
    !RUNTIME_DESCRIPTOR_DIGEST_V2.test(runtimeDescriptorDigest) ||
    activeGeneration === undefined ||
    !PROFILE_GENERATION_V2.test(activeGeneration) ||
    receiptDigest === undefined ||
    materializationInstanceDigest === undefined ||
    artifactAttestationDigest === undefined ||
    registrySnapshotDigest === undefined ||
    bootId === undefined ||
    runtimeGeneration === undefined ||
    runtimeGeneration === 0 ||
    observedAt === undefined ||
    expiresAt === undefined ||
    Date.parse(observedAt) >= Date.parse(expiresAt) ||
    healthObservationDigest === undefined ||
    livenessObservationDigest === undefined ||
    instanceAuthorityDigest === undefined ||
    mainObservationProvenanceDigest === undefined
  ) {
    return undefined
  }
  return {
    schemaVersion: INVENTORY_EVIDENCE_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    runtimeDescriptorDigest,
    activeGeneration,
    receiptDigest,
    materializationInstanceDigest,
    artifactAttestationDigest,
    registrySnapshotDigest,
    bootId,
    runtimeGeneration,
    observedAt,
    expiresAt,
    healthObservationDigest,
    livenessObservationDigest,
    instanceAuthorityDigest,
    mainObservationProvenanceDigest,
  }
}

function parseInventoryEvidenceV2(value: unknown): RuntimeInventoryEvidenceV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'runtimeDescriptorDigest',
    'activeGeneration',
    'receiptDigest',
    'materializationInstanceDigest',
    'artifactAttestationDigest',
    'registrySnapshotDigest',
    'bootId',
    'runtimeGeneration',
    'observedAt',
    'expiresAt',
    'healthObservationDigest',
    'livenessObservationDigest',
    'instanceAuthorityDigest',
    'mainObservationProvenanceDigest',
    'inventoryEvidenceDigest',
  ])
  if (record === undefined) return undefined
  const inventoryEvidenceDigest = exactString(record.inventoryEvidenceDigest)
  if (
    inventoryEvidenceDigest === undefined ||
    !INVENTORY_EVIDENCE_DIGEST_V2.test(inventoryEvidenceDigest)
  ) {
    return undefined
  }
  const body = parseInventoryEvidenceBodyV2({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    runtimeDescriptorDigest: record.runtimeDescriptorDigest,
    activeGeneration: record.activeGeneration,
    receiptDigest: record.receiptDigest,
    materializationInstanceDigest: record.materializationInstanceDigest,
    artifactAttestationDigest: record.artifactAttestationDigest,
    registrySnapshotDigest: record.registrySnapshotDigest,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    observedAt: record.observedAt,
    expiresAt: record.expiresAt,
    healthObservationDigest: record.healthObservationDigest,
    livenessObservationDigest: record.livenessObservationDigest,
    instanceAuthorityDigest: record.instanceAuthorityDigest,
    mainObservationProvenanceDigest: record.mainObservationProvenanceDigest,
  })
  return body === undefined ? undefined : { ...body, inventoryEvidenceDigest }
}

function parseMatrixIssuerV2(value: unknown): VersionedIdentity | undefined {
  const record = exactRecord(value, ['identity', 'version', 'digest'])
  if (record === undefined) return undefined
  const identity = exactString(record.identity)
  const version = parseImmutableVersionV2(record.version)
  const digest = parseContentDigestV2(record.digest)
  if (
    identity !== MATRIX_AUTHORITY_IDENTITY ||
    version === undefined ||
    digest === undefined
  ) {
    return undefined
  }
  return { identity, version, digest }
}

function parseMatrixRuleV2(value: unknown): CompatibilityMatrixRuleV2 | undefined {
  const record = exactRecord(value, [
    'ruleId',
    'targetSemanticDigest',
    'runtimeDescriptorDigest',
    'outcome',
    'reasonCode',
    'reason',
  ])
  if (record === undefined) return undefined
  const ruleId = exactString(record.ruleId)
  const targetSemanticDigest = exactString(record.targetSemanticDigest)
  const runtimeDescriptorDigest = exactString(record.runtimeDescriptorDigest)
  const reasonCode = exactString(record.reasonCode)
  const reason = exactString(record.reason)
  if (
    ruleId === undefined ||
    targetSemanticDigest === undefined ||
    !TARGET_SEMANTIC_DIGEST_V2.test(targetSemanticDigest) ||
    runtimeDescriptorDigest === undefined ||
    !RUNTIME_DESCRIPTOR_DIGEST_V2.test(runtimeDescriptorDigest) ||
    (record.outcome !== 'equivalent' && record.outcome !== 'requires-new-revision') ||
    reasonCode === undefined ||
    reason === undefined
  ) {
    return undefined
  }
  return {
    ruleId,
    targetSemanticDigest,
    runtimeDescriptorDigest,
    outcome: record.outcome,
    reasonCode,
    reason,
  }
}

function compareMatrixRulesV2(
  left: CompatibilityMatrixRuleV2,
  right: CompatibilityMatrixRuleV2,
): number {
  for (const key of [
    'ruleId',
    'targetSemanticDigest',
    'runtimeDescriptorDigest',
    'outcome',
    'reasonCode',
    'reason',
  ] as const) {
    const compared = compareStrings(left[key], right[key])
    if (compared !== 0) return compared
  }
  return 0
}

function parseMatrixV2(value: unknown): CompatibilityMatrixV2 | undefined {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'semanticVersion',
    'targetContractVersion',
    'runtimeContractVersion',
    'issuer',
    'validFrom',
    'expiresAt',
    'rules',
  ])
  if (record === undefined) return undefined
  const issuer = parseMatrixIssuerV2(record.issuer)
  const validFrom = exactTimestamp(record.validFrom)
  const expiresAt = exactTimestamp(record.expiresAt)
  const rawRules = exactArray(record.rules)
  if (
    record.schemaVersion !== MATRIX_SCHEMA_VERSION_V2 ||
    record.canonicalizationVersion !== CANONICALIZATION_VERSION_V2 ||
    record.semanticVersion !== MATRIX_SEMANTIC_VERSION_V2 ||
    record.targetContractVersion !== TARGET_SEMANTIC_SCHEMA_VERSION_V2 ||
    record.runtimeContractVersion !== RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2 ||
    issuer === undefined ||
    validFrom === undefined ||
    expiresAt === undefined ||
    Date.parse(validFrom) >= Date.parse(expiresAt) ||
    rawRules === undefined
  ) {
    return undefined
  }
  const rules: CompatibilityMatrixRuleV2[] = []
  for (const candidate of rawRules) {
    const rule = parseMatrixRuleV2(candidate)
    if (rule === undefined) return undefined
    rules.push(rule)
  }
  rules.sort(compareMatrixRulesV2)
  return {
    schemaVersion: MATRIX_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    semanticVersion: MATRIX_SEMANTIC_VERSION_V2,
    targetContractVersion: TARGET_SEMANTIC_SCHEMA_VERSION_V2,
    runtimeContractVersion: RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2,
    issuer,
    validFrom,
    expiresAt,
    rules,
  }
}

function parseMatrixRevocationsV2(
  value: unknown,
): readonly CompatibilityMatrixV2Revocation[] | undefined {
  const values = exactArray(value)
  if (values === undefined) return undefined
  const revocations: CompatibilityMatrixV2Revocation[] = []
  const matrixIds = new Set<string>()
  for (const candidate of values) {
    const record = exactRecord(candidate, [
      'matrixId',
      'revokedAt',
      'reasonCode',
      'provenanceDigest',
    ])
    if (record === undefined) return undefined
    const matrixId = exactString(record.matrixId)
    const revokedAt = exactTimestamp(record.revokedAt)
    const reasonCode = exactString(record.reasonCode)
    const provenanceDigest = parseContentDigestV2(record.provenanceDigest)
    if (
      matrixId === undefined ||
      !MATRIX_ID_V2.test(matrixId) ||
      revokedAt === undefined ||
      reasonCode === undefined ||
      provenanceDigest === undefined ||
      matrixIds.has(matrixId)
    ) {
      return undefined
    }
    matrixIds.add(matrixId)
    revocations.push({ matrixId, revokedAt, reasonCode, provenanceDigest })
  }
  return revocations.sort((left, right) => compareStrings(left.matrixId, right.matrixId))
}

function parseMatrixProviderResultV2(
  value: unknown,
): CompatibilityMatrixV2ProviderResult | undefined {
  const unavailable = exactRecord(value, ['kind'])
  if (unavailable?.kind === 'unavailable') return { kind: 'unavailable' }

  const available = exactRecord(value, [
    'kind',
    'matrixId',
    'canonicalMatrix',
    'providerProvenanceDigest',
    'revocations',
  ])
  if (available?.kind !== 'available') return undefined
  const matrixId = exactString(available.matrixId)
  const canonicalMatrix = exactString(available.canonicalMatrix)
  const providerProvenanceDigest = parseContentDigestV2(
    available.providerProvenanceDigest,
  )
  const revocations = parseMatrixRevocationsV2(available.revocations)
  if (
    matrixId === undefined ||
    !MATRIX_ID_V2.test(matrixId) ||
    canonicalMatrix === undefined ||
    providerProvenanceDigest === undefined ||
    revocations === undefined
  ) {
    return undefined
  }
  return {
    kind: 'available',
    matrixId,
    canonicalMatrix,
    providerProvenanceDigest,
    revocations,
  }
}

function parseCurrentRevisionV2(
  value: unknown,
): CompatibilityResolveInputV2['currentRevision'] | undefined {
  const record = exactRecord(value, ['matterId', 'revisionId', 'digest'])
  if (record === undefined) return undefined
  const matterId = exactString(record.matterId)
  const revisionId = exactString(record.revisionId)
  const digest = parseContentDigestV2(record.digest)
  return matterId === undefined || revisionId === undefined || digest === undefined
    ? undefined
    : { matterId, revisionId, digest }
}

function parseRequestV2(value: unknown): ParsedRequestV2 | undefined {
  const record = exactRecord(value, [
    'evaluatedAt',
    'currentRevision',
    'targetSemantic',
    'targetEvidence',
    'runtimeDescriptor',
    'inventoryEvidence',
    'matrix',
  ])
  if (record === undefined) return undefined
  const evaluatedAt = exactTimestamp(record.evaluatedAt)
  const currentRevision = parseCurrentRevisionV2(record.currentRevision)
  if (evaluatedAt === undefined || currentRevision === undefined) return undefined
  return {
    evaluatedAt,
    currentRevision,
    targetSemantic: record.targetSemantic,
    targetEvidence: record.targetEvidence,
    runtimeDescriptor: record.runtimeDescriptor,
    inventoryEvidence: record.inventoryEvidence,
    matrix: record.matrix,
  }
}

function canonicalComponentRequirementV2(
  component: CompatibilityComponentRequirementV2,
): CompatibilityComponentRequirementV2 {
  return {
    identity: component.identity,
    version: component.version,
    artifactDigest: component.artifactDigest,
    contractDigest: component.contractDigest,
    behaviorConfigurationDigest: component.behaviorConfigurationDigest,
  }
}

function canonicalCapabilityRequirementV2(
  capability: CompatibilityCapabilityRequirementV2,
): CompatibilityCapabilityRequirementV2 {
  return {
    ...canonicalComponentRequirementV2(capability),
    registryDescriptorDigest: capability.registryDescriptorDigest,
    adapterMappingDigest: capability.adapterMappingDigest,
  }
}

function canonicalRuntimeComponentDescriptorV2(
  component: RuntimeComponentDescriptorV2,
): RuntimeComponentDescriptorV2 {
  return {
    identity: component.identity,
    version: component.version,
    artifactDigest: component.artifactDigest,
    contractDigest: component.contractDigest,
    behaviorConfigurationDigest: component.behaviorConfigurationDigest,
  }
}

function canonicalRuntimeCapabilityDescriptorV2(
  capability: RuntimeCapabilityDescriptorV2,
): RuntimeCapabilityDescriptorV2 {
  return {
    ...canonicalRuntimeComponentDescriptorV2(capability),
    registryDescriptorDigest: capability.registryDescriptorDigest,
    adapterMappingDigest: capability.adapterMappingDigest,
  }
}

function canonicalTargetSemanticBodyV2(
  target: CompatibilityTargetSemanticBodyV2,
): CompatibilityTargetSemanticBodyV2 {
  return {
    schemaVersion: TARGET_SEMANTIC_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    actionPolicies: target.actionPolicies.map((policy) => ({
      actionScope: policy.actionScope,
      effectClass: policy.effectClass,
      requiresDecision: policy.requiresDecision,
    })),
    permissionPolicyDigest: target.permissionPolicyDigest,
    dataDestinationPolicyDigest: target.dataDestinationPolicyDigest,
    provider: canonicalComponentRequirementV2(target.provider),
    model: canonicalComponentRequirementV2(target.model),
    agent: canonicalComponentRequirementV2(target.agent),
    preset: canonicalComponentRequirementV2(target.preset),
    capabilities: target.capabilities.map(canonicalCapabilityRequirementV2),
    protocolContractDigest: target.protocolContractDigest,
    launchPolicyDigest: target.launchPolicyDigest,
    overlayPolicyDigest: target.overlayPolicyDigest,
  }
}

function canonicalTargetEvidenceBodyV2(
  evidence: CompatibilityTargetEvidenceBodyV2,
): CompatibilityTargetEvidenceBodyV2 {
  return {
    schemaVersion: TARGET_EVIDENCE_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    targetSemanticDigest: evidence.targetSemanticDigest,
    matterId: evidence.matterId,
    revisionId: evidence.revisionId,
    revisionDigest: evidence.revisionDigest,
    actionScope: evidence.actionScope,
    actionIntentDigest: evidence.actionIntentDigest,
    organizationBoundaryDigest: evidence.organizationBoundaryDigest,
    accountBoundaryDigest: evidence.accountBoundaryDigest,
    resourceBoundaryDigest: evidence.resourceBoundaryDigest,
    decisionDigest: evidence.decisionDigest,
    attemptId: evidence.attemptId,
    issuedAt: evidence.issuedAt,
    targetProviderProvenanceDigest: evidence.targetProviderProvenanceDigest,
  }
}

function canonicalRuntimeDescriptorBodyV2(
  descriptor: RuntimeDescriptorBodyV2,
): RuntimeDescriptorBodyV2 {
  return {
    schemaVersion: RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    host: canonicalRuntimeComponentDescriptorV2(descriptor.host),
    harness: canonicalRuntimeComponentDescriptorV2(descriptor.harness),
    provider: canonicalRuntimeComponentDescriptorV2(descriptor.provider),
    model: canonicalRuntimeComponentDescriptorV2(descriptor.model),
    agent: canonicalRuntimeComponentDescriptorV2(descriptor.agent),
    preset: canonicalRuntimeComponentDescriptorV2(descriptor.preset),
    capabilities: descriptor.capabilities.map(canonicalRuntimeCapabilityDescriptorV2),
    protocolContractDigest: descriptor.protocolContractDigest,
    launchPolicyDigest: descriptor.launchPolicyDigest,
    overlayPolicyDigest: descriptor.overlayPolicyDigest,
  }
}

function canonicalInventoryEvidenceBodyV2(
  evidence: RuntimeInventoryEvidenceBodyV2,
): RuntimeInventoryEvidenceBodyV2 {
  return {
    schemaVersion: INVENTORY_EVIDENCE_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    runtimeDescriptorDigest: evidence.runtimeDescriptorDigest,
    activeGeneration: evidence.activeGeneration,
    receiptDigest: evidence.receiptDigest,
    materializationInstanceDigest: evidence.materializationInstanceDigest,
    artifactAttestationDigest: evidence.artifactAttestationDigest,
    registrySnapshotDigest: evidence.registrySnapshotDigest,
    bootId: evidence.bootId,
    runtimeGeneration: evidence.runtimeGeneration,
    observedAt: evidence.observedAt,
    expiresAt: evidence.expiresAt,
    healthObservationDigest: evidence.healthObservationDigest,
    livenessObservationDigest: evidence.livenessObservationDigest,
    instanceAuthorityDigest: evidence.instanceAuthorityDigest,
    mainObservationProvenanceDigest: evidence.mainObservationProvenanceDigest,
  }
}

function canonicalMatrixBodyV2(matrix: CompatibilityMatrixV2): CompatibilityMatrixV2 {
  return {
    schemaVersion: MATRIX_SCHEMA_VERSION_V2,
    canonicalizationVersion: CANONICALIZATION_VERSION_V2,
    semanticVersion: MATRIX_SEMANTIC_VERSION_V2,
    targetContractVersion: TARGET_SEMANTIC_SCHEMA_VERSION_V2,
    runtimeContractVersion: RUNTIME_DESCRIPTOR_SCHEMA_VERSION_V2,
    issuer: {
      identity: matrix.issuer.identity,
      version: matrix.issuer.version,
      digest: matrix.issuer.digest,
    },
    validFrom: matrix.validFrom,
    expiresAt: matrix.expiresAt,
    rules: matrix.rules.map((rule) => ({
      ruleId: rule.ruleId,
      targetSemanticDigest: rule.targetSemanticDigest,
      runtimeDescriptorDigest: rule.runtimeDescriptorDigest,
      outcome: rule.outcome,
      reasonCode: rule.reasonCode,
      reason: rule.reason,
    })),
  }
}

export function computeTargetSemanticDigestV2(
  target: CompatibilityTargetSemanticBodyV2,
): string {
  const parsed = parseTargetSemanticBodyV2(target)
  if (parsed === undefined) {
    throw new TypeError('Invalid V2 compatibility target semantic body.')
  }
  return hashUrn(
    'target-semantic',
    JSON.stringify(canonicalTargetSemanticBodyV2(parsed)),
  )
}

export function computeTargetEvidenceDigestV2(
  evidence: CompatibilityTargetEvidenceBodyV2,
): string {
  const parsed = parseTargetEvidenceBodyV2(evidence)
  if (parsed === undefined) throw new TypeError('Invalid V2 compatibility target evidence body.')
  return hashUrn(
    'target-evidence',
    JSON.stringify(canonicalTargetEvidenceBodyV2(parsed)),
  )
}

export function computeRuntimeDescriptorDigestV2(descriptor: RuntimeDescriptorBodyV2): string {
  const parsed = parseRuntimeDescriptorBodyV2(descriptor)
  if (parsed === undefined) throw new TypeError('Invalid V2 runtime descriptor body.')
  return hashUrn(
    'runtime-descriptor',
    JSON.stringify(canonicalRuntimeDescriptorBodyV2(parsed)),
  )
}

export function computeInventoryEvidenceDigestV2(
  evidence: RuntimeInventoryEvidenceBodyV2,
): string {
  const parsed = parseInventoryEvidenceBodyV2(evidence)
  if (parsed === undefined) throw new TypeError('Invalid V2 runtime inventory evidence body.')
  return hashUrn(
    'inventory-evidence',
    JSON.stringify(canonicalInventoryEvidenceBodyV2(parsed)),
  )
}

export function canonicalizeCompatibilityMatrixV2(matrix: CompatibilityMatrixV2): string {
  const parsed = parseMatrixV2(matrix)
  if (parsed === undefined) throw new TypeError('Invalid V2 compatibility matrix.')
  return JSON.stringify(canonicalMatrixBodyV2(parsed))
}

export function computeCompatibilityMatrixIdV2(canonicalMatrix: string): string {
  return hashUrn('compatibility-matrix', canonicalMatrix)
}

function unknownV2(
  code: CompatibilityUnknownCodeV2,
  matrixId?: string,
): UnknownCompatibilityResolutionV2 {
  return matrixId === undefined
    ? Object.freeze({
        outcome: 'unknown' as const,
        code,
        reason: UNKNOWN_REASONS_V2[code],
      })
    : Object.freeze({
        outcome: 'unknown' as const,
        code,
        matrixId,
        reason: UNKNOWN_REASONS_V2[code],
      })
}

function resolveInternalV2(input: unknown): CompatibilityResolutionV2 {
  const request = parseRequestV2(input)
  if (request === undefined) return unknownV2('invalid-request')

  const targetSemantic = parseTargetSemanticV2(request.targetSemantic)
  if (targetSemantic === undefined) return unknownV2('target-semantic-invalid')
  const targetEvidence = parseTargetEvidenceV2(request.targetEvidence)
  if (targetEvidence === undefined) return unknownV2('target-evidence-invalid')
  const runtimeDescriptor = parseRuntimeDescriptorV2(request.runtimeDescriptor)
  if (runtimeDescriptor === undefined) return unknownV2('runtime-descriptor-invalid')
  const inventoryEvidence = parseInventoryEvidenceV2(request.inventoryEvidence)
  if (inventoryEvidence === undefined) return unknownV2('inventory-evidence-invalid')

  const targetSemanticBody = canonicalTargetSemanticBodyV2(targetSemantic)
  const targetSemanticDigest = computeTargetSemanticDigestV2(targetSemanticBody)
  if (targetSemantic.targetSemanticDigest !== targetSemanticDigest) {
    return unknownV2('target-semantic-digest-mismatch')
  }
  const targetEvidenceBody = canonicalTargetEvidenceBodyV2(targetEvidence)
  const targetEvidenceDigest = computeTargetEvidenceDigestV2(targetEvidenceBody)
  if (targetEvidence.targetEvidenceDigest !== targetEvidenceDigest) {
    return unknownV2('target-evidence-digest-mismatch')
  }
  const runtimeDescriptorBody = canonicalRuntimeDescriptorBodyV2(runtimeDescriptor)
  const runtimeDescriptorDigest = computeRuntimeDescriptorDigestV2(runtimeDescriptorBody)
  if (runtimeDescriptor.runtimeDescriptorDigest !== runtimeDescriptorDigest) {
    return unknownV2('runtime-descriptor-digest-mismatch')
  }
  const inventoryEvidenceBody = canonicalInventoryEvidenceBodyV2(inventoryEvidence)
  const inventoryEvidenceDigest = computeInventoryEvidenceDigestV2(inventoryEvidenceBody)
  if (inventoryEvidence.inventoryEvidenceDigest !== inventoryEvidenceDigest) {
    return unknownV2('inventory-evidence-digest-mismatch')
  }

  if (targetEvidence.targetSemanticDigest !== targetSemanticDigest) {
    return unknownV2('target-stable-binding-mismatch')
  }
  if (inventoryEvidence.runtimeDescriptorDigest !== runtimeDescriptorDigest) {
    return unknownV2('runtime-stable-binding-mismatch')
  }
  if (
    targetEvidence.matterId !== request.currentRevision.matterId ||
    targetEvidence.revisionId !== request.currentRevision.revisionId ||
    targetEvidence.revisionDigest !== request.currentRevision.digest
  ) {
    return unknownV2('target-not-current')
  }
  if (
    !targetSemantic.actionPolicies.some(
      (policy) => policy.actionScope === targetEvidence.actionScope,
    )
  ) {
    return unknownV2('target-action-not-declared')
  }

  const evaluatedAt = Date.parse(request.evaluatedAt)
  if (
    evaluatedAt < Date.parse(inventoryEvidence.observedAt) ||
    evaluatedAt >= Date.parse(inventoryEvidence.expiresAt)
  ) {
    return unknownV2('inventory-not-active')
  }

  const providerResult = parseMatrixProviderResultV2(request.matrix)
  if (providerResult === undefined) return unknownV2('matrix-artifact-invalid')
  if (providerResult.kind === 'unavailable') {
    return unknownV2('matrix-provider-unavailable')
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(providerResult.canonicalMatrix)
  } catch {
    return unknownV2('matrix-artifact-invalid')
  }
  const matrix = parseMatrixV2(decoded)
  if (matrix === undefined) return unknownV2('matrix-artifact-invalid')
  if (canonicalizeCompatibilityMatrixV2(matrix) !== providerResult.canonicalMatrix) {
    return unknownV2('matrix-artifact-invalid')
  }
  if (computeCompatibilityMatrixIdV2(providerResult.canonicalMatrix) !== providerResult.matrixId) {
    return unknownV2('matrix-id-mismatch')
  }

  if (
    evaluatedAt < Date.parse(matrix.validFrom) ||
    evaluatedAt >= Date.parse(matrix.expiresAt)
  ) {
    return unknownV2('matrix-not-active', providerResult.matrixId)
  }
  if (
    providerResult.revocations.some(
      (revocation) =>
        revocation.matrixId === providerResult.matrixId &&
        Date.parse(revocation.revokedAt) <= evaluatedAt,
    )
  ) {
    return unknownV2('matrix-revoked', providerResult.matrixId)
  }

  const ruleIds = new Set<string>()
  for (const rule of matrix.rules) {
    if (ruleIds.has(rule.ruleId)) {
      return unknownV2('matrix-rule-duplicate', providerResult.matrixId)
    }
    ruleIds.add(rule.ruleId)
  }

  const rulesByPair = new Map<string, CompatibilityMatrixRuleV2[]>()
  for (const rule of matrix.rules) {
    const pair = `${rule.targetSemanticDigest}\u0000${rule.runtimeDescriptorDigest}`
    const group = rulesByPair.get(pair)
    if (group === undefined) {
      rulesByPair.set(pair, [rule])
    } else {
      group.push(rule)
    }
  }
  let hasAmbiguousPair = false
  for (const group of rulesByPair.values()) {
    if (group.length < 2) continue
    if (new Set(group.map((rule) => rule.outcome)).size > 1) {
      return unknownV2('matrix-rule-conflict', providerResult.matrixId)
    }
    hasAmbiguousPair = true
  }
  if (hasAmbiguousPair) {
    return unknownV2('matrix-rule-ambiguous', providerResult.matrixId)
  }

  const matches = matrix.rules.filter(
    (rule) =>
      rule.targetSemanticDigest === targetSemanticDigest &&
      rule.runtimeDescriptorDigest === runtimeDescriptorDigest,
  )
  if (matches.length === 0) return unknownV2('no-matching-rule', providerResult.matrixId)
  if (matches.length > 1) {
    const outcomes = new Set(matches.map((rule) => rule.outcome))
    return outcomes.size > 1
      ? unknownV2('matrix-rule-conflict', providerResult.matrixId)
      : unknownV2('matrix-rule-ambiguous', providerResult.matrixId)
  }

  const match = matches[0]
  if (match === undefined) return unknownV2('no-matching-rule', providerResult.matrixId)
  const binding: CompatibilityResolutionBindingV2 = Object.freeze({
    evaluatedAt: request.evaluatedAt,
    actionScope: targetEvidence.actionScope,
    matrixId: providerResult.matrixId,
    matchedRuleId: match.ruleId,
    targetSemanticDigest,
    targetEvidenceDigest,
    runtimeDescriptorDigest,
    inventoryEvidenceDigest,
    matrixProviderProvenanceDigest: providerResult.providerProvenanceDigest,
  })

  if (match.outcome === 'equivalent') {
    return Object.freeze({
      outcome: 'equivalent' as const,
      code: 'exact-match' as const,
      reasonCode: match.reasonCode,
      reason: match.reason,
      binding,
    })
  }
  if (match.outcome === 'requires-new-revision') {
    return Object.freeze({
      outcome: 'requires-new-revision' as const,
      code: 'semantic-change' as const,
      reasonCode: match.reasonCode,
      reason: match.reason,
      binding,
    })
  }
  return unknownV2('no-matching-rule', providerResult.matrixId)
}

export function resolveCompatibilityV2(input: unknown): CompatibilityResolutionV2 {
  try {
    return resolveInternalV2(input)
  } catch {
    return unknownV2('invalid-request')
  }
}

export function createCompatibilityResolverV2(): CompatibilityResolverV2 {
  return Object.freeze({ resolve: resolveCompatibilityV2 })
}
