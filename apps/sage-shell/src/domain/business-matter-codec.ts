import {
  BusinessMatterError,
  createBusinessMatter,
  enterEvidence,
  failAttempt,
  markDispatchUnknown,
  succeedAttempt,
  projectBusinessMatter,
  reconfirmRevision,
  recordArtifact,
  recordDecision,
  recordReceipt,
  requestClarification,
  revokeDecision,
  startAttempt,
  stopMatter,
  type BusinessMatter,
  type BusinessMatterErrorCode,
  type BusinessMatterEvent,} from './business-matter.js'

export type BusinessMatterCodecErrorCode =
  | 'duplicate-event-id'
  | 'invalid-envelope'
  | 'invalid-payload'
  | 'matter-identity-mismatch'
  | 'non-canonical-payload'
  | 'semantic-replay-failed'
  | 'stream-version-gap'
  | 'unsupported-event-type'
  | 'unsupported-schema'

export interface BusinessMatterCodecErrorContext {
  readonly eventIndex?: number
  readonly streamVersion?: number
  readonly eventId?: string
  readonly field?: string
  readonly domainCode?: BusinessMatterErrorCode
}

export class BusinessMatterCodecError extends Error {
  readonly code: BusinessMatterCodecErrorCode
  readonly eventIndex: number | undefined
  readonly streamVersion: number | undefined
  readonly eventId: string | undefined
  readonly field: string | undefined
  readonly domainCode: BusinessMatterErrorCode | undefined

  constructor(
    code: BusinessMatterCodecErrorCode,
    message: string,
    context: BusinessMatterCodecErrorContext = {},
  ) {
    super(message)
    this.name = 'BusinessMatterCodecError'
    this.code = code
    this.eventIndex = context.eventIndex
    this.streamVersion = context.streamVersion
    this.eventId = context.eventId
    this.field = context.field
    this.domainCode = context.domainCode
  }
}

export interface BusinessMatterEventEnvelope {
  readonly matterId: string
  readonly streamVersion: number
  readonly eventId: string
  readonly eventType: string
  readonly eventSchemaVersion: number
  readonly occurredAt: string
  readonly payloadBytes: Uint8Array
}

const EVENT_TYPES = new Set<BusinessMatterEvent['type']>([
  'matter-created',
  'revision-entered',
  'clarification-requested',
  'decision-recorded',
  'decision-revoked',
  'attempt-started',
  'attempt-failed',
  'attempt-succeeded',
  'attempt-dispatch-unknown',
  'revision-reconfirmed',
  'artifact-recorded',
  'receipt-recorded',
  'matter-stopped',
])

function codecError(
  code: BusinessMatterCodecErrorCode,
  message: string,
  context: BusinessMatterCodecErrorContext = {},
): never {
  throw new BusinessMatterCodecError(code, message, context)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  )
}

function equalEvents(left: BusinessMatterEvent, right: BusinessMatterEvent): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
}

function encodePayload(event: BusinessMatterEvent): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(event))
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u

function isValidIsoUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_TIMESTAMP.test(value)) return false
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return false
  const normalized = value.includes('.') ? value : value.replace(/Z$/u, '.000Z')
  return new Date(timestamp).toISOString() === normalized
}

function payloadError(
  context: BusinessMatterCodecErrorContext,
  field: string,
  message: string,
): never {
  codecError(
    'invalid-payload',
    `Event ${context.eventId ?? '(unknown)'} ${field} ${message}`,
    { ...context, field },
  )
}

function exactPayloadRecord(
  value: unknown,
  field: string,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  context: BusinessMatterCodecErrorContext,
): Record<string, unknown> {
  if (!isRecord(value)) {
    payloadError(context, field, 'must be an object.')
  }
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string' || !allowed.has(key))) {
    payloadError(context, field, 'contains an unknown field.')
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      payloadError(context, `${field}.${key}`, 'is required.')
    }
  }
  return value
}

function payloadString(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): string {
  if (typeof value !== 'string') payloadError(context, field, 'must be a string.')
  return value
}

function payloadIsoTimestamp(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): string {
  const timestamp = payloadString(value, field, context)
  if (!isValidIsoUtcTimestamp(timestamp)) {
    payloadError(context, field, 'must be a valid UTC ISO-8601 timestamp.')
  }
  return timestamp
}

function payloadBoolean(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): boolean {
  if (typeof value !== 'boolean') payloadError(context, field, 'must be boolean.')
  return value
}

function payloadEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  context: BusinessMatterCodecErrorContext,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    payloadError(context, field, `must be one of ${allowed.join(', ')}.`)
  }
  return value as T
}

function payloadArray(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): readonly unknown[] {
  if (!Array.isArray(value)) payloadError(context, field, 'must be an array.')
  return value
}

function assertStringArray(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  payloadArray(value, field, context).forEach((item, index) => {
    payloadString(item, `${field}[${index}]`, context)
  })
}

function assertOptionalString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  if (Object.hasOwn(record, key)) payloadString(record[key], field, context)
}

function assertHumanRole(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const role = exactPayloadRecord(value, field, ['kind', 'roleRef'], [], context)
  payloadEnum(role.kind, `${field}.kind`, ['human'] as const, context)
  payloadString(role.roleRef, `${field}.roleRef`, context)
}

function assertEvidence(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const evidence = exactPayloadRecord(
    value,
    field,
    ['evidenceId', 'source', 'observedAt', 'status'],
    [],
    context,
  )
  payloadString(evidence.evidenceId, `${field}.evidenceId`, context)
  payloadString(evidence.source, `${field}.source`, context)
  payloadIsoTimestamp(evidence.observedAt, `${field}.observedAt`, context)
  payloadEnum(
    evidence.status,
    `${field}.status`,
    ['supported', 'insufficient', 'contradicted'] as const,
    context,
  )
}

function assertUnknown(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const unknown = exactPayloadRecord(value, field, ['unknownId', 'description'], [], context)
  payloadString(unknown.unknownId, `${field}.unknownId`, context)
  payloadString(unknown.description, `${field}.description`, context)
}

function assertDependency(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const dependency = exactPayloadRecord(value, field, ['dependencyId', 'status'], [], context)
  payloadString(dependency.dependencyId, `${field}.dependencyId`, context)
  payloadEnum(
    dependency.status,
    `${field}.status`,
    ['ready', 'blocked', 'unknown'] as const,
    context,
  )
}

function assertExperience(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const experience = exactPayloadRecord(
    value,
    field,
    ['experienceId', 'sourceRevisionId', 'sourceEventId', 'adoption'],
    [],
    context,
  )
  payloadString(experience.experienceId, `${field}.experienceId`, context)
  payloadString(experience.sourceRevisionId, `${field}.sourceRevisionId`, context)
  payloadString(experience.sourceEventId, `${field}.sourceEventId`, context)
  payloadEnum(
    experience.adoption,
    `${field}.adoption`,
    ['adopted', 'adapted', 'rejected'] as const,
    context,
  )
}

function assertActionPolicy(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const policy = exactPayloadRecord(
    value,
    field,
    ['actionScope', 'effectClass', 'requiresDecision'],
    [],
    context,
  )
  payloadString(policy.actionScope, `${field}.actionScope`, context)
  payloadEnum(
    policy.effectClass,
    `${field}.effectClass`,
    ['local-read', 'local-write', 'external-read', 'external-write', 'privileged'] as const,
    context,
  )
  payloadBoolean(policy.requiresDecision, `${field}.requiresDecision`, context)
}

function assertVersionedIdentity(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const identity = exactPayloadRecord(value, field, ['identity', 'version', 'digest'], [], context)
  payloadString(identity.identity, `${field}.identity`, context)
  payloadString(identity.version, `${field}.version`, context)
  payloadString(identity.digest, `${field}.digest`, context)
}

function assertExecutionSnapshot(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const snapshot = exactPayloadRecord(
    value,
    field,
    ['provider', 'model', 'agent', 'preset', 'capabilities'],
    [],
    context,
  )
  for (const key of ['provider', 'model', 'agent', 'preset'] as const) {
    assertVersionedIdentity(snapshot[key], `${field}.${key}`, context)
  }
  payloadArray(snapshot.capabilities, `${field}.capabilities`, context).forEach((item, index) => {
    assertVersionedIdentity(item, `${field}.capabilities[${index}]`, context)
  })
}

function assertCompatibility(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const compatibility = exactPayloadRecord(
    value,
    field,
    ['outcome', 'matrixId', 'reason'],
    [],
    context,
  )
  payloadEnum(
    compatibility.outcome,
    `${field}.outcome`,
    ['equivalent', 'requires-new-revision', 'unknown'] as const,
    context,
  )
  payloadString(compatibility.matrixId, `${field}.matrixId`, context)
  payloadString(compatibility.reason, `${field}.reason`, context)
}

function assertRevision(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const revision = exactPayloadRecord(
    value,
    field,
    [
      'revisionId',
      'createdByEventId',
      'matterCreatedByEventId',
      'changeReason',
      'scope',
      'permissionBoundary',
      'dataDestination',
      'evidence',
      'unknowns',
      'options',
      'dependencies',
      'experienceRefs',
      'actionPolicies',
    ],
    ['predecessorRevisionId'],
    context,
  )
  payloadString(revision.revisionId, `${field}.revisionId`, context)
  assertOptionalString(
    revision,
    'predecessorRevisionId',
    `${field}.predecessorRevisionId`,
    context,
  )
  for (const key of [
    'createdByEventId',
    'matterCreatedByEventId',
    'changeReason',
    'scope',
    'permissionBoundary',
    'dataDestination',
  ] as const) {
    payloadString(revision[key], `${field}.${key}`, context)
  }
  payloadArray(revision.evidence, `${field}.evidence`, context).forEach((item, index) => {
    assertEvidence(item, `${field}.evidence[${index}]`, context)
  })
  payloadArray(revision.unknowns, `${field}.unknowns`, context).forEach((item, index) => {
    assertUnknown(item, `${field}.unknowns[${index}]`, context)
  })
  assertStringArray(revision.options, `${field}.options`, context)
  payloadArray(revision.dependencies, `${field}.dependencies`, context).forEach((item, index) => {
    assertDependency(item, `${field}.dependencies[${index}]`, context)
  })
  payloadArray(revision.experienceRefs, `${field}.experienceRefs`, context).forEach((item, index) => {
    assertExperience(item, `${field}.experienceRefs[${index}]`, context)
  })
  payloadArray(revision.actionPolicies, `${field}.actionPolicies`, context).forEach((item, index) => {
    assertActionPolicy(item, `${field}.actionPolicies[${index}]`, context)
  })
}

function assertDecision(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const decision = exactPayloadRecord(
    value,
    field,
    ['decisionId', 'revisionId', 'actionScope', 'outcome', 'actor', 'reason', 'recordedAt'],
    ['expiresAt'],
    context,
  )
  for (const key of ['decisionId', 'revisionId', 'actionScope', 'reason'] as const) {
    payloadString(decision[key], `${field}.${key}`, context)
  }
  payloadEnum(decision.outcome, `${field}.outcome`, ['approved', 'rejected'] as const, context)
  assertHumanRole(decision.actor, `${field}.actor`, context)
  assertOptionalString(decision, 'expiresAt', `${field}.expiresAt`, context)
  if (Object.hasOwn(decision, 'expiresAt')) {
    payloadIsoTimestamp(decision.expiresAt, `${field}.expiresAt`, context)
  }
  payloadIsoTimestamp(decision.recordedAt, `${field}.recordedAt`, context)
}

function assertAttempt(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const attempt = exactPayloadRecord(
    value,
    field,
    [
      'attemptId',
      'revisionId',
      'actionScopes',
      'actionPolicies',
      'decisionIds',
      'executionSnapshot',
      'compatibility',
    ],
    ['observedTurnEndEdge'],
    context,
  )
  payloadString(attempt.attemptId, `${field}.attemptId`, context)
  payloadString(attempt.revisionId, `${field}.revisionId`, context)
  assertStringArray(attempt.actionScopes, `${field}.actionScopes`, context)
  payloadArray(attempt.actionPolicies, `${field}.actionPolicies`, context).forEach((item, index) => {
    assertActionPolicy(item, `${field}.actionPolicies[${index}]`, context)
  })
  assertStringArray(attempt.decisionIds, `${field}.decisionIds`, context)
  assertExecutionSnapshot(attempt.executionSnapshot, `${field}.executionSnapshot`, context)
  assertCompatibility(attempt.compatibility, `${field}.compatibility`, context)
  if (Object.hasOwn(attempt, 'observedTurnEndEdge')) {
    const edge = attempt.observedTurnEndEdge
    if (edge !== null && typeof edge !== 'string') {
      payloadError(context, `${field}.observedTurnEndEdge`, 'must be a string or null.')
    }
  }
}

function assertArtifact(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const artifact = exactPayloadRecord(
    value,
    field,
    ['artifactId', 'attemptId', 'kind', 'locator', 'digest'],
    [],
    context,
  )
  for (const key of ['artifactId', 'attemptId', 'kind', 'locator', 'digest'] as const) {
    payloadString(artifact[key], `${field}.${key}`, context)
  }
}

function assertReceipt(
  value: unknown,
  field: string,
  context: BusinessMatterCodecErrorContext,
): void {
  const receipt = exactPayloadRecord(
    value,
    field,
    ['receiptId', 'artifactId', 'verdict', 'actor', 'reason', 'evidenceRefs'],
    [],
    context,
  )
  payloadString(receipt.receiptId, `${field}.receiptId`, context)
  payloadString(receipt.artifactId, `${field}.artifactId`, context)
  payloadEnum(receipt.verdict, `${field}.verdict`, ['accepted', 'rejected'] as const, context)
  assertHumanRole(receipt.actor, `${field}.actor`, context)
  payloadString(receipt.reason, `${field}.reason`, context)
  assertStringArray(receipt.evidenceRefs, `${field}.evidenceRefs`, context)
}

const COMMON_EVENT_KEYS = ['type', 'eventId', 'matterId', 'occurredAt'] as const

function assertEventRuntimeShape(
  value: Record<string, unknown>,
  eventType: BusinessMatterEvent['type'],
  context: BusinessMatterCodecErrorContext,
): void {
  const required: string[] = [...COMMON_EVENT_KEYS]
  const optional: string[] = []
  switch (eventType) {
    case 'matter-created':
      required.push('goal', 'responsibleParty')
      break
    case 'revision-entered':
      required.push('revision')
      break
    case 'clarification-requested':
      required.push('revisionId', 'reason')
      optional.push('attemptId', 'actionScope')
      break
    case 'decision-recorded':
      required.push('decision')
      break
    case 'decision-revoked':
      required.push('decisionId', 'reason')
      break
    case 'attempt-started':
      required.push('attempt')
      break
    case 'attempt-failed':
      required.push('attemptId', 'source', 'reason', 'impact')
      break
    case 'attempt-succeeded':
      required.push('attemptId')
      break
    case 'attempt-dispatch-unknown':
      required.push('attemptId')
      break
    case 'revision-reconfirmed':
      required.push('revisionId', 'compatibility', 'reason')
      break
    case 'artifact-recorded':
      required.push('artifact')
      break
    case 'receipt-recorded':
      required.push('receipt')
      break
    case 'matter-stopped':
      required.push('revisionId', 'reason')
      break
  }
  exactPayloadRecord(value, 'payload', required, optional, context)
  payloadEnum(value.type, 'payload.type', [eventType], context)
  payloadString(value.eventId, 'payload.eventId', context)
  payloadString(value.matterId, 'payload.matterId', context)
  payloadIsoTimestamp(value.occurredAt, 'payload.occurredAt', context)

  switch (eventType) {
    case 'matter-created':
      payloadString(value.goal, 'payload.goal', context)
      assertHumanRole(value.responsibleParty, 'payload.responsibleParty', context)
      break
    case 'revision-entered':
      assertRevision(value.revision, 'payload.revision', context)
      break
    case 'clarification-requested':
      payloadString(value.revisionId, 'payload.revisionId', context)
      assertOptionalString(value, 'attemptId', 'payload.attemptId', context)
      assertOptionalString(value, 'actionScope', 'payload.actionScope', context)
      payloadString(value.reason, 'payload.reason', context)
      break
    case 'decision-recorded':
      assertDecision(value.decision, 'payload.decision', context)
      break
    case 'decision-revoked':
      payloadString(value.decisionId, 'payload.decisionId', context)
      payloadString(value.reason, 'payload.reason', context)
      break
    case 'attempt-started':
      assertAttempt(value.attempt, 'payload.attempt', context)
      break
    case 'attempt-succeeded':
      payloadString(value.attemptId, 'payload.attemptId', context)
      break
    case 'attempt-dispatch-unknown':
      payloadString(value.attemptId, 'payload.attemptId', context)
      break
    case 'attempt-failed':
      payloadString(value.attemptId, 'payload.attemptId', context)
      payloadEnum(
        value.source,
        'payload.source',
        ['runtime', 'tool', 'profile-generation', 'execution-snapshot-changed', 'other'] as const,
        context,
      )
      payloadString(value.reason, 'payload.reason', context)
      payloadString(value.impact, 'payload.impact', context)
      break
    case 'revision-reconfirmed':
      payloadString(value.revisionId, 'payload.revisionId', context)
      assertCompatibility(value.compatibility, 'payload.compatibility', context)
      payloadString(value.reason, 'payload.reason', context)
      break
    case 'artifact-recorded':
      assertArtifact(value.artifact, 'payload.artifact', context)
      break
    case 'receipt-recorded':
      assertReceipt(value.receipt, 'payload.receipt', context)
      break
    case 'matter-stopped':
      payloadString(value.revisionId, 'payload.revisionId', context)
      payloadString(value.reason, 'payload.reason', context)
      break
  }
}

export function encodeBusinessMatterEvents(
  matter: BusinessMatter,
): readonly BusinessMatterEventEnvelope[] {
  projectBusinessMatter(matter)
  return matter.events.map((event, index) => ({
    matterId: event.matterId,
    streamVersion: index + 1,
    eventId: event.eventId,
    eventType: event.type,
    eventSchemaVersion: 1,
    occurredAt: event.occurredAt,
    payloadBytes: encodePayload(event),
  }))
}

function decodePayload(
  envelope: BusinessMatterEventEnvelope,
  eventIndex: number,
): BusinessMatterEvent {
  const context: BusinessMatterCodecErrorContext = {
    eventIndex,
    streamVersion: envelope.streamVersion,
    eventId: envelope.eventId,
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(envelope.payloadBytes)
  } catch {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} payload is not valid UTF-8.`,
      { ...context, field: 'payloadBytes' },
    )
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} payload is not valid JSON.`,
      { ...context, field: 'payloadBytes' },
    )
  }
  if (!isRecord(value)) {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} payload must be an object.`,
      { ...context, field: 'payload' },
    )
  }
  if (value.type !== envelope.eventType) {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} type disagrees with its envelope.`,
      { ...context, field: 'payload.type' },
    )
  }
  if (value.eventId !== envelope.eventId) {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} eventId disagrees with its envelope.`,
      { ...context, field: 'payload.eventId' },
    )
  }
  if (value.occurredAt !== envelope.occurredAt) {
    codecError(
      'invalid-payload',
      `Event ${envelope.eventId} occurredAt disagrees with its envelope.`,
      { ...context, field: 'payload.occurredAt' },
    )
  }
  if (value.matterId !== envelope.matterId) {
    codecError(
      'matter-identity-mismatch',
      `Event ${envelope.eventId} changed matter identity.`,
      { ...context, field: 'payload.matterId' },
    )
  }
  assertEventRuntimeShape(
    value,
    envelope.eventType as BusinessMatterEvent['type'],
    context,
  )
  return value as unknown as BusinessMatterEvent
}

const ENVELOPE_KEYS = new Set([
  'matterId',
  'streamVersion',
  'eventId',
  'eventType',
  'eventSchemaVersion',
  'occurredAt',
  'payloadBytes',
])

function assertEnvelope(
  input: unknown,
  expectedVersion: number,
  expectedMatterId: string | undefined,
  eventIds: Set<string>,
  eventIndex: number,
): BusinessMatterEventEnvelope {
  if (typeof input !== 'object' || input === null) {
    codecError('invalid-envelope', 'Event envelope must be an object.', { eventIndex })
  }
  let ownKeys: readonly PropertyKey[]
  let descriptors: PropertyDescriptorMap
  try {
    if (Array.isArray(input)) {
      codecError('invalid-envelope', 'Event envelope must be an object.', { eventIndex })
    }
    ownKeys = Reflect.ownKeys(input)
    descriptors = Object.getOwnPropertyDescriptors(input)
  } catch (error) {
    if (error instanceof BusinessMatterCodecError) throw error
    codecError(
      'invalid-envelope',
      'Event envelope could not be safely inspected.',
      { eventIndex },
    )
  }
  if (
    ownKeys.length !== ENVELOPE_KEYS.size ||
    ownKeys.some((key) => typeof key !== 'string' || !ENVELOPE_KEYS.has(key))
  ) {
    codecError(
      'invalid-envelope',
      'Event envelope must contain only the exact v1 fields.',
      { eventIndex },
    )
  }
  const values: Record<string, unknown> = {}
  for (const key of ENVELOPE_KEYS) {
    const descriptor = descriptors[key]
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      codecError(
        'invalid-envelope',
        `Event envelope ${key} must be an own data property.`,
        { eventIndex, field: key },
      )
    }
    values[key] = descriptor.value
  }
  const envelope = values as Partial<BusinessMatterEventEnvelope>
  const context: BusinessMatterCodecErrorContext = {
    eventIndex,
    ...(typeof envelope.eventId === 'string' ? { eventId: envelope.eventId } : {}),
    ...(typeof envelope.streamVersion === 'number'
      ? { streamVersion: envelope.streamVersion }
      : {}),
  }
  for (const field of ['matterId', 'eventId', 'eventType', 'occurredAt'] as const) {
    const value = envelope[field]
    if (typeof value !== 'string' || value.trim().length === 0) {
      codecError(
        'invalid-envelope',
        `Event envelope ${field} must be a non-empty string.`,
        { ...context, field },
      )
    }
  }
  const eventId = envelope.eventId as string
  if (!Number.isSafeInteger(envelope.streamVersion) || (envelope.streamVersion ?? 0) <= 0) {
    codecError(
      'invalid-envelope',
      'Event envelope streamVersion must be a positive safe integer.',
      { ...context, field: 'streamVersion' },
    )
  }
  if (envelope.streamVersion !== expectedVersion) {
    codecError(
      'stream-version-gap',
      `Expected streamVersion ${expectedVersion}, received ${envelope.streamVersion}.`,
      { ...context, field: 'streamVersion' },
    )
  }
  if (
    !Number.isSafeInteger(envelope.eventSchemaVersion) ||
    (envelope.eventSchemaVersion ?? 0) <= 0
  ) {
    codecError(
      'invalid-envelope',
      'Event envelope eventSchemaVersion must be a positive safe integer.',
      { ...context, field: 'eventSchemaVersion' },
    )
  }
  if (envelope.eventSchemaVersion !== 1) {
    codecError(
      'unsupported-schema',
      `Event ${eventId} uses unsupported schema ${envelope.eventSchemaVersion}.`,
      { ...context, field: 'eventSchemaVersion' },
    )
  }
  if (!EVENT_TYPES.has(envelope.eventType as BusinessMatterEvent['type'])) {
    codecError(
      'unsupported-event-type',
      `Event ${eventId} has unknown type ${envelope.eventType}.`,
      { ...context, field: 'eventType' },
    )
  }
  if (!isValidIsoUtcTimestamp(envelope.occurredAt as string)) {
    codecError(
      'invalid-envelope',
      `Event ${eventId} occurredAt must be a valid UTC ISO-8601 timestamp.`,
      { ...context, field: 'occurredAt' },
    )
  }
  if (!(envelope.payloadBytes instanceof Uint8Array)) {
    codecError(
      'invalid-payload',
      `Event ${eventId} payloadBytes must be Uint8Array.`,
      { ...context, field: 'payloadBytes' },
    )
  }
  if (expectedMatterId !== undefined && envelope.matterId !== expectedMatterId) {
    codecError(
      'matter-identity-mismatch',
      `Event ${eventId} belongs to another matter.`,
      { ...context, field: 'matterId' },
    )
  }
  if (eventIds.has(eventId)) {
    codecError(
      'duplicate-event-id',
      `Event ${eventId} is duplicated.`,
      { ...context, field: 'eventId' },
    )
  }
  eventIds.add(eventId)
  return envelope as BusinessMatterEventEnvelope
}

function readEnvelopeArray(input: unknown): readonly unknown[] {
  let isArray: boolean
  try {
    isArray = Array.isArray(input)
  } catch {
    codecError('invalid-envelope', 'The event stream could not be safely inspected.')
  }
  if (!isArray) codecError('invalid-envelope', 'A stream requires an event envelope array.')
  const array = input as readonly unknown[]

  let descriptors: PropertyDescriptorMap
  let ownKeys: readonly PropertyKey[]
  try {
    descriptors = Object.getOwnPropertyDescriptors(array) as unknown as PropertyDescriptorMap
    ownKeys = Reflect.ownKeys(array)
  } catch {
    codecError('invalid-envelope', 'The event stream could not be safely inspected.')
  }
  const lengthDescriptor = descriptors.length
  if (lengthDescriptor === undefined || !Object.hasOwn(lengthDescriptor, 'value')) {
    codecError('invalid-envelope', 'The event stream length must be an own data property.')
  }
  const length: unknown = lengthDescriptor.value
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length <= 0) {
    codecError('invalid-envelope', 'A stream requires at least one event envelope.')
  }
  const allowedKeys = new Set<PropertyKey>(['length'])
  for (let index = 0; index < length; index += 1) allowedKeys.add(String(index))
  if (ownKeys.some((key) => !allowedKeys.has(key))) {
    codecError('invalid-envelope', 'The event stream array contains an unexpected property.')
  }
  const values: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      codecError('invalid-envelope', `Event stream index ${index} must be an own data property.`)
    }
    values.push(descriptor.value)
  }
  return values
}

function replayEvent(
  matter: BusinessMatter | undefined,
  event: BusinessMatterEvent,
  context: BusinessMatterCodecErrorContext,
): BusinessMatter {
  if (event.type === 'matter-created') {
    if (matter !== undefined) {
      codecError(
        'semantic-replay-failed',
        'A stream may contain only one creation event.',
        context,
      )
    }
    return createBusinessMatter({
      matterId: event.matterId,
      eventId: event.eventId,
      occurredAt: event.occurredAt,
      goal: event.goal,
      responsibleParty: event.responsibleParty,
    })
  }
  if (matter === undefined) {
    codecError(
      'semantic-replay-failed',
      'The first event must create the matter.',
      context,
    )
  }

  switch (event.type) {
    case 'revision-entered':
      return enterEvidence(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        revisionId: event.revision.revisionId,
        changeReason: event.revision.changeReason,
        scope: event.revision.scope,
        permissionBoundary: event.revision.permissionBoundary,
        dataDestination: event.revision.dataDestination,
        evidence: event.revision.evidence,
        unknowns: event.revision.unknowns,
        options: event.revision.options,
        dependencies: event.revision.dependencies,
        experienceRefs: event.revision.experienceRefs,
        actionPolicies: event.revision.actionPolicies,
      })
    case 'clarification-requested':
      return requestClarification(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        revisionId: event.revisionId,
        actionScope: event.actionScope,
        reason: event.reason,
      })
    case 'decision-recorded':
      return recordDecision(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        decisionId: event.decision.decisionId,
        revisionId: event.decision.revisionId,
        actionScope: event.decision.actionScope,
        outcome: event.decision.outcome,
        actor: event.decision.actor,
        reason: event.decision.reason,
        expiresAt: event.decision.expiresAt,
      })
    case 'decision-revoked':
      return revokeDecision(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        decisionId: event.decisionId,
        reason: event.reason,
      })
    case 'attempt-started':
      return startAttempt(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        attemptId: event.attempt.attemptId,
        revisionId: event.attempt.revisionId,
        actionScopes: event.attempt.actionScopes,
        decisionIds: event.attempt.decisionIds,
        executionSnapshot: event.attempt.executionSnapshot,
        compatibility: event.attempt.compatibility,
        observedTurnEndEdge: event.attempt.observedTurnEndEdge,
      })
    case 'attempt-failed':
      return failAttempt(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        attemptId: event.attemptId,
        source: event.source,
        reason: event.reason,
        impact: event.impact,
      })
    case 'attempt-succeeded':
      return succeedAttempt(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        attemptId: event.attemptId,
      })
    case 'attempt-dispatch-unknown':
      return markDispatchUnknown(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        attemptId: event.attemptId,
      })
    case 'revision-reconfirmed':
      return reconfirmRevision(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        revisionId: event.revisionId,
        compatibility: event.compatibility,
        reason: event.reason,
      })
    case 'artifact-recorded':
      return recordArtifact(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        artifactId: event.artifact.artifactId,
        attemptId: event.artifact.attemptId,
        kind: event.artifact.kind,
        locator: event.artifact.locator,
        digest: event.artifact.digest,
      })
    case 'receipt-recorded':
      return recordReceipt(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        receiptId: event.receipt.receiptId,
        artifactId: event.receipt.artifactId,
        verdict: event.receipt.verdict,
        actor: event.receipt.actor,
        reason: event.receipt.reason,
        evidenceRefs: event.receipt.evidenceRefs,
      })
    case 'matter-stopped':
      return stopMatter(matter, {
        eventId: event.eventId,
        occurredAt: event.occurredAt,
        revisionId: event.revisionId,
        reason: event.reason,
      })
  }
}

export function rehydrateBusinessMatter(
  input: unknown,
): BusinessMatter {
  const envelopes = readEnvelopeArray(input)

  const eventIds = new Set<string>()
  let expectedMatterId: string | undefined
  let matter: BusinessMatter | undefined
  for (const [index, candidate] of envelopes.entries()) {
    const envelope = assertEnvelope(
      candidate,
      index + 1,
      expectedMatterId,
      eventIds,
      index,
    )
    expectedMatterId ??= envelope.matterId
    const context: BusinessMatterCodecErrorContext = {
      eventIndex: index,
      streamVersion: envelope.streamVersion,
      eventId: envelope.eventId,
    }
    const decoded = decodePayload(envelope, index)
    try {
      const next = replayEvent(matter, decoded, context)
      const generated = next.events[next.events.length - 1]
      if (generated === undefined || !equalEvents(generated, decoded)) {
        codecError(
          'semantic-replay-failed',
          `Event ${envelope.eventId} contains forged or inconsistent derived metadata.`,
          context,
        )
      }
      if (!equalBytes(encodePayload(generated), envelope.payloadBytes)) {
        codecError(
          'non-canonical-payload',
          `Event ${envelope.eventId} payload bytes are not canonical v1 JSON.`,
          { ...context, field: 'payloadBytes' },
        )
      }
      matter = next
    } catch (error) {
      if (error instanceof BusinessMatterCodecError) throw error
      if (error instanceof BusinessMatterError) {
        codecError(
          'semantic-replay-failed',
          `Event ${envelope.eventId} failed domain replay: ${error.code}.`,
          { ...context, domainCode: error.code },
        )
      }
      codecError(
        'semantic-replay-failed',
        `Event ${envelope.eventId} failed domain replay.`,
        context,
      )
    }
  }
  if (matter === undefined) codecError('invalid-envelope', 'The stream produced no matter.')
  return matter
}
