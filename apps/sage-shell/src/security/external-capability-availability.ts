import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

export type ExternalCapabilityAvailabilityFailureCode =
  | 'availability-invalid'
  | 'availability-schema-unsupported'
  | 'availability-descriptor-unbound'
  | 'availability-evidence-unbound'
  | 'availability-host-binding-invalid'
  | 'availability-connection-binding-invalid'
  | 'availability-generation-mismatch'
  | 'availability-axis-invalid'
  | 'availability-preflight-invalid'
  | 'availability-expired'
  | 'availability-digest-mismatch'

export type ExternalCapabilityAvailabilityResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: ExternalCapabilityAvailabilityFailureCode
    readonly reason: string
  }>

export type ExternalCapabilityTransportStateV1 =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'unknown'

export type ExternalCapabilityDiscoveryStateV1 =
  | 'complete'
  | 'partial'
  | 'not-started'
  | 'invalid'

export type ExternalCapabilityContractStateV1 =
  | 'valid'
  | 'invalid'
  | 'changed'
  | 'unknown'

export type ExternalCapabilityOperationPreflightStateV1 =
  | 'not-requested'
  | 'port-valid'
  | 'blocked'
  | 'expired'
  | 'invalid'

export type ExternalCapabilityAvailabilityStateV1 = 'available' | 'unavailable'

export interface ExternalCapabilityAvailabilityHostBindingV1 {
  readonly schemaVersion: 'sage.external-capability-availability-host-binding.v1'
  readonly canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1'
  readonly projectionDigest: string
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
}

export interface ExternalCapabilityAvailabilityConnectionBindingV1 {
  readonly schemaVersion: 'sage.external-capability-availability-connection-binding.v1'
  readonly canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1'
  readonly connectionGeneration: string
  readonly bootId: string
  readonly runtimeGeneration: number
  readonly activeGeneration: string
}

export interface ExternalCapabilityAvailabilityBodyV1 {
  readonly schemaVersion: 'sage.external-capability-availability.v1'
  readonly canonicalizationVersion: 'sage.external-capability-availability-canonical-json.v1'
  readonly capabilityId: string
  readonly descriptorDigest: string
  readonly evidenceDigest: string
  readonly host: ExternalCapabilityAvailabilityHostBindingV1
  readonly connection: ExternalCapabilityAvailabilityConnectionBindingV1
  readonly transportState: ExternalCapabilityTransportStateV1
  readonly discoveryState: ExternalCapabilityDiscoveryStateV1
  readonly contractState: ExternalCapabilityContractStateV1
  readonly operationPreflightState: ExternalCapabilityOperationPreflightStateV1
  readonly operationId?: string
  readonly preflightPortDigest?: string
  readonly observedAt: string
  readonly expiresAt: string
}

export interface ExternalCapabilityAvailabilityV1 extends ExternalCapabilityAvailabilityBodyV1 {
  readonly availabilityState: ExternalCapabilityAvailabilityStateV1
  /** C2C.4 never grants action authority; C2D mapping and Identity / Policy remain required. */
  readonly actionability: 'blocked'
  readonly availabilityDigest: string
}

export interface ExternalCapabilityAvailabilityFreshnessInputV1 {
  readonly availability: ExternalCapabilityAvailabilityV1
  readonly evaluatedAt: string
}

const AVAILABILITY_SCHEMA_VERSION = 'sage.external-capability-availability.v1'
const HOST_SCHEMA_VERSION = 'sage.external-capability-availability-host-binding.v1'
const CONNECTION_SCHEMA_VERSION = 'sage.external-capability-availability-connection-binding.v1'
const CANONICALIZATION_VERSION = 'sage.external-capability-availability-canonical-json.v1'
const AVAILABILITY_DIGEST = /^urn:sage:external-capability-availability:sha256:[0-9a-f]{64}$/u
const DESCRIPTOR_DIGEST = /^urn:sage:external-capability-descriptor:sha256:[0-9a-f]{64}$/u
const EVIDENCE_DIGEST = /^urn:sage:external-capability-evidence:sha256:[0-9a-f]{64}$/u
const PROJECTION_DIGEST = /^sha256:[0-9a-f]{64}$/u
const PREFLIGHT_PORT_DIGEST = /^urn:sage:external-capability-preflight-port:sha256:[0-9a-f]{64}$/u
const CAPABILITY_ID = /^capability:sage\.[a-z0-9][a-z0-9._-]*$/u
const GENERATION = /^[a-z0-9][a-z0-9-]{0,63}$/u
const CONNECTION_GENERATION = /^connection:sage\.[a-z0-9][a-z0-9._-]{0,127}$/u
const BOOT_ID = /^sage-host:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPERATION_ID = /^[a-z][a-z0-9._-]{0,127}$/u
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u

const TRANSPORT_STATES: readonly ExternalCapabilityTransportStateV1[] = [
  'connected',
  'disconnected',
  'reconnecting',
  'unknown',
]
const DISCOVERY_STATES: readonly ExternalCapabilityDiscoveryStateV1[] = [
  'complete',
  'partial',
  'not-started',
  'invalid',
]
const CONTRACT_STATES: readonly ExternalCapabilityContractStateV1[] = [
  'valid',
  'invalid',
  'changed',
  'unknown',
]
const PREFLIGHT_STATES: readonly ExternalCapabilityOperationPreflightStateV1[] = [
  'not-requested',
  'port-valid',
  'blocked',
  'expired',
  'invalid',
]

const FAILURE_REASONS: Readonly<Record<ExternalCapabilityAvailabilityFailureCode, string>> = {
  'availability-invalid': 'The external capability availability record is invalid.',
  'availability-schema-unsupported': 'The external capability availability schema is unsupported.',
  'availability-descriptor-unbound': 'The availability record is not bound to a valid descriptor reference.',
  'availability-evidence-unbound': 'The availability record is not bound to a valid evidence reference.',
  'availability-host-binding-invalid': 'The external capability host binding is invalid.',
  'availability-connection-binding-invalid': 'The external capability connection binding is invalid.',
  'availability-generation-mismatch': 'The external capability availability generations do not match.',
  'availability-axis-invalid': 'The external capability availability axis is invalid.',
  'availability-preflight-invalid': 'The external capability operation preflight is invalid.',
  'availability-expired': 'The external capability availability record is outside its freshness window.',
  'availability-digest-mismatch': 'The external capability availability digest does not match its content.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{ readonly ok: false; readonly code: ExternalCapabilityAvailabilityFailureCode }>

interface ParsedTimestamp {
  readonly text: string
  readonly milliseconds: number
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((member) => canonicalJson(member)).join(',')}]`
  if (typeof value !== 'object' || value === null) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Canonical value is invalid.')
    return encoded
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

function digest(value: string): string {
  return `urn:sage:external-capability-availability:sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) freezeDeep(descriptor.value)
  }
  return Object.freeze(value)
}

function success<T>(value: T): ExternalCapabilityAvailabilityResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(code: ExternalCapabilityAvailabilityFailureCode): ExternalCapabilityAvailabilityResult<T> {
  return Object.freeze({ ok: false as const, code, reason: FAILURE_REASONS[code] })
}

function parsed<T>(value: T): ParseResult<T> {
  return { ok: true, value }
}

function rejected<T>(code: ExternalCapabilityAvailabilityFailureCode): ParseResult<T> {
  return { ok: false, code }
}

function inspectPlainRecord(value: unknown): PlainRecordSnapshot | undefined {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
      || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) return undefined
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
  if (requiredKeys.some((key) => !inspected.keys.includes(key))
    || inspected.keys.some((key) => !allowed.has(key))) return undefined
  return inspected.values
}

function exactString(value: unknown, pattern?: RegExp, maxLength = 256): string | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.trim() !== value) {
    return undefined
  }
  if (pattern !== undefined && !pattern.test(value)) return undefined
  return value
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
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (daysInMonth === undefined || month < 1 || month > 12 || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59) return undefined
  const utcMilliseconds = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds)
  return Number.isFinite(utcMilliseconds) ? { text, milliseconds: utcMilliseconds } : undefined
}

function parseHostBinding(value: unknown): ParseResult<ExternalCapabilityAvailabilityHostBindingV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'projectionDigest',
    'bootId',
    'runtimeGeneration',
    'activeGeneration',
  ])
  if (record === undefined || record.schemaVersion !== HOST_SCHEMA_VERSION
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION
    || typeof record.projectionDigest !== 'string' || !PROJECTION_DIGEST.test(record.projectionDigest)
    || typeof record.bootId !== 'string' || !BOOT_ID.test(record.bootId)
    || typeof record.runtimeGeneration !== 'number' || !Number.isSafeInteger(record.runtimeGeneration)
    || record.runtimeGeneration < 1 || typeof record.activeGeneration !== 'string'
    || !GENERATION.test(record.activeGeneration)) return rejected('availability-host-binding-invalid')
  return parsed({
    schemaVersion: HOST_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    projectionDigest: record.projectionDigest,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    activeGeneration: record.activeGeneration,
  })
}

function parseConnectionBinding(value: unknown): ParseResult<ExternalCapabilityAvailabilityConnectionBindingV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'connectionGeneration',
    'bootId',
    'runtimeGeneration',
    'activeGeneration',
  ])
  if (record === undefined || record.schemaVersion !== CONNECTION_SCHEMA_VERSION
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION
    || typeof record.connectionGeneration !== 'string' || !CONNECTION_GENERATION.test(record.connectionGeneration)
    || typeof record.bootId !== 'string' || !BOOT_ID.test(record.bootId)
    || typeof record.runtimeGeneration !== 'number' || !Number.isSafeInteger(record.runtimeGeneration)
    || record.runtimeGeneration < 1 || typeof record.activeGeneration !== 'string'
    || !GENERATION.test(record.activeGeneration)) return rejected('availability-connection-binding-invalid')
  return parsed({
    schemaVersion: CONNECTION_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    connectionGeneration: record.connectionGeneration,
    bootId: record.bootId,
    runtimeGeneration: record.runtimeGeneration,
    activeGeneration: record.activeGeneration,
  })
}

function parseBody(value: unknown): ParseResult<ExternalCapabilityAvailabilityBodyV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'capabilityId',
    'descriptorDigest',
    'evidenceDigest',
    'host',
    'connection',
    'transportState',
    'discoveryState',
    'contractState',
    'operationPreflightState',
    'observedAt',
    'expiresAt',
  ], ['operationId', 'preflightPortDigest'])
  if (record === undefined) return rejected('availability-invalid')
  if (record.schemaVersion !== AVAILABILITY_SCHEMA_VERSION
    || record.canonicalizationVersion !== CANONICALIZATION_VERSION) return rejected('availability-schema-unsupported')
  if (typeof record.capabilityId !== 'string' || !CAPABILITY_ID.test(record.capabilityId)) {
    return rejected('availability-invalid')
  }
  if (typeof record.descriptorDigest !== 'string' || !DESCRIPTOR_DIGEST.test(record.descriptorDigest)) {
    return rejected('availability-descriptor-unbound')
  }
  if (typeof record.evidenceDigest !== 'string' || !EVIDENCE_DIGEST.test(record.evidenceDigest)) {
    return rejected('availability-evidence-unbound')
  }
  const host = parseHostBinding(record.host)
  if (!host.ok) return host
  const connection = parseConnectionBinding(record.connection)
  if (!connection.ok) return connection
  if (host.value.bootId !== connection.value.bootId
    || host.value.runtimeGeneration !== connection.value.runtimeGeneration
    || host.value.activeGeneration !== connection.value.activeGeneration) {
    return rejected('availability-generation-mismatch')
  }
  if (typeof record.transportState !== 'string' || !TRANSPORT_STATES.includes(record.transportState as ExternalCapabilityTransportStateV1)
    || typeof record.discoveryState !== 'string' || !DISCOVERY_STATES.includes(record.discoveryState as ExternalCapabilityDiscoveryStateV1)
    || typeof record.contractState !== 'string' || !CONTRACT_STATES.includes(record.contractState as ExternalCapabilityContractStateV1)) {
    return rejected('availability-axis-invalid')
  }
  const operationPreflightState = record.operationPreflightState
  if (typeof operationPreflightState !== 'string' || !PREFLIGHT_STATES.includes(operationPreflightState as ExternalCapabilityOperationPreflightStateV1)) {
    return rejected('availability-preflight-invalid')
  }
  const operationId = record.operationId
  const preflightPortDigest = record.preflightPortDigest
  if (operationPreflightState === 'not-requested') {
    if (operationId !== undefined || preflightPortDigest !== undefined) return rejected('availability-preflight-invalid')
  } else {
    if (typeof operationId !== 'string' || !OPERATION_ID.test(operationId)) return rejected('availability-preflight-invalid')
    if (operationPreflightState === 'port-valid') {
      if (typeof preflightPortDigest !== 'string' || !PREFLIGHT_PORT_DIGEST.test(preflightPortDigest)) {
        return rejected('availability-preflight-invalid')
      }
    } else if (preflightPortDigest !== undefined) {
      return rejected('availability-preflight-invalid')
    }
  }
  const observedAt = parseTimestamp(record.observedAt)
  const expiresAt = parseTimestamp(record.expiresAt)
  if (observedAt === undefined || expiresAt === undefined || expiresAt.milliseconds <= observedAt.milliseconds) {
    return rejected('availability-invalid')
  }
  const body: ExternalCapabilityAvailabilityBodyV1 = {
    schemaVersion: AVAILABILITY_SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    capabilityId: record.capabilityId,
    descriptorDigest: record.descriptorDigest,
    evidenceDigest: record.evidenceDigest,
    host: host.value,
    connection: connection.value,
    transportState: record.transportState as ExternalCapabilityTransportStateV1,
    discoveryState: record.discoveryState as ExternalCapabilityDiscoveryStateV1,
    contractState: record.contractState as ExternalCapabilityContractStateV1,
    operationPreflightState: operationPreflightState as ExternalCapabilityOperationPreflightStateV1,
    observedAt: observedAt.text,
    expiresAt: expiresAt.text,
  }
  if (operationId !== undefined) (body as { operationId?: string }).operationId = operationId
  if (preflightPortDigest !== undefined) (body as { preflightPortDigest?: string }).preflightPortDigest = preflightPortDigest
  return parsed(body)
}

function deriveAvailabilityState(body: ExternalCapabilityAvailabilityBodyV1): ExternalCapabilityAvailabilityStateV1 {
  return body.transportState === 'connected'
    && body.discoveryState === 'complete'
    && body.contractState === 'valid'
    ? 'available'
    : 'unavailable'
}

function canonicalSealed(value: Omit<ExternalCapabilityAvailabilityV1, 'availabilityDigest'>): Record<string, unknown> {
  return {
    schemaVersion: value.schemaVersion,
    canonicalizationVersion: value.canonicalizationVersion,
    capabilityId: value.capabilityId,
    descriptorDigest: value.descriptorDigest,
    evidenceDigest: value.evidenceDigest,
    host: value.host,
    connection: value.connection,
    transportState: value.transportState,
    discoveryState: value.discoveryState,
    contractState: value.contractState,
    operationPreflightState: value.operationPreflightState,
    ...(value.operationId === undefined ? {} : { operationId: value.operationId }),
    ...(value.preflightPortDigest === undefined ? {} : { preflightPortDigest: value.preflightPortDigest }),
    observedAt: value.observedAt,
    expiresAt: value.expiresAt,
    availabilityState: value.availabilityState,
    actionability: value.actionability,
  }
}

function parseSealed(value: unknown): ParseResult<ExternalCapabilityAvailabilityV1> {
  const record = exactRecord(value, [
    'schemaVersion',
    'canonicalizationVersion',
    'capabilityId',
    'descriptorDigest',
    'evidenceDigest',
    'host',
    'connection',
    'transportState',
    'discoveryState',
    'contractState',
    'operationPreflightState',
    'observedAt',
    'expiresAt',
    'availabilityState',
    'actionability',
    'availabilityDigest',
  ], ['operationId', 'preflightPortDigest'])
  if (record === undefined) return rejected('availability-invalid')
  const body = parseBody({
    schemaVersion: record.schemaVersion,
    canonicalizationVersion: record.canonicalizationVersion,
    capabilityId: record.capabilityId,
    descriptorDigest: record.descriptorDigest,
    evidenceDigest: record.evidenceDigest,
    host: record.host,
    connection: record.connection,
    transportState: record.transportState,
    discoveryState: record.discoveryState,
    contractState: record.contractState,
    operationPreflightState: record.operationPreflightState,
    ...(record.operationId === undefined ? {} : { operationId: record.operationId }),
    ...(record.preflightPortDigest === undefined ? {} : { preflightPortDigest: record.preflightPortDigest }),
    observedAt: record.observedAt,
    expiresAt: record.expiresAt,
  })
  if (!body.ok) return body
  const availabilityState = deriveAvailabilityState(body.value)
  if (record.availabilityState !== availabilityState || record.actionability !== 'blocked') {
    return rejected('availability-axis-invalid')
  }
  const availabilityDigest = exactString(record.availabilityDigest, AVAILABILITY_DIGEST, 160)
  if (availabilityDigest === undefined) return rejected('availability-invalid')
  const sealed = {
    ...body.value,
    availabilityState,
    actionability: 'blocked' as const,
    availabilityDigest,
  }
  if (availabilityDigest !== digest(canonicalJson(canonicalSealed(sealed)))) {
    return rejected('availability-digest-mismatch')
  }
  return parsed(sealed)
}

export function canonicalizeExternalCapabilityAvailability(value: unknown): string {
  const body = parseBody(value)
  if (!body.ok) throw new TypeError(FAILURE_REASONS[body.code])
  const normalized = {
    ...body.value,
    availabilityState: deriveAvailabilityState(body.value),
    actionability: 'blocked' as const,
  }
  return canonicalJson(canonicalSealed(normalized))
}

export function computeExternalCapabilityAvailabilityDigest(value: unknown): string {
  return digest(canonicalizeExternalCapabilityAvailability(value))
}

export function sealExternalCapabilityAvailability(
  value: unknown,
): ExternalCapabilityAvailabilityResult<ExternalCapabilityAvailabilityV1> {
  const body = parseBody(value)
  if (!body.ok) return failure(body.code)
  const sealedWithoutDigest = {
    ...body.value,
    availabilityState: deriveAvailabilityState(body.value),
    actionability: 'blocked' as const,
  }
  return success({
    ...sealedWithoutDigest,
    availabilityDigest: digest(canonicalJson(canonicalSealed(sealedWithoutDigest))),
  })
}

export function parseExternalCapabilityAvailability(
  value: unknown,
): ExternalCapabilityAvailabilityResult<ExternalCapabilityAvailabilityV1> {
  const result = parseSealed(value)
  return result.ok ? success(result.value) : failure(result.code)
}

export function verifyExternalCapabilityAvailabilityFreshness(
  input: ExternalCapabilityAvailabilityFreshnessInputV1,
): ExternalCapabilityAvailabilityResult<ExternalCapabilityAvailabilityV1> {
  const availability = parseSealed(input.availability)
  if (!availability.ok) return failure(availability.code)
  const evaluatedAt = parseTimestamp(input.evaluatedAt)
  const observedAt = parseTimestamp(availability.value.observedAt)
  const expiresAt = parseTimestamp(availability.value.expiresAt)
  if (evaluatedAt === undefined || observedAt === undefined || expiresAt === undefined) {
    return failure('availability-invalid')
  }
  if (evaluatedAt.milliseconds < observedAt.milliseconds || evaluatedAt.milliseconds >= expiresAt.milliseconds) {
    return failure('availability-expired')
  }
  return success(availability.value)
}

export function createExternalCapabilityAvailabilityKernel(): Readonly<{
  readonly canonicalize: typeof canonicalizeExternalCapabilityAvailability
  readonly computeDigest: typeof computeExternalCapabilityAvailabilityDigest
  readonly seal: typeof sealExternalCapabilityAvailability
  readonly parse: typeof parseExternalCapabilityAvailability
  readonly verifyFreshness: typeof verifyExternalCapabilityAvailabilityFreshness
}> {
  return Object.freeze({
    canonicalize: canonicalizeExternalCapabilityAvailability,
    computeDigest: computeExternalCapabilityAvailabilityDigest,
    seal: sealExternalCapabilityAvailability,
    parse: parseExternalCapabilityAvailability,
    verifyFreshness: verifyExternalCapabilityAvailabilityFreshness,
  })
}
