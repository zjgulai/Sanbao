import { createHash } from 'node:crypto'
import { types as utilTypes } from 'node:util'

import type {
  ExternalCapabilityJsonObject,
  ExternalCapabilityJsonValue,
  ExternalCapabilityProtocolRevision,
} from './external-capability.js'

/**
 * Contract-only invalidation signals. A future bridge-owned adapter may map
 * its lifecycle events to these values; this module does not subscribe to a
 * bridge or create a connection itself.
 */
export type ExternalCapabilityObservationInvalidationReason =
  | 'list-changed'
  | 'transport-closed'
  | 'reconnected'
  | 'disposed'
  | 'pagination-failed'
  | 'limit-exceeded'

export type ExternalCapabilityObservationFailureCode =
  | 'observation-input-invalid'
  | 'observation-source-failed'
  | 'observation-page-invalid'
  | 'observation-cursor-invalid'
  | 'observation-cursor-repeated'
  | 'observation-duplicate-tool-name'
  | 'observation-page-limit-exceeded'
  | 'observation-tool-limit-exceeded'
  | 'observation-byte-limit-exceeded'
  | 'observation-deadline-exceeded'
  | 'observation-invalidated'

export type ExternalCapabilityObservationResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
    readonly ok: false
    readonly code: ExternalCapabilityObservationFailureCode
    readonly reason: string
  }>

/**
 * A raw tool is deliberately JSON-shaped and list-only. There is no
 * executable callback or `tools/call` member in this port.
 */
export interface ExternalCapabilityObservationRawToolV1 {
  readonly name: string
  readonly [key: string]: ExternalCapabilityJsonValue
}

export interface ExternalCapabilityObservationPageV1 {
  readonly tools: readonly ExternalCapabilityObservationRawToolV1[]
  readonly nextCursor?: string
}

export interface ExternalCapabilityObservationConnectionV1 {
  readonly connectionGeneration: string
  readonly negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  readonly serverInfo?: ExternalCapabilityJsonObject
  listToolsPage(cursor?: string): Promise<ExternalCapabilityObservationPageV1>
  onInvalidation(
    listener: (reason: ExternalCapabilityObservationInvalidationReason) => void,
  ): () => void
}

export interface ExternalCapabilityObservationLimitsV1 {
  readonly maxPages: number
  readonly maxTools: number
  readonly maxCanonicalBytes: number
}

export interface ExternalCapabilityObservationInputV1 {
  readonly connection: ExternalCapabilityObservationConnectionV1
  readonly limits: ExternalCapabilityObservationLimitsV1
  /** An injected monotonic-time reading; the collector never reads a clock. */
  readonly now: () => number
  /** An absolute deadline expressed in the same units as `now()`. */
  readonly deadlineAt: number
}

export interface ExternalCapabilityObservationSnapshotV1 {
  readonly schemaVersion: 'sage.external-capability-observation.v1'
  readonly canonicalizationVersion: 'sage.external-capability-observation-canonical-json.v1'
  readonly connectionGeneration: string
  readonly negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  readonly serverInfo?: ExternalCapabilityJsonObject
  readonly pageCount: number
  readonly tools: readonly ExternalCapabilityObservationRawToolV1[]
  readonly canonicalBytes: number
  readonly observationDigest: string
}

const SCHEMA_VERSION = 'sage.external-capability-observation.v1' as const
const CANONICALIZATION_VERSION =
  'sage.external-capability-observation-canonical-json.v1' as const
const OBSERVATION_DIGEST_NAMESPACE = 'external-capability-tools-observation'
const CONNECTION_GENERATION = /^connection:sage\.[a-z0-9][a-z0-9._-]{0,127}$/u
const TOOL_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.:-]{0,127}$/u
const CURSOR = /^[^\s]{1,2048}$/u
const PROTOCOL_REVISIONS: readonly ExternalCapabilityProtocolRevision[] = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
]
const MAX_CALLER_LIMIT = 1_048_576

const FAILURE_REASONS: Readonly<
  Record<ExternalCapabilityObservationFailureCode, string>
> = {
  'observation-input-invalid': 'The observation contract input is invalid.',
  'observation-source-failed': 'The bridge observation source failed.',
  'observation-page-invalid': 'The bridge returned an invalid tools/list page.',
  'observation-cursor-invalid': 'The bridge returned an invalid opaque cursor.',
  'observation-cursor-repeated': 'The bridge repeated an opaque cursor.',
  'observation-duplicate-tool-name': 'The observation contains a duplicate raw tool name.',
  'observation-page-limit-exceeded': 'The observation page limit was exceeded.',
  'observation-tool-limit-exceeded': 'The observation tool limit was exceeded.',
  'observation-byte-limit-exceeded': 'The observation byte limit was exceeded.',
  'observation-deadline-exceeded': 'The observation deadline was exceeded.',
  'observation-invalidated': 'The observation was invalidated before completion.',
}

interface PlainRecordSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly keys: readonly string[]
}

type PageParseResult =
  | Readonly<{ readonly ok: true; readonly value: ExternalCapabilityObservationPageV1 }>
  | Readonly<{
    readonly ok: false
    readonly code: 'observation-page-invalid' | 'observation-cursor-invalid'
  }>

interface ObservationFacts {
  readonly connectionGeneration: string
  readonly negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
  readonly serverInfo?: ExternalCapabilityJsonObject
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value
  }
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor !== undefined && Object.hasOwn(descriptor, 'value')) {
      freezeDeep(descriptor.value)
    }
  }
  return Object.freeze(value)
}

function success<T>(value: T): ExternalCapabilityObservationResult<T> {
  return Object.freeze({ ok: true as const, value: freezeDeep(value) })
}

function failure<T>(
  code: ExternalCapabilityObservationFailureCode,
): ExternalCapabilityObservationResult<T> {
  return Object.freeze({
    ok: false as const,
    code,
    reason: FAILURE_REASONS[code],
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
      names.push(key)
      values[key] = descriptor.value
    }
    return { values, keys: names }
  } catch {
    return undefined
  }
}

function isJsonValue(value: unknown, seen = new WeakSet<object>()): value is ExternalCapabilityJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || utilTypes.isProxy(value)) return false
  if (seen.has(value)) return false
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return value.every((member) => isJsonValue(member, seen))
    }
    const record = inspectPlainRecord(value)
    return record !== undefined && record.keys.every((key) => isJsonValue(record.values[key], seen))
  } finally {
    seen.delete(value)
  }
}

function canonicalJson(value: ExternalCapabilityJsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((member) => canonicalJson(member)).join(',')}]`
  }
  if (typeof value !== 'object' || value === null) {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) throw new TypeError('Canonical JSON value is invalid.')
    return encoded
  }
  const record = inspectPlainRecord(value)
  if (record === undefined) throw new TypeError('Canonical JSON record is invalid.')
  return `{${[...record.keys]
    .sort(compareCodeUnits)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record.values[key] as ExternalCapabilityJsonValue)}`)
    .join(',')}}`
}

function isSafeLimit(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CALLER_LIMIT
}

function validateConnection(
  value: unknown,
): value is ExternalCapabilityObservationConnectionV1 {
  if (typeof value !== 'object' || value === null || utilTypes.isProxy(value)) {
    return false
  }
  const connection = value as Partial<ExternalCapabilityObservationConnectionV1>
  return (
    typeof connection.connectionGeneration === 'string' &&
    CONNECTION_GENERATION.test(connection.connectionGeneration) &&
    typeof connection.negotiatedProtocolRevision === 'string' &&
    PROTOCOL_REVISIONS.includes(connection.negotiatedProtocolRevision) &&
    (connection.serverInfo === undefined ||
      (isJsonValue(connection.serverInfo) && !Array.isArray(connection.serverInfo))) &&
    typeof connection.listToolsPage === 'function' &&
    typeof connection.onInvalidation === 'function'
  )
}

function validateInput(
  value: ExternalCapabilityObservationInputV1,
): boolean {
  if (
    typeof value !== 'object' ||
    value === null ||
    utilTypes.isProxy(value) ||
    !validateConnection(value.connection) ||
    typeof value.now !== 'function' ||
    typeof value.deadlineAt !== 'number' ||
    !Number.isFinite(value.deadlineAt) ||
    !Number.isSafeInteger(value.deadlineAt) ||
    value.deadlineAt < 0
  ) {
    return false
  }
  const limits = value.limits
  return (
    typeof limits === 'object' &&
    limits !== null &&
    !utilTypes.isProxy(limits) &&
    isSafeLimit(limits.maxPages) &&
    isSafeLimit(limits.maxTools) &&
    isSafeLimit(limits.maxCanonicalBytes)
  )
}

function parseRawTool(value: unknown): ExternalCapabilityObservationRawToolV1 | undefined {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('name')) return undefined
  const name = record.values.name
  if (typeof name !== 'string' || !TOOL_NAME.test(name)) return undefined
  if (!record.keys.every((key) => isJsonValue(record.values[key]))) return undefined
  return value as ExternalCapabilityObservationRawToolV1
}

function parsePage(value: unknown): PageParseResult {
  const record = inspectPlainRecord(value)
  if (record === undefined || !record.keys.includes('tools')) {
    return { ok: false, code: 'observation-page-invalid' }
  }
  if (record.keys.some((key) => key !== 'tools' && key !== 'nextCursor')) {
    return { ok: false, code: 'observation-page-invalid' }
  }
  if (!Array.isArray(record.values.tools)) {
    return { ok: false, code: 'observation-page-invalid' }
  }
  const tools: ExternalCapabilityObservationRawToolV1[] = []
  for (const candidate of record.values.tools) {
    const tool = parseRawTool(candidate)
    if (tool === undefined) return { ok: false, code: 'observation-page-invalid' }
    tools.push(tool)
  }
  if (!record.keys.includes('nextCursor')) return { ok: true, value: { tools } }
  const nextCursor = record.values.nextCursor
  if (typeof nextCursor !== 'string' || !CURSOR.test(nextCursor)) {
    return { ok: false, code: 'observation-cursor-invalid' }
  }
  return { ok: true, value: { tools, nextCursor } }
}

function readObservationFacts(
  connection: ExternalCapabilityObservationConnectionV1,
): ObservationFacts {
  const facts: {
    connectionGeneration: string
    negotiatedProtocolRevision: ExternalCapabilityProtocolRevision
    serverInfo?: ExternalCapabilityJsonObject
  } = {
    connectionGeneration: connection.connectionGeneration,
    negotiatedProtocolRevision: connection.negotiatedProtocolRevision,
  }
  if (connection.serverInfo !== undefined) {
    facts.serverInfo = JSON.parse(canonicalJson(connection.serverInfo)) as ExternalCapabilityJsonObject
  }
  return facts
}

function connectionFactsDrifted(
  connection: ExternalCapabilityObservationConnectionV1,
  facts: ObservationFacts,
): boolean {
  return (
    connection.connectionGeneration !== facts.connectionGeneration ||
    connection.negotiatedProtocolRevision !== facts.negotiatedProtocolRevision
  )
}

function canonicalBody(
  facts: ObservationFacts,
  tools: readonly ExternalCapabilityObservationRawToolV1[],
  pageCount: number,
): ExternalCapabilityJsonObject {
  const body: Record<string, ExternalCapabilityJsonValue> = {
    schemaVersion: SCHEMA_VERSION,
    canonicalizationVersion: CANONICALIZATION_VERSION,
    connectionGeneration: facts.connectionGeneration,
    negotiatedProtocolRevision: facts.negotiatedProtocolRevision,
    pageCount,
    tools,
  }
  if (facts.serverInfo !== undefined) body.serverInfo = facts.serverInfo
  return body
}

function digest(canonical: string): string {
  return `urn:sage:${OBSERVATION_DIGEST_NAMESPACE}:sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

function deadlineReached(now: () => number, deadlineAt: number): boolean {
  try {
    const reading = now()
    return !Number.isFinite(reading) || reading >= deadlineAt
  } catch {
    return true
  }
}

/**
 * Collects a bounded raw `tools/list` observation from a future bridge-owned
 * port. This is deliberately not a provider: it has no bridge import, no
 * transport, no filesystem/network access, no clock access, and no call port.
 */
export async function collectExternalCapabilityObservation(
  input: ExternalCapabilityObservationInputV1,
): Promise<ExternalCapabilityObservationResult<ExternalCapabilityObservationSnapshotV1>> {
  if (!validateInput(input)) return failure('observation-input-invalid')

  const { connection, limits, now, deadlineAt } = input
  let facts: ObservationFacts
  try {
    facts = readObservationFacts(connection)
  } catch {
    return failure('observation-input-invalid')
  }
  let invalidated = false
  let unsubscribe: (() => void) | undefined
  try {
    try {
      unsubscribe = connection.onInvalidation(() => {
        invalidated = true
      })
    } catch {
      return failure('observation-input-invalid')
    }
    if (typeof unsubscribe !== 'function') return failure('observation-input-invalid')

    const tools: ExternalCapabilityObservationRawToolV1[] = []
    const names = new Set<string>()
    const cursors = new Set<string>()
    let cursor: string | undefined
    let pageCount = 0

    while (true) {
      if (invalidated) return failure('observation-invalidated')
      if (deadlineReached(now, deadlineAt)) return failure('observation-deadline-exceeded')
      if (pageCount >= limits.maxPages) return failure('observation-page-limit-exceeded')

      let pageValue: unknown
      try {
        pageValue = cursor === undefined
          ? await connection.listToolsPage()
          : await connection.listToolsPage(cursor)
      } catch {
        return failure('observation-source-failed')
      }
      if (invalidated) return failure('observation-invalidated')
      if (connectionFactsDrifted(connection, facts)) return failure('observation-invalidated')
      if (deadlineReached(now, deadlineAt)) return failure('observation-deadline-exceeded')

      const parsedPage = parsePage(pageValue)
      if (!parsedPage.ok) return failure(parsedPage.code)
      const page = parsedPage.value
      pageCount += 1
      for (const tool of page.tools) {
        if (names.has(tool.name)) return failure('observation-duplicate-tool-name')
        names.add(tool.name)
        tools.push(tool)
      }
      if (tools.length > limits.maxTools) return failure('observation-tool-limit-exceeded')

      const partialCanonical = canonicalJson(canonicalBody(facts, tools, pageCount))
      if (Buffer.byteLength(partialCanonical, 'utf8') > limits.maxCanonicalBytes) {
        return failure('observation-byte-limit-exceeded')
      }

      if (page.nextCursor === undefined) break
      if (pageCount >= limits.maxPages) return failure('observation-page-limit-exceeded')
      if (cursors.has(page.nextCursor)) return failure('observation-cursor-repeated')
      cursors.add(page.nextCursor)
      cursor = page.nextCursor
    }

    if (invalidated) return failure('observation-invalidated')
    if (connectionFactsDrifted(connection, facts)) return failure('observation-invalidated')
    const canonical = canonicalJson(canonicalBody(facts, tools, pageCount))
    const canonicalBytes = Buffer.byteLength(canonical, 'utf8')
    const snapshot = JSON.parse(canonical) as Omit<ExternalCapabilityObservationSnapshotV1, 'observationDigest' | 'canonicalBytes'>
    return success({
      ...snapshot,
      canonicalBytes,
      observationDigest: digest(canonical),
    })
  } finally {
    try {
      unsubscribe?.()
    } catch {
      // Invalidation cleanup is best effort after the snapshot has failed closed.
    }
  }
}
