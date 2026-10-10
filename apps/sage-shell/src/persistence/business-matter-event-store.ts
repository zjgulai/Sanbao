import { createHash } from 'node:crypto'
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  type BigIntStats,
} from 'node:fs'
import { userInfo } from 'node:os'
import { isAbsolute, join, parse, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  BusinessMatter,
  BusinessMatterErrorCode,
} from '../domain/business-matter.js'
import {
  BusinessMatterCodecError,
  rehydrateBusinessMatter,
  type BusinessMatterCodecErrorCode,
  type BusinessMatterEventEnvelope,
} from '../domain/business-matter-codec.js'
import {
  assertSageRootIsolatedFromLegacyDsh,
  resolveSagePaths,
  type SagePaths,
} from '../profile/paths.js'
import {
  createCompatibilityEvaluationEvidenceExport,
  makeCompatibilityEvaluationEvidenceOperationReceipt,
  parseCompatibilityEvaluationEvidenceExportForRestore,
  parsePersistedCompatibilityEvaluationEvidence,
  prepareCompatibilityEvaluationEvidence,
  isCompatibilityEvaluationEvidenceLifecycleState,
  type CompatibilityEvaluationEvidenceExportV1,
  type CompatibilityEvaluationEvidencePersistenceInputV1,
  type CompatibilityEvaluationEvidencePortV1,
  type CompatibilityEvaluationEvidenceRecordV1,
  type PreparedCompatibilityEvaluationEvidenceV1,
  type CompatibilityEvaluationEvidenceOperationResultV1,
  isCompatibilityEvaluationEvidenceOperationId,
  type CompatibilityEvaluationEvidenceRestoreResultV1,
  type CompatibilityEvaluationEvidenceLifecycleResultV1,
  type CompatibilityEvaluationEvidencePurgeResultV1,
  type CompatibilityEvaluationEvidenceLoadResultV1,
} from './compatibility-evaluation-evidence-store.js'
import type { CompatibilityEvaluationEvidenceLifecycleStateV1 } from '../security/compatibility-evaluation-evidence.js'

export const BUSINESS_MATTER_STORE_APPLICATION_ID = 0x53414745
export const BUSINESS_MATTER_STORE_USER_VERSION = 1
export const BUSINESS_MATTER_STORE_FILENAME = 'business-matter-v1.sqlite3'
export const BUSINESS_MATTER_STORE_RELATIVE_DIRECTORY =
  join('data', 'business-matter')

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const MAX_SQLITE_TIMEOUT_MS = 0x7fffffff
const DIGEST_BYTES = 32
const REQUEST_FINGERPRINT_DOMAIN =
  'sage/business-matter/append-request-fingerprint/v1'
const COMMITTED_EVENT_DIGEST_DOMAIN =
  'sage/business-matter/committed-event-digest/v1'

export type BusinessMatterEventStoreErrorCode =
  | 'capability-unavailable'
  | 'invalid-clock'
  | 'invalid-config'
  | 'io-unavailable'
  | 'schema-mismatch'
  | 'storage-boundary-violation'
  | 'storage-busy'
  | 'store-closed'

export type BusinessMatterStorageBoundaryReason =
  | 'hard-linked-file'
  | 'non-canonical-root'
  | 'not-directory'
  | 'not-regular-file'
  | 'path-replaced'
  | 'symbolic-link'
  | 'unsafe-mode'
  | 'untrusted-sidecar'
  | 'wrong-owner'

export class BusinessMatterEventStoreError extends Error {
  readonly code: BusinessMatterEventStoreErrorCode
  readonly reason: BusinessMatterStorageBoundaryReason | undefined

  constructor(
    code: BusinessMatterEventStoreErrorCode,
    message: string,
    reason?: BusinessMatterStorageBoundaryReason,
  ) {
    super(message)
    this.name = 'BusinessMatterEventStoreError'
    this.code = code
    this.reason = reason
  }
}

export interface BusinessMatterEventStoreDiagnostic {
  readonly eventIndex?: number
  readonly streamVersion?: number
  readonly eventId?: string
  readonly field?: string
  readonly domainCode?: BusinessMatterErrorCode
  readonly actual?: number
  readonly limit?: number
}

export type EncodedNewBusinessMatterEvent = Omit<
  BusinessMatterEventEnvelope,
  'streamVersion'
>

export type ExpectedVersion =
  | { readonly kind: 'not-exists' }
  | { readonly kind: 'exact'; readonly value: number }

export interface AppendRequest {
  readonly matterId: string
  readonly expectedVersion: ExpectedVersion
  readonly appendId: string
  readonly events: readonly EncodedNewBusinessMatterEvent[]
}

export interface CommittedBusinessMatterEvent
  extends EncodedNewBusinessMatterEvent {
  readonly streamVersion: number
  readonly recordedAt: string
  readonly previousDigest: Uint8Array | null
}

export type BusinessMatterLoadResult =
  | { readonly kind: 'not-found' }
  | {
      readonly kind: 'loaded'
      readonly version: number
      readonly matter: BusinessMatter
    }
  | {
      readonly kind: 'blocked'
      readonly reason:
        | 'corrupt'
        | 'unsupported-schema'
        | 'stream-too-large'
        | 'payload-too-large'
        | 'key-unavailable'
        | 'io-unavailable'
      readonly diagnostic?: BusinessMatterEventStoreDiagnostic
    }

export type AppendInvalidRequestReason =
  | BusinessMatterCodecErrorCode
  | 'empty-events'
  | 'invalid-append-id'
  | 'invalid-expected-version'
  | 'invalid-matter-id'
  | 'payload-too-large'
  | 'stream-too-large'

export type BusinessMatterAppendResult =
  | {
      readonly kind: 'appended' | 'replayed'
      readonly firstVersion: number
      readonly lastVersion: number
    }
  | {
      readonly kind: 'version-conflict'
      readonly actualVersion: number | null
    }
  | { readonly kind: 'idempotency-conflict' }
  | { readonly kind: 'duplicate-event-id' }
  | { readonly kind: 'storage-busy' }
  | { readonly kind: 'commit-unknown' }
  | {
      readonly kind: 'invalid-request'
      readonly reason: AppendInvalidRequestReason
      readonly diagnostic?: BusinessMatterEventStoreDiagnostic
    }
  | {
      readonly kind: 'blocked'
      readonly reason:
        | 'corrupt'
        | 'unsupported-schema'
        | 'stream-too-large'
        | 'payload-too-large'
        | 'compatibility-evidence-unavailable'
        | 'io-unavailable'
      readonly diagnostic?: BusinessMatterEventStoreDiagnostic
    }

export interface BusinessMatterEventStoreCapabilities {
  readonly runtime: {
    readonly electron: string
    readonly node: string
    readonly sqlite: string
  }
  readonly schema: {
    readonly applicationId: number
    readonly userVersion: number
  }
  readonly pragmas: {
    readonly journalMode: 'delete'
    readonly synchronous: 3
    readonly foreignKeys: 1
    readonly trustedSchema: 0
    readonly fullfsync: 1
    readonly busyTimeoutMs: number
  }
  readonly security: {
    readonly defensive: true
    readonly extensionLoading: false
  }
  readonly limits: {
    readonly maxStreamEvents: number
    readonly maxPayloadBytes: number
  }
}

export interface BusinessMatterEventStore {
  readonly capabilities: BusinessMatterEventStoreCapabilities
  readonly compatibilityEvaluationEvidence: CompatibilityEvaluationEvidencePortV1
  load(matterId: string): BusinessMatterLoadResult
  readRevisionDigest(matterId: string, revisionId: string): string | undefined
  append(request: AppendRequest): BusinessMatterAppendResult
  appendWithCompatibilityEvidence(
    request: AppendRequest,
    evidence: CompatibilityEvaluationEvidencePersistenceInputV1,
  ): BusinessMatterAppendResult
  close(): void
}

export interface OpenBusinessMatterEventStoreOptions {
  /**
   * Sage-owned filesystem identity resolved by the shell boundary.
   *
   * The adapter never accepts a database pathname, URI, or arbitrary storage
   * directory. It derives data/business-matter and the only database filename
   * from this identity.
   */
  readonly sagePaths: SagePaths
  readonly maxStreamEvents: number
  readonly maxPayloadBytes: number
  readonly busyTimeoutMs: number
  readonly clock: () => string
}

interface NormalizedOpenBusinessMatterEventStoreOptions {
  readonly sageHome: string
  readonly sagePlatform: NodeJS.Platform
  readonly sageRoot: string
  readonly maxStreamEvents: number
  readonly maxPayloadBytes: number
  readonly busyTimeoutMs: number
  readonly clock: () => string
}

interface FileIdentity {
  readonly dev: bigint
  readonly ino: bigint
}

type DatabasePreparationDisposition =
  | 'created'
  | 'creation-raced'
  | 'existing'

interface PreparedDatabaseFile {
  readonly identity: FileIdentity
  readonly disposition: DatabasePreparationDisposition
}

interface PreparedBusinessMatterStorage {
  readonly sageRoot: string
  readonly sageRootIdentity: FileIdentity
  readonly storageRoot: string
  readonly databasePath: string
  readonly rootIdentity: FileIdentity
  readonly databaseIdentity: FileIdentity
  readonly effectiveUid: number
  readonly databaseDisposition: DatabasePreparationDisposition
}

interface RuntimeDatabase extends DatabaseSync {
  enableDefensive(active: boolean): void
  readonly limits: {
    readonly length: number
  }
}

interface SchemaObject {
  readonly type: string
  readonly name: string
  readonly tableName: string
  readonly sql: string
}

const CREATE_STREAMS_SQL = `
  CREATE TABLE business_matter_streams (
    matter_id TEXT NOT NULL PRIMARY KEY,
    current_version INTEGER NOT NULL
      CHECK (current_version BETWEEN 1 AND 9007199254740991),
    head_digest BLOB NOT NULL CHECK (length(head_digest) = 32),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
  ) STRICT
`

const CREATE_EVENTS_SQL = `
  CREATE TABLE business_matter_events (
    matter_id TEXT NOT NULL,
    stream_version INTEGER NOT NULL
      CHECK (stream_version BETWEEN 1 AND 9007199254740991),
    event_id TEXT NOT NULL CHECK (length(event_id) > 0),
    event_type TEXT NOT NULL CHECK (length(event_type) > 0),
    event_schema_version INTEGER NOT NULL
      CHECK (event_schema_version BETWEEN 1 AND 9007199254740991),
    occurred_at TEXT NOT NULL CHECK (length(occurred_at) > 0),
    recorded_at TEXT NOT NULL CHECK (length(recorded_at) > 0),
    payload_bytes BLOB NOT NULL CHECK (length(payload_bytes) > 0),
    previous_digest BLOB,
    event_digest BLOB NOT NULL CHECK (length(event_digest) = 32),
    PRIMARY KEY (matter_id, stream_version),
    FOREIGN KEY (matter_id)
      REFERENCES business_matter_streams(matter_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    CHECK (
      (stream_version = 1 AND previous_digest IS NULL)
      OR
      (stream_version > 1 AND previous_digest IS NOT NULL
        AND length(previous_digest) = 32)
    )
  ) STRICT
`

const CREATE_EVENT_ID_INDEX_SQL = `
  CREATE UNIQUE INDEX business_matter_events_event_id_uq
    ON business_matter_events(matter_id, event_id)
`

const CREATE_APPENDS_SQL = `
  CREATE TABLE business_matter_appends (
    matter_id TEXT NOT NULL,
    append_id TEXT NOT NULL CHECK (length(append_id) > 0),
    request_fingerprint BLOB NOT NULL
      CHECK (length(request_fingerprint) = 32),
    first_version INTEGER NOT NULL
      CHECK (first_version BETWEEN 1 AND 9007199254740991),
    last_version INTEGER NOT NULL
      CHECK (last_version BETWEEN first_version AND 9007199254740991),
    committed_at TEXT NOT NULL CHECK (length(committed_at) > 0),
    PRIMARY KEY (matter_id, append_id),
    FOREIGN KEY (matter_id)
      REFERENCES business_matter_streams(matter_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (matter_id, first_version)
      REFERENCES business_matter_events(matter_id, stream_version)
      ON UPDATE RESTRICT ON DELETE RESTRICT,
    FOREIGN KEY (matter_id, last_version)
      REFERENCES business_matter_events(matter_id, stream_version)
      ON UPDATE RESTRICT ON DELETE RESTRICT
  ) STRICT
`

const CREATE_COMPATIBILITY_EVIDENCE_SQL = `
  CREATE TABLE compatibility_evaluation_evidence (
    evaluation_id TEXT NOT NULL PRIMARY KEY,
    attempt_id TEXT NOT NULL CHECK (length(attempt_id) > 0),
    matter_id TEXT NOT NULL CHECK (length(matter_id) > 0),
    revision_id TEXT NOT NULL CHECK (length(revision_id) > 0),
    evidence_digest TEXT NOT NULL UNIQUE CHECK (length(evidence_digest) > 0),
    evidence_bytes TEXT NOT NULL CHECK (
      length(evidence_bytes) > 0 OR lifecycle_state = 'purged'
    ),
    matrix_id TEXT NOT NULL CHECK (length(matrix_id) > 0),
    artifact_reference TEXT NOT NULL CHECK (length(artifact_reference) > 0),
    matrix_bytes TEXT NOT NULL CHECK (
      length(matrix_bytes) > 0 OR lifecycle_state = 'purged'
    ),
    revocation_source_id TEXT NOT NULL CHECK (length(revocation_source_id) > 0),
    revocation_source_bytes TEXT NOT NULL CHECK (
      length(revocation_source_bytes) > 0 OR lifecycle_state = 'purged'
    ),
    lifecycle_state TEXT NOT NULL CHECK (
      lifecycle_state IN (
        'active',
        'retention-expired',
        'legal-hold',
        'deletion-pending',
        'purged'
      )
    ),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    updated_at TEXT NOT NULL CHECK (length(updated_at) > 0)
  ) STRICT
`

const CREATE_COMPATIBILITY_RECEIPTS_SQL = `
  CREATE TABLE compatibility_evaluation_operation_receipts (
    operation_id TEXT NOT NULL PRIMARY KEY,
    evaluation_id TEXT NOT NULL CHECK (length(evaluation_id) > 0),
    operation_type TEXT NOT NULL CHECK (
      operation_type IN ('export', 'restore', 'transition', 'purge', 'recovery')
    ),
    receipt_bytes TEXT NOT NULL CHECK (length(receipt_bytes) > 0),
    created_at TEXT NOT NULL CHECK (length(created_at) > 0),
    FOREIGN KEY (evaluation_id)
      REFERENCES compatibility_evaluation_evidence(evaluation_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT
  ) STRICT
`

const SCHEMA_OBJECTS: readonly SchemaObject[] = [
  {
    type: 'index',
    name: 'business_matter_events_event_id_uq',
    tableName: 'business_matter_events',
    sql: CREATE_EVENT_ID_INDEX_SQL,
  },
  {
    type: 'table',
    name: 'business_matter_appends',
    tableName: 'business_matter_appends',
    sql: CREATE_APPENDS_SQL,
  },
  {
    type: 'table',
    name: 'business_matter_events',
    tableName: 'business_matter_events',
    sql: CREATE_EVENTS_SQL,
  },
  {
    type: 'table',
    name: 'business_matter_streams',
    tableName: 'business_matter_streams',
    sql: CREATE_STREAMS_SQL,
  },
  {
    type: 'table',
    name: 'compatibility_evaluation_evidence',
    tableName: 'compatibility_evaluation_evidence',
    sql: CREATE_COMPATIBILITY_EVIDENCE_SQL,
  },
  {
    type: 'table',
    name: 'compatibility_evaluation_operation_receipts',
    tableName: 'compatibility_evaluation_operation_receipts',
    sql: CREATE_COMPATIBILITY_RECEIPTS_SQL,
  },
]

const LEGACY_SCHEMA_OBJECTS = SCHEMA_OBJECTS.filter(
  (object) => object.name.startsWith('business_matter_'),
)

const ISO_UTC_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u

function isValidIsoUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_TIMESTAMP.test(value)) return false
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return false
  const normalized = value.includes('.') ? value : value.replace(/Z$/u, '.000Z')
  return new Date(timestamp).toISOString() === normalized
}

function isNonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function u64(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Framed integers must be non-negative safe integers.')
  }
  const bytes = Buffer.allocUnsafe(8)
  bytes.writeBigUInt64BE(BigInt(value))
  return bytes
}

function updateRaw(hash: ReturnType<typeof createHash>, bytes: Uint8Array): void {
  hash.update(u64(bytes.byteLength))
  hash.update(bytes)
}

function updateText(hash: ReturnType<typeof createHash>, value: string): void {
  updateRaw(hash, new TextEncoder().encode(value))
}

function updateNumber(hash: ReturnType<typeof createHash>, value: number): void {
  hash.update(u64(value))
}

export function computeBusinessMatterAppendRequestFingerprint(
  request: AppendRequest,
): Uint8Array {
  const hash = createHash('sha256')
  updateText(hash, REQUEST_FINGERPRINT_DOMAIN)
  updateText(hash, request.matterId)
  updateText(hash, request.expectedVersion.kind)
  if (request.expectedVersion.kind === 'exact') {
    updateNumber(hash, request.expectedVersion.value)
  }
  updateNumber(hash, request.events.length)
  for (const event of request.events) {
    updateText(hash, event.eventId)
    updateText(hash, event.eventType)
    updateNumber(hash, event.eventSchemaVersion)
    updateText(hash, event.occurredAt)
    updateRaw(hash, event.payloadBytes)
  }
  return new Uint8Array(hash.digest())
}

export function computeBusinessMatterCommittedEventDigest(
  event: CommittedBusinessMatterEvent,
): Uint8Array {
  const hash = createHash('sha256')
  updateText(hash, COMMITTED_EVENT_DIGEST_DOMAIN)
  updateText(hash, event.matterId)
  updateNumber(hash, event.streamVersion)
  updateText(hash, event.eventId)
  updateText(hash, event.eventType)
  updateNumber(hash, event.eventSchemaVersion)
  updateText(hash, event.occurredAt)
  updateText(hash, event.recordedAt)
  updateRaw(hash, event.payloadBytes)
  updateRaw(hash, event.previousDigest ?? new Uint8Array())
  return new Uint8Array(hash.digest())
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index])
}

function normalizeSchemaSql(sql: string): string {
  return sql
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(/\s*([(),])\s*/gu, '$1')
}

function exactDataRecord(
  input: unknown,
  expectedKeys: readonly string[],
): Record<string, unknown> | undefined {
  try {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return undefined
    }
    const keys = Reflect.ownKeys(input)
    const expected = new Set(expectedKeys)
    if (
      keys.length !== expected.size
      || keys.some((key) => typeof key !== 'string' || !expected.has(key))
    ) {
      return undefined
    }
    const descriptors = Object.getOwnPropertyDescriptors(input)
    const values: Record<string, unknown> = {}
    for (const key of expectedKeys) {
      const descriptor = descriptors[key]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        return undefined
      }
      values[key] = descriptor.value
    }
    return values
  } catch {
    return undefined
  }
}

function dataArrayLength(input: unknown): number | undefined {
  try {
    if (!Array.isArray(input)) return undefined
    const descriptor = Object.getOwnPropertyDescriptor(input, 'length')
    if (
      descriptor === undefined
      || !Object.hasOwn(descriptor, 'value')
      || !Number.isSafeInteger(descriptor.value)
      || (descriptor.value as number) < 0
    ) {
      return undefined
    }
    return descriptor.value as number
  } catch {
    return undefined
  }
}

function dataArrayValueAt(
  input: unknown,
  index: number,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index))
    return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
      ? { ok: true, value: descriptor.value }
      : { ok: false }
  } catch {
    return { ok: false }
  }
}

function snapshotDenseDataArray(
  input: unknown,
  expectedLength: number,
): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(input)) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(input) as unknown as Record<
      PropertyKey,
      PropertyDescriptor
    >
    const lengthDescriptor = descriptors.length
    if (
      lengthDescriptor === undefined
      || !Object.hasOwn(lengthDescriptor, 'value')
      || lengthDescriptor.value !== expectedLength
      || Reflect.ownKeys(descriptors).length !== expectedLength + 1
    ) {
      return undefined
    }
    const values: unknown[] = []
    for (let index = 0; index < expectedLength; index += 1) {
      const descriptor = descriptors[String(index)]
      if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
        return undefined
      }
      values.push(descriptor.value)
    }
    return values
  } catch {
    return undefined
  }
}

function copyBytes(input: unknown): Uint8Array | undefined {
  try {
    if (!(input instanceof Uint8Array) || Object.hasOwn(input, 'slice')) {
      return undefined
    }
    return new Uint8Array(input)
  } catch {
    return undefined
  }
}

function codecDiagnostic(
  error: BusinessMatterCodecError,
): BusinessMatterEventStoreDiagnostic {
  return {
    ...(error.eventIndex === undefined ? {} : { eventIndex: error.eventIndex }),
    ...(error.streamVersion === undefined
      ? {}
      : { streamVersion: error.streamVersion }),
    ...(error.eventId === undefined ? {} : { eventId: error.eventId }),
    ...(error.field === undefined ? {} : { field: error.field }),
    ...(error.domainCode === undefined ? {} : { domainCode: error.domainCode }),
  }
}

interface SqliteErrorShape {
  readonly code?: unknown
  readonly errcode?: unknown
  readonly message?: unknown
}

function sqlitePrimaryCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const errcode = (error as SqliteErrorShape).errcode
  if (typeof errcode !== 'number' || !Number.isInteger(errcode)) return undefined
  return errcode & 0xff
}

function sqliteMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const message = (error as SqliteErrorShape).message
  return typeof message === 'string' ? message : ''
}

function isSqliteBusy(error: unknown): boolean {
  const code = sqlitePrimaryCode(error)
  return code === 5 || code === 6
}

function isSqliteCorrupt(error: unknown): boolean {
  const code = sqlitePrimaryCode(error)
  return code === 11 || code === 17 || code === 20 || code === 26
}

function isDuplicateEventConstraint(error: unknown): boolean {
  return sqlitePrimaryCode(error) === 19
    && sqliteMessage(error).includes(
      'business_matter_events.matter_id, business_matter_events.event_id',
    )
}

function scalar(
  database: DatabaseSync,
  sql: string,
  key: string,
): unknown {
  return database.prepare(sql).get()?.[key]
}

function readSchemaObjects(database: DatabaseSync): readonly SchemaObject[] {
  const rows = database.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `).all()
  const objects: SchemaObject[] = []
  for (const row of rows) {
    if (
      typeof row.type !== 'string'
      || typeof row.name !== 'string'
      || typeof row.tbl_name !== 'string'
      || typeof row.sql !== 'string'
    ) {
      throw new BusinessMatterEventStoreError(
        'schema-mismatch',
        'The database schema contains an unreadable object.',
      )
    }
    objects.push({
      type: row.type,
      name: row.name,
      tableName: row.tbl_name,
      sql: row.sql,
    })
  }
  return objects
}

function schemaMatches(
  objects: readonly SchemaObject[],
  expectedObjects: readonly SchemaObject[] = SCHEMA_OBJECTS,
): boolean {
  if (objects.length !== expectedObjects.length) return false
  return objects.every((object, index) => {
    const expected = expectedObjects[index]
    return expected !== undefined
      && object.type === expected.type
      && object.name === expected.name
      && object.tableName === expected.tableName
      && normalizeSchemaSql(object.sql) === normalizeSchemaSql(expected.sql)
  })
}

function schemaMatchesLegacy(objects: readonly SchemaObject[]): boolean {
  return schemaMatches(objects, LEGACY_SCHEMA_OBJECTS)
}

function runtimeDatabase(database: DatabaseSync): RuntimeDatabase {
  const candidate = database as DatabaseSync & {
    readonly enableDefensive?: unknown
    readonly limits?: unknown
  }
  if (
    typeof candidate.enableDefensive !== 'function'
    || typeof candidate.limits !== 'object'
    || candidate.limits === null
    || typeof (candidate.limits as { readonly length?: unknown }).length !== 'number'
  ) {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The pinned node:sqlite defensive and limits APIs are unavailable.',
    )
  }
  return database as RuntimeDatabase
}

function snapshotOpenOptions(
  input: OpenBusinessMatterEventStoreOptions,
): NormalizedOpenBusinessMatterEventStoreOptions {
  try {
    const sagePaths = input.sagePaths
    const sageHome = sagePaths.home
    const sagePlatform = sagePaths.platform
    const sageRoot = sagePaths.root
    const maxStreamEvents = input.maxStreamEvents
    const maxPayloadBytes = input.maxPayloadBytes
    const busyTimeoutMs = input.busyTimeoutMs
    const clock = input.clock
    return {
      sageHome,
      sagePlatform,
      sageRoot,
      maxStreamEvents,
      maxPayloadBytes,
      busyTimeoutMs,
      clock,
    }
  } catch {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'The store options could not be read safely.',
    )
  }
}

function assertOpenOptions(
  options: NormalizedOpenBusinessMatterEventStoreOptions,
): void {
  if (
    !isNonBlank(options.sageHome)
    || options.sageHome.includes('\u0000')
    || !isAbsolute(options.sageHome)
    || !isNonBlank(options.sageRoot)
    || options.sageRoot.includes('\u0000')
    || !isAbsolute(options.sageRoot)
  ) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'sagePaths must contain nonempty absolute home and root paths.',
    )
  }
  const normalizedHome = resolve(options.sageHome)
  const normalizedRoot = resolve(options.sageRoot)
  if (normalizedRoot === parse(normalizedRoot).root) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'The Sage root must not be a filesystem root.',
    )
  }
  if (
    options.sageHome !== normalizedHome
    || options.sageRoot !== normalizedRoot
  ) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'Sage home and root must already be normalized absolute paths.',
    )
  }
  let physicalHome: string
  try {
    physicalHome = realpathSync(options.sageHome)
  } catch {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'Sage home must resolve to an existing physical directory.',
    )
  }
  let trustedPhysicalHome: string
  try {
    trustedPhysicalHome = realpathSync(userInfo().homedir)
  } catch {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The trusted operating-system home directory could not be resolved.',
    )
  }
  try {
    for (const home of new Set([physicalHome, trustedPhysicalHome])) {
      const sagePaths = resolveSagePaths({
        home,
        root: options.sageRoot,
        platform: options.sagePlatform,
      })
      assertSageRootIsolatedFromLegacyDsh(sagePaths)
    }
  } catch {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'sagePaths does not describe an isolated Sage filesystem root.',
    )
  }
  if (!isPositiveSafeInteger(options.maxStreamEvents)) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'maxStreamEvents must be a positive safe integer.',
    )
  }
  if (!isPositiveSafeInteger(options.maxPayloadBytes)) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'maxPayloadBytes must be a positive safe integer.',
    )
  }
  if (
    !isPositiveSafeInteger(options.busyTimeoutMs)
    || options.busyTimeoutMs > MAX_SQLITE_TIMEOUT_MS
  ) {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'busyTimeoutMs must be a bounded positive integer.',
    )
  }
  if (typeof options.clock !== 'function') {
    throw new BusinessMatterEventStoreError(
      'invalid-config',
      'clock must be a function.',
    )
  }
}

function storageBoundaryViolation(
  reason: BusinessMatterStorageBoundaryReason,
  message: string,
): BusinessMatterEventStoreError {
  return new BusinessMatterEventStoreError(
    'storage-boundary-violation',
    message,
    reason,
  )
}

function ioUnavailable(message: string): BusinessMatterEventStoreError {
  return new BusinessMatterEventStoreError('io-unavailable', message)
}

function fileIdentity(stat: BigIntStats): FileIdentity {
  return { dev: stat.dev, ino: stat.ino }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function permissions(stat: BigIntStats): number {
  return Number(stat.mode & 0o7777n)
}

function effectiveUid(): number {
  const getter = process.geteuid ?? process.getuid
  if (typeof getter !== 'function') {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The BusinessMatter store requires POSIX effective-user identity.',
    )
  }
  return getter.call(process)
}

function assertFilesystemCapabilities(): void {
  if (
    typeof fsConstants.O_DIRECTORY !== 'number'
    || typeof fsConstants.O_NOFOLLOW !== 'number'
  ) {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The BusinessMatter store requires O_DIRECTORY and O_NOFOLLOW.',
    )
  }
}

function lstatIfPresent(path: string): BigIntStats | undefined {
  try {
    return lstatSync(path, { bigint: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw ioUnavailable('The storage path could not be inspected.')
  }
}

function assertOwnedDirectory(
  path: string,
  stat: BigIntStats,
  uid: number,
): void {
  if (stat.isSymbolicLink()) {
    throw storageBoundaryViolation(
      'symbolic-link',
      'The storage root must not be a symbolic link.',
    )
  }
  if (!stat.isDirectory()) {
    throw storageBoundaryViolation(
      'not-directory',
      'The storage root must be a directory.',
    )
  }
  if (stat.uid !== BigInt(uid)) {
    throw storageBoundaryViolation(
      'wrong-owner',
      'The storage root is not owned by the effective user.',
    )
  }
  if (permissions(stat) !== 0o700) {
    throw storageBoundaryViolation(
      'unsafe-mode',
      'The storage root must have mode 0700.',
    )
  }
}

function assertOwnedRegularFile(
  stat: BigIntStats,
  uid: number,
  sidecar: boolean,
  allowUnlinked = false,
): void {
  const reason = sidecar ? 'untrusted-sidecar' : undefined
  if (stat.isSymbolicLink()) {
    throw storageBoundaryViolation(
      reason ?? 'symbolic-link',
      sidecar
        ? 'A SQLite sidecar must not be a symbolic link.'
        : 'The database must not be a symbolic link.',
    )
  }
  if (!stat.isFile()) {
    throw storageBoundaryViolation(
      reason ?? 'not-regular-file',
      sidecar
        ? 'A SQLite sidecar must be a regular file.'
        : 'The database must be a regular file.',
    )
  }
  if (stat.uid !== BigInt(uid)) {
    throw storageBoundaryViolation(
      reason ?? 'wrong-owner',
      sidecar
        ? 'A SQLite sidecar is not owned by the effective user.'
        : 'The database is not owned by the effective user.',
    )
  }
  if (permissions(stat) !== 0o600) {
    throw storageBoundaryViolation(
      reason ?? 'unsafe-mode',
      sidecar
        ? 'A SQLite sidecar must have mode 0600.'
        : 'The database must have mode 0600.',
    )
  }
  if (stat.nlink !== 1n && !(allowUnlinked && stat.nlink === 0n)) {
    throw storageBoundaryViolation(
      reason ?? 'hard-linked-file',
      sidecar
        ? `A SQLite sidecar must have one hard link; observed ${stat.nlink}.`
        : 'The database must have exactly one hard link.',
    )
  }
}

function inspectStorageRoot(storageRoot: string, uid: number): FileIdentity {
  const rootStat = lstatIfPresent(storageRoot)
  if (rootStat === undefined) {
    throw storageBoundaryViolation(
      'not-directory',
      'The storage root must already exist.',
    )
  }
  assertOwnedDirectory(storageRoot, rootStat, uid)

  let physicalRoot: string
  try {
    physicalRoot = realpathSync(storageRoot)
  } catch {
    throw ioUnavailable('The storage root could not be resolved.')
  }
  if (physicalRoot !== storageRoot) {
    throw storageBoundaryViolation(
      'non-canonical-root',
      'The storage root must use its canonical physical path.',
    )
  }

  let descriptor: number | undefined
  try {
    descriptor = openSync(
      storageRoot,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    )
    const openedStat = fstatSync(descriptor, { bigint: true })
    assertOwnedDirectory(storageRoot, openedStat, uid)
    if (!sameIdentity(fileIdentity(rootStat), fileIdentity(openedStat))) {
      throw storageBoundaryViolation(
        'path-replaced',
        'The storage root changed while it was being inspected.',
      )
    }
    return fileIdentity(openedStat)
  } catch (error) {
    if (error instanceof BusinessMatterEventStoreError) throw error
    throw ioUnavailable('The storage root could not be opened safely.')
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // A failed probe close cannot make a later pathname open safe.
      }
    }
  }
}

function ensureOwnedDirectory(path: string, uid: number): FileIdentity {
  if (lstatIfPresent(path) === undefined) {
    try {
      mkdirSync(path, { mode: 0o700 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw ioUnavailable('A Sage data directory could not be created.')
      }
    }
  }
  return inspectStorageRoot(path, uid)
}

function inspectExistingFile(
  path: string,
  uid: number,
): FileIdentity {
  const pathStat = lstatIfPresent(path)
  if (pathStat === undefined) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The database disappeared while it was being inspected.',
    )
  }
  assertOwnedRegularFile(pathStat, uid, false)

  let descriptor: number | undefined
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDWR | fsConstants.O_NOFOLLOW,
    )
    const openedStat = fstatSync(descriptor, { bigint: true })
    assertOwnedRegularFile(openedStat, uid, false)
    if (!sameIdentity(fileIdentity(pathStat), fileIdentity(openedStat))) {
      throw storageBoundaryViolation(
        'path-replaced',
        'The database changed while it was being inspected.',
      )
    }
    return fileIdentity(openedStat)
  } catch (error) {
    if (error instanceof BusinessMatterEventStoreError) throw error
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      throw storageBoundaryViolation(
        'symbolic-link',
        'The database must not be a symbolic link.',
      )
    }
    throw ioUnavailable('The database could not be opened safely.')
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The descriptor is only a pre-SQLite identity probe.
      }
    }
  }
}

function inspectExistingSidecar(
  path: string,
  uid: number,
  initialStat: BigIntStats,
): void {
  let expectedStat = initialStat
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assertOwnedRegularFile(expectedStat, uid, true)
    let descriptor: number | undefined
    try {
      descriptor = openSync(
        path,
        fsConstants.O_RDWR | fsConstants.O_NOFOLLOW,
      )
      const openedStat = fstatSync(descriptor, { bigint: true })
      assertOwnedRegularFile(openedStat, uid, true, true)
      const currentStat = lstatIfPresent(path)

      if (openedStat.nlink === 0n || currentStat === undefined) {
        if (currentStat === undefined) return
        expectedStat = currentStat
        continue
      }
      assertOwnedRegularFile(currentStat, uid, true)
      if (
        sameIdentity(fileIdentity(expectedStat), fileIdentity(openedStat))
        && sameIdentity(fileIdentity(openedStat), fileIdentity(currentStat))
      ) return
      expectedStat = currentStat
    } catch (error) {
      if (error instanceof BusinessMatterEventStoreError) throw error
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      if (code === 'ELOOP') {
        throw storageBoundaryViolation(
          'untrusted-sidecar',
          'A SQLite sidecar must not be a symbolic link.',
        )
      }
      throw ioUnavailable('A SQLite sidecar could not be opened safely.')
    } finally {
      if (descriptor !== undefined) {
        try {
          closeSync(descriptor)
        } catch {
          // The descriptor is only a transient sidecar identity probe.
        }
      }
    }
  }
  throw new BusinessMatterEventStoreError(
    'storage-busy',
    'A SQLite sidecar changed repeatedly while the store was opening.',
  )
}

function createPrivateDatabase(path: string, uid: number): PreparedDatabaseFile {
  let descriptor: number | undefined
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDWR
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW,
      0o600,
    )
    fchmodSync(descriptor, 0o600)
    const openedStat = fstatSync(descriptor, { bigint: true })
    assertOwnedRegularFile(openedStat, uid, false)
    return {
      identity: fileIdentity(openedStat),
      disposition: 'created',
    }
  } catch (error) {
    if (error instanceof BusinessMatterEventStoreError) throw error
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      return {
        identity: inspectExistingFile(path, uid),
        disposition: 'creation-raced',
      }
    }
    if (code === 'ELOOP') {
      throw storageBoundaryViolation(
        'path-replaced',
        'The database path changed while it was being created.',
      )
    }
    throw ioUnavailable('The private database file could not be created.')
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // A later identity check decides whether the created path is trusted.
      }
    }
  }
}

function sidecarPaths(databasePath: string): readonly string[] {
  return ['-journal', '-wal', '-shm'].map(suffix => `${databasePath}${suffix}`)
}

function inspectExistingSidecars(
  databasePath: string,
  uid: number,
  databaseExists: boolean,
): void {
  let observedDatabase = databaseExists
  for (const path of sidecarPaths(databasePath)) {
    const sidecar = lstatIfPresent(path)
    if (sidecar === undefined) continue
    if (!observedDatabase) {
      const racedDatabase = lstatIfPresent(databasePath)
      if (racedDatabase === undefined) {
        throw storageBoundaryViolation(
          'untrusted-sidecar',
          'An orphaned SQLite sidecar is not trusted.',
        )
      }
      assertOwnedRegularFile(racedDatabase, uid, false)
      observedDatabase = true
    }
    inspectExistingSidecar(path, uid, sidecar)
  }
}

function prepareBusinessMatterStorage(
  options: NormalizedOpenBusinessMatterEventStoreOptions,
): PreparedBusinessMatterStorage {
  assertFilesystemCapabilities()
  const uid = effectiveUid()
  const sageRoot = options.sageRoot
  const sageRootIdentity = inspectStorageRoot(sageRoot, uid)
  const dataRoot = join(sageRoot, 'data')
  ensureOwnedDirectory(dataRoot, uid)
  const storageRoot = join(sageRoot, BUSINESS_MATTER_STORE_RELATIVE_DIRECTORY)
  const rootIdentity = ensureOwnedDirectory(storageRoot, uid)
  const finalSageRootIdentity = inspectStorageRoot(sageRoot, uid)
  if (!sameIdentity(sageRootIdentity, finalSageRootIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The Sage root changed while the storage path was being prepared.',
    )
  }
  const databasePath = join(storageRoot, BUSINESS_MATTER_STORE_FILENAME)
  const existing = lstatIfPresent(databasePath)
  inspectExistingSidecars(databasePath, uid, existing !== undefined)
  const databaseFile: PreparedDatabaseFile = existing === undefined
    ? createPrivateDatabase(databasePath, uid)
    : {
        identity: inspectExistingFile(databasePath, uid),
        disposition: 'existing',
      }
  if (databaseFile.disposition === 'creation-raced') {
    inspectExistingSidecars(databasePath, uid, true)
  }
  const prepared = {
    sageRoot,
    sageRootIdentity,
    storageRoot,
    databasePath,
    rootIdentity,
    databaseIdentity: databaseFile.identity,
    effectiveUid: uid,
    databaseDisposition: databaseFile.disposition,
  }
  const pathIdentity = inspectExistingFile(databasePath, uid)
  if (!sameIdentity(databaseFile.identity, pathIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The database changed before SQLite could open it.',
    )
  }
  const finalRootIdentity = inspectStorageRoot(storageRoot, uid)
  if (!sameIdentity(rootIdentity, finalRootIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The storage root changed before SQLite could open the database.',
    )
  }
  return prepared
}

function assertPreparedStorageCurrent(
  storage: PreparedBusinessMatterStorage,
): void {
  const sageRootIdentity = inspectStorageRoot(
    storage.sageRoot,
    storage.effectiveUid,
  )
  if (!sameIdentity(sageRootIdentity, storage.sageRootIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The Sage root no longer names the opened store.',
    )
  }
  const rootIdentity = inspectStorageRoot(
    storage.storageRoot,
    storage.effectiveUid,
  )
  if (!sameIdentity(rootIdentity, storage.rootIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The storage root no longer names the opened store.',
    )
  }
  const databaseStat = lstatIfPresent(storage.databasePath)
  if (databaseStat === undefined) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The database no longer names the opened store.',
    )
  }
  assertOwnedRegularFile(databaseStat, storage.effectiveUid, false)
  if (!sameIdentity(fileIdentity(databaseStat), storage.databaseIdentity)) {
    throw storageBoundaryViolation(
      'path-replaced',
      'The database path no longer names the opened store.',
    )
  }
  for (const path of sidecarPaths(storage.databasePath)) {
    const sidecar = lstatIfPresent(path)
    if (sidecar !== undefined) {
      assertOwnedRegularFile(sidecar, storage.effectiveUid, true)
    }
  }
}

function assertPinnedRuntime(): { readonly electron: string; readonly node: string } {
  const electron = process.versions.electron
  const node = process.versions.node
  if (electron !== '43.3.0' || node !== '24.18.1') {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The BusinessMatter store requires Electron 43.3.0 / Node 24.18.1.',
    )
  }
  return { electron, node }
}

function applyConnectionSecurity(database: RuntimeDatabase): void {
  database.enableDefensive(true)
  database.enableLoadExtension(false)
  database.exec('PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;')
}

function applyDurabilityPragmas(
  database: DatabaseSync,
  busyTimeoutMs: number,
): void {
  database.prepare('PRAGMA journal_mode = DELETE').get()
  database.exec(`
    PRAGMA synchronous = EXTRA;
    PRAGMA fullfsync = ON;
    PRAGMA busy_timeout = ${busyTimeoutMs};
  `)
}

function readSchemaIdentity(database: DatabaseSync): {
  readonly applicationId: unknown
  readonly userVersion: unknown
  readonly objects: readonly SchemaObject[]
  readonly blank: boolean
} {
  const applicationId = scalar(database, 'PRAGMA application_id', 'application_id')
  const userVersion = scalar(database, 'PRAGMA user_version', 'user_version')
  const objects = readSchemaObjects(database)
  return {
    applicationId,
    userVersion,
    objects,
    blank: applicationId === 0 && userVersion === 0 && objects.length === 0,
  }
}

function bootstrapSchema(database: DatabaseSync): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    const schema = readSchemaIdentity(database)
    if (!schema.blank) {
      throw new BusinessMatterEventStoreError(
        'schema-mismatch',
        'A newly created database was not blank.',
      )
    }
    database.exec(CREATE_STREAMS_SQL)
    database.exec(CREATE_EVENTS_SQL)
    database.exec(CREATE_EVENT_ID_INDEX_SQL)
    database.exec(CREATE_APPENDS_SQL)
    database.exec(CREATE_COMPATIBILITY_EVIDENCE_SQL)
    database.exec(CREATE_COMPATIBILITY_RECEIPTS_SQL)
    database.exec(`
      PRAGMA application_id = ${BUSINESS_MATTER_STORE_APPLICATION_ID};
      PRAGMA user_version = ${BUSINESS_MATTER_STORE_USER_VERSION};
    `)
    database.exec('COMMIT')
  } catch (error) {
    if (database.isTransaction) {
      try {
        database.exec('ROLLBACK')
      } catch {
        // The original bootstrap error remains the useful failure.
      }
    }
    throw error
  }
}

function probeImmediateTransaction(
  database: DatabaseSync,
  disposition: Exclude<DatabasePreparationDisposition, 'created'>,
): void {
  database.exec('BEGIN IMMEDIATE')
  try {
    if (!database.isTransaction) {
      throw new BusinessMatterEventStoreError(
        'capability-unavailable',
        'BEGIN IMMEDIATE did not open a write transaction.',
      )
    }
    let schema = readSchemaIdentity(database)
    if (
      schema.applicationId === BUSINESS_MATTER_STORE_APPLICATION_ID
      && schema.userVersion === BUSINESS_MATTER_STORE_USER_VERSION
      && schemaMatchesLegacy(schema.objects)
    ) {
      database.exec(CREATE_COMPATIBILITY_EVIDENCE_SQL)
      database.exec(CREATE_COMPATIBILITY_RECEIPTS_SQL)
      schema = readSchemaIdentity(database)
    }
    if (
      schema.applicationId !== BUSINESS_MATTER_STORE_APPLICATION_ID
      || schema.userVersion !== BUSINESS_MATTER_STORE_USER_VERSION
      || !schemaMatches(schema.objects)
    ) {
      if (schema.blank && disposition === 'creation-raced') {
        throw new BusinessMatterEventStoreError(
          'storage-busy',
          'Another opener is still initializing the database.',
        )
      }
      throw new BusinessMatterEventStoreError(
        'schema-mismatch',
        'The database identity, version, or schema does not match Sage v1.',
      )
    }
    database.exec(`
      CREATE TABLE __sage_business_matter_write_probe (
        value INTEGER NOT NULL
      ) STRICT
    `)
  } finally {
    if (database.isTransaction) database.exec('ROLLBACK')
  }
}

function readCapabilities(
  database: DatabaseSync,
  runtime: { readonly electron: string; readonly node: string },
  options: NormalizedOpenBusinessMatterEventStoreOptions,
): BusinessMatterEventStoreCapabilities {
  const sqlite = scalar(database, 'SELECT sqlite_version() AS version', 'version')
  const applicationId = scalar(database, 'PRAGMA application_id', 'application_id')
  const userVersion = scalar(database, 'PRAGMA user_version', 'user_version')
  const journalMode = scalar(database, 'PRAGMA journal_mode', 'journal_mode')
  const synchronous = scalar(database, 'PRAGMA synchronous', 'synchronous')
  const foreignKeys = scalar(database, 'PRAGMA foreign_keys', 'foreign_keys')
  const trustedSchema = scalar(database, 'PRAGMA trusted_schema', 'trusted_schema')
  const fullfsync = scalar(database, 'PRAGMA fullfsync', 'fullfsync')
  const busyTimeoutMs = scalar(database, 'PRAGMA busy_timeout', 'timeout')

  if (
    sqlite !== '3.53.1'
    || applicationId !== BUSINESS_MATTER_STORE_APPLICATION_ID
    || userVersion !== BUSINESS_MATTER_STORE_USER_VERSION
    || journalMode !== 'delete'
    || synchronous !== 3
    || foreignKeys !== 1
    || trustedSchema !== 0
    || fullfsync !== 1
    || busyTimeoutMs !== options.busyTimeoutMs
  ) {
    throw new BusinessMatterEventStoreError(
      'capability-unavailable',
      'The database did not retain the required schema or PRAGMA configuration.',
    )
  }

  return Object.freeze({
    runtime: Object.freeze({
      electron: runtime.electron,
      node: runtime.node,
      sqlite,
    }),
    schema: Object.freeze({ applicationId, userVersion }),
    pragmas: Object.freeze({
      journalMode,
      synchronous,
      foreignKeys,
      trustedSchema,
      fullfsync,
      busyTimeoutMs,
    }),
    security: Object.freeze({ defensive: true as const, extensionLoading: false as const }),
    limits: Object.freeze({
      maxStreamEvents: options.maxStreamEvents,
      maxPayloadBytes: options.maxPayloadBytes,
    }),
  })
}

function closeQuietly(database: DatabaseSync | undefined): void {
  if (database === undefined || !database.isOpen) return
  try {
    database.close()
  } catch {
    // The caller is already handling the more specific open failure.
  }
}

interface NormalizedAppendRequest extends AppendRequest {
  readonly events: readonly EncodedNewBusinessMatterEvent[]
}

type AppendPreflight =
  | { readonly kind: 'valid'; readonly request: NormalizedAppendRequest }
  | { readonly kind: 'invalid'; readonly result: BusinessMatterAppendResult }
  | {
      readonly kind: 'authority-limit-check'
      readonly matterId: string
      readonly diagnostic: BusinessMatterEventStoreDiagnostic
    }

function invalidRequest(
  reason: AppendInvalidRequestReason,
  diagnostic?: BusinessMatterEventStoreDiagnostic,
): BusinessMatterAppendResult {
  return diagnostic === undefined
    ? { kind: 'invalid-request', reason }
    : { kind: 'invalid-request', reason, diagnostic }
}

function preflightAppendRequest(
  input: AppendRequest,
  maxStreamEvents: number,
  maxPayloadBytes: number,
): AppendPreflight {
  const request = exactDataRecord(
    input,
    ['matterId', 'expectedVersion', 'appendId', 'events'],
  )
  if (request === undefined) {
    return { kind: 'invalid', result: invalidRequest('invalid-envelope') }
  }
  if (!isNonBlank(request.matterId)) {
    return { kind: 'invalid', result: invalidRequest('invalid-matter-id') }
  }
  if (!isNonBlank(request.appendId)) {
    return { kind: 'invalid', result: invalidRequest('invalid-append-id') }
  }

  const expectedCandidate = exactDataRecord(
    request.expectedVersion,
    ['kind'],
  ) ?? exactDataRecord(request.expectedVersion, ['kind', 'value'])
  let expectedVersion: ExpectedVersion
  if (expectedCandidate?.kind === 'not-exists') {
    if (Reflect.ownKeys(expectedCandidate).length !== 1) {
      return { kind: 'invalid', result: invalidRequest('invalid-expected-version') }
    }
    expectedVersion = { kind: 'not-exists' }
  } else if (
    expectedCandidate?.kind === 'exact'
    && isPositiveSafeInteger(expectedCandidate.value)
    && Reflect.ownKeys(expectedCandidate).length === 2
  ) {
    expectedVersion = { kind: 'exact', value: expectedCandidate.value }
  } else {
    return { kind: 'invalid', result: invalidRequest('invalid-expected-version') }
  }

  if (
    expectedVersion.kind === 'exact'
    && expectedVersion.value > maxStreamEvents
  ) {
    return {
      kind: 'authority-limit-check',
      matterId: request.matterId,
      diagnostic: {
        field: 'expectedVersion.value',
        actual: expectedVersion.value,
        limit: maxStreamEvents,
      },
    }
  }

  const eventCount = dataArrayLength(request.events)
  if (eventCount === undefined) {
    return { kind: 'invalid', result: invalidRequest('invalid-envelope') }
  }
  if (eventCount === 0) {
    return { kind: 'invalid', result: invalidRequest('empty-events') }
  }

  const baseVersion = expectedVersion.kind === 'exact' ? expectedVersion.value : 0
  const firstOverLimit = maxStreamEvents - baseVersion
  if (
    baseVersion <= maxStreamEvents
    && firstOverLimit < eventCount
  ) {
    const eventIndex = Math.max(0, firstOverLimit)
    let eventId: string | undefined
    const candidate = dataArrayValueAt(request.events, eventIndex)
    const candidateRecord = candidate.ok
      ? exactDataRecord(candidate.value, [
          'matterId',
          'eventId',
          'eventType',
          'eventSchemaVersion',
          'occurredAt',
          'payloadBytes',
        ])
      : undefined
    if (typeof candidateRecord?.eventId === 'string') {
      eventId = candidateRecord.eventId
    }
    return {
      kind: 'invalid',
      result: invalidRequest('stream-too-large', {
        eventIndex,
        ...(eventId === undefined ? {} : { eventId }),
        field: 'streamVersion',
        actual: baseVersion + eventCount,
        limit: maxStreamEvents,
      }),
    }
  }

  const eventInputs = snapshotDenseDataArray(request.events, eventCount)
  if (eventInputs === undefined) {
    return { kind: 'invalid', result: invalidRequest('invalid-envelope') }
  }

  const events: EncodedNewBusinessMatterEvent[] = []
  const eventIds = new Set<string>()
  for (let index = 0; index < eventInputs.length; index += 1) {
    const raw = exactDataRecord(
      eventInputs[index],
      [
        'matterId',
        'eventId',
        'eventType',
        'eventSchemaVersion',
        'occurredAt',
        'payloadBytes',
      ],
    )
    if (raw === undefined) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', { eventIndex: index }),
      }
    }
    const eventId = typeof raw.eventId === 'string' ? raw.eventId : undefined
    const context: BusinessMatterEventStoreDiagnostic = {
      eventIndex: index,
      ...(eventId === undefined ? {} : { eventId }),
    }
    if (!isNonBlank(raw.matterId)) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', { ...context, field: 'matterId' }),
      }
    }
    if (raw.matterId !== request.matterId) {
      return {
        kind: 'invalid',
        result: invalidRequest('matter-identity-mismatch', {
          ...context,
          field: 'matterId',
        }),
      }
    }
    if (!isNonBlank(raw.eventId)) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', { ...context, field: 'eventId' }),
      }
    }
    if (eventIds.has(raw.eventId)) {
      return {
        kind: 'invalid',
        result: invalidRequest('duplicate-event-id', {
          eventIndex: index,
          eventId: raw.eventId,
          field: 'eventId',
        }),
      }
    }
    eventIds.add(raw.eventId)
    if (!isNonBlank(raw.eventType)) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', { ...context, field: 'eventType' }),
      }
    }
    if (!isPositiveSafeInteger(raw.eventSchemaVersion)) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', {
          ...context,
          field: 'eventSchemaVersion',
        }),
      }
    }
    if (typeof raw.occurredAt !== 'string' || !isValidIsoUtcTimestamp(raw.occurredAt)) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-envelope', { ...context, field: 'occurredAt' }),
      }
    }
    const payloadBytes = copyBytes(raw.payloadBytes)
    if (payloadBytes === undefined) {
      return {
        kind: 'invalid',
        result: invalidRequest('invalid-payload', { ...context, field: 'payloadBytes' }),
      }
    }
    if (payloadBytes.byteLength > maxPayloadBytes) {
      return {
        kind: 'invalid',
        result: invalidRequest('payload-too-large', {
          ...context,
          field: 'payloadBytes',
          actual: payloadBytes.byteLength,
          limit: maxPayloadBytes,
        }),
      }
    }
    events.push({
      matterId: raw.matterId,
      eventId: raw.eventId,
      eventType: raw.eventType,
      eventSchemaVersion: raw.eventSchemaVersion,
      occurredAt: raw.occurredAt,
      payloadBytes,
    })
  }

  return {
    kind: 'valid',
    request: {
      matterId: request.matterId,
      expectedVersion,
      appendId: request.appendId,
      events,
    },
  }
}

interface LoadedAuthority {
  readonly kind: 'loaded'
  readonly version: number
  readonly matter: BusinessMatter
  readonly envelopes: readonly BusinessMatterEventEnvelope[]
  readonly headDigest: Uint8Array
}

type InternalLoadResult =
  | { readonly kind: 'not-found' }
  | LoadedAuthority
  | Extract<BusinessMatterLoadResult, { readonly kind: 'blocked' }>

function blockedLoad(
  reason: Extract<BusinessMatterLoadResult, { readonly kind: 'blocked' }>['reason'],
  diagnostic?: BusinessMatterEventStoreDiagnostic,
): Extract<BusinessMatterLoadResult, { readonly kind: 'blocked' }> {
  return diagnostic === undefined
    ? { kind: 'blocked', reason }
    : { kind: 'blocked', reason, diagnostic }
}

function blockedAppendFromLoad(
  result: Extract<InternalLoadResult, { readonly kind: 'blocked' }>,
): BusinessMatterAppendResult {
  if (result.reason === 'key-unavailable') {
    return result.diagnostic === undefined
      ? { kind: 'blocked', reason: 'io-unavailable' }
      : { kind: 'blocked', reason: 'io-unavailable', diagnostic: result.diagnostic }
  }
  return result.diagnostic === undefined
    ? { kind: 'blocked', reason: result.reason }
    : { kind: 'blocked', reason: result.reason, diagnostic: result.diagnostic }
}

function rowNumber(row: Record<string, unknown>, key: string): number | undefined {
  const value = row[key]
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined
}

function rowString(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' ? value : undefined
}

function rowBytes(row: Record<string, unknown>, key: string): Uint8Array | undefined {
  const value = row[key]
  return value instanceof Uint8Array ? value : undefined
}

interface CompatibilityEvaluationEvidenceRow {
  readonly evaluationId: string
  readonly attemptId: string
  readonly matterId: string
  readonly revisionId: string
  readonly evidenceDigest: string
  readonly evidenceBytes: string
  readonly matrixId: string
  readonly artifactReference: string
  readonly matrixBytes: string
  readonly revocationSourceId: string
  readonly revocationSourceBytes: string
  readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  readonly createdAt: string
  readonly updatedAt: string
}

interface CompatibilityEvaluationOperationRow {
  readonly operationId: string
  readonly evaluationId: string
  readonly operationType: string
  readonly receiptBytes: string
  readonly createdAt: string
}

function readCompatibilityEvaluationEvidenceRow(
  row: Record<string, unknown> | undefined,
): CompatibilityEvaluationEvidenceRow | undefined {
  if (row === undefined) return undefined
  const evaluationId = rowString(row, 'evaluation_id')
  const attemptId = rowString(row, 'attempt_id')
  const matterId = rowString(row, 'matter_id')
  const revisionId = rowString(row, 'revision_id')
  const evidenceDigest = rowString(row, 'evidence_digest')
  const evidenceBytes = rowString(row, 'evidence_bytes')
  const matrixId = rowString(row, 'matrix_id')
  const artifactReference = rowString(row, 'artifact_reference')
  const matrixBytes = rowString(row, 'matrix_bytes')
  const revocationSourceId = rowString(row, 'revocation_source_id')
  const revocationSourceBytes = rowString(row, 'revocation_source_bytes')
  const lifecycleState = rowString(row, 'lifecycle_state')
  const createdAt = rowString(row, 'created_at')
  const updatedAt = rowString(row, 'updated_at')
  if (
    evaluationId === undefined
    || attemptId === undefined
    || matterId === undefined
    || revisionId === undefined
    || evidenceDigest === undefined
    || evidenceBytes === undefined
    || matrixId === undefined
    || artifactReference === undefined
    || matrixBytes === undefined
    || revocationSourceId === undefined
    || revocationSourceBytes === undefined
    || lifecycleState === undefined
    || !isCompatibilityEvaluationEvidenceLifecycleState(lifecycleState)
    || createdAt === undefined
    || updatedAt === undefined
  ) return undefined
  return {
    evaluationId,
    attemptId,
    matterId,
    revisionId,
    evidenceDigest,
    evidenceBytes,
    matrixId,
    artifactReference,
    matrixBytes,
    revocationSourceId,
    revocationSourceBytes,
    lifecycleState,
    createdAt,
    updatedAt,
  }
}

function readCompatibilityEvaluationOperationRow(
  row: Record<string, unknown> | undefined,
): CompatibilityEvaluationOperationRow | undefined {
  if (row === undefined) return undefined
  const operationId = rowString(row, 'operation_id')
  const evaluationId = rowString(row, 'evaluation_id')
  const operationType = rowString(row, 'operation_type')
  const receiptBytes = rowString(row, 'receipt_bytes')
  const createdAt = rowString(row, 'created_at')
  return operationId === undefined
    || evaluationId === undefined
    || operationType === undefined
    || receiptBytes === undefined
    || createdAt === undefined
    ? undefined
    : { operationId, evaluationId, operationType, receiptBytes, createdAt }
}

function sameCompatibilityEvaluationEvidence(
  left: CompatibilityEvaluationEvidenceRecordV1,
  right: CompatibilityEvaluationEvidenceRecordV1,
): boolean {
  return left.evidence.evidenceDigest === right.evidence.evidenceDigest
    && left.evidenceCanonicalBytes === right.evidenceCanonicalBytes
    && left.matrixCanonicalBytes === right.matrixCanonicalBytes
    && left.revocationSourceCanonicalBytes === right.revocationSourceCanonicalBytes
}

function canTransitionCompatibilityEvaluationLifecycle(
  current: CompatibilityEvaluationEvidenceLifecycleStateV1,
  next: CompatibilityEvaluationEvidenceLifecycleStateV1,
): boolean {
  if (current === 'purged') return next === 'purged'
  if (current === next) return true
  if (current === 'legal-hold') return next === 'retention-expired' || next === 'deletion-pending'
  if (current === 'active') return next === 'retention-expired'
    || next === 'legal-hold'
    || next === 'deletion-pending'
  if (current === 'retention-expired') return next === 'legal-hold'
    || next === 'deletion-pending'
  if (current === 'deletion-pending') return next === 'legal-hold'
  return false
}

class SqliteBusinessMatterEventStore implements BusinessMatterEventStore {
  readonly capabilities: BusinessMatterEventStoreCapabilities
  readonly compatibilityEvaluationEvidence: CompatibilityEvaluationEvidencePortV1

  private readonly database: DatabaseSync
  private readonly maxStreamEvents: number
  private readonly maxPayloadBytes: number
  private readonly clock: () => string
  private readonly storage: PreparedBusinessMatterStorage
  private closed = false

  constructor(
    database: DatabaseSync,
    capabilities: BusinessMatterEventStoreCapabilities,
    options: NormalizedOpenBusinessMatterEventStoreOptions,
    storage: PreparedBusinessMatterStorage,
  ) {
    this.database = database
    this.capabilities = capabilities
    this.maxStreamEvents = options.maxStreamEvents
    this.maxPayloadBytes = options.maxPayloadBytes
    this.clock = options.clock
    this.storage = storage
    this.compatibilityEvaluationEvidence = Object.freeze({
      load: (evaluationId: string): CompatibilityEvaluationEvidenceLoadResultV1 =>
        this.loadCompatibilityEvaluationEvidence(evaluationId),
      exportEvidence: (input: { readonly evaluationId: string; readonly operationId: string }) =>
        this.exportCompatibilityEvaluationEvidence(input),
      restoreEvidence: (input: { readonly bundle: unknown; readonly operationId: string }) =>
        this.restoreCompatibilityEvaluationEvidence(input),
      transitionLifecycle: (input: {
        readonly evaluationId: string
        readonly operationId: string
        readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
      }) => this.transitionCompatibilityEvaluationLifecycle(input),
      purgeEvidence: (input: { readonly evaluationId: string; readonly operationId: string }) =>
        this.purgeCompatibilityEvaluationEvidence(input),
    })
  }

  private assertOpen(): void {
    if (this.closed || !this.database.isOpen) {
      throw new BusinessMatterEventStoreError(
        'store-closed',
        'The BusinessMatter event store is closed.',
      )
    }
  }

  private quarantineAfterUnknownOutcome(): void {
    try {
      this.close()
    } catch {
      this.closed = true
    }
  }

  private assertStorageBoundary(): void {
    try {
      assertPreparedStorageCurrent(this.storage)
    } catch (error) {
      this.quarantineAfterUnknownOutcome()
      if (error instanceof BusinessMatterEventStoreError) throw error
      throw ioUnavailable('The storage boundary could not be verified.')
    }
  }

  private rollback(): boolean {
    if (!this.database.isTransaction) return true
    try {
      this.database.exec('ROLLBACK')
      return true
    } catch {
      this.quarantineAfterUnknownOutcome()
      return false
    }
  }

  private loadCompatibilityEvaluationEvidence(
    evaluationId: string,
  ): CompatibilityEvaluationEvidenceLoadResultV1 {
    this.assertOpen()
    this.assertStorageBoundary()
    if (!isNonBlank(evaluationId)) return { kind: 'not-found' }
    try {
      const row = readCompatibilityEvaluationEvidenceRow(this.database.prepare(`
        SELECT
          evaluation_id,
          attempt_id,
          matter_id,
          revision_id,
          evidence_digest,
          evidence_bytes,
          matrix_id,
          artifact_reference,
          matrix_bytes,
          revocation_source_id,
          revocation_source_bytes,
          lifecycle_state,
          created_at,
          updated_at
        FROM compatibility_evaluation_evidence
        WHERE evaluation_id = ?
      `).get(evaluationId))
      if (row === undefined) return { kind: 'not-found' }
      if (row.lifecycleState === 'purged') return { kind: 'blocked', reason: 'purged' }
      const parsed = parsePersistedCompatibilityEvaluationEvidence({
        evidenceCanonicalBytes: row.evidenceBytes,
        matrixCanonicalBytes: row.matrixBytes,
        revocationSourceCanonicalBytes: row.revocationSourceBytes,
        lifecycleState: row.lifecycleState,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })
      if (!parsed.ok) return { kind: 'blocked', reason: 'corrupt' }
      const record = parsed.value
      if (
        record.evidence.evidenceDigest !== row.evidenceDigest
        || record.evidence.evaluationId !== row.evaluationId
        || record.evidence.attemptId !== row.attemptId
        || record.evidence.matterId !== row.matterId
        || record.evidence.revisionId !== row.revisionId
        || record.evidence.matrixArtifact.matrixId !== row.matrixId
        || record.evidence.matrixArtifact.artifactReference !== row.artifactReference
        || record.evidence.revocationSource.sourceId !== row.revocationSourceId
      ) return { kind: 'blocked', reason: 'corrupt' }
      return { kind: 'loaded', record }
    } catch (error) {
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return { kind: 'blocked', reason: isSqliteCorrupt(error) ? 'corrupt' : 'io-unavailable' }
    }
  }

  private readCompatibilityEvaluationOperation(
    operationId: string,
  ): CompatibilityEvaluationOperationRow | undefined {
    return readCompatibilityEvaluationOperationRow(this.database.prepare(`
      SELECT operation_id, evaluation_id, operation_type, receipt_bytes, created_at
      FROM compatibility_evaluation_operation_receipts
      WHERE operation_id = ?
    `).get(operationId))
  }

  private insertCompatibilityEvaluationOperation(input: {
    readonly operationId: string
    readonly evaluationId: string
    readonly operationType: 'export' | 'restore' | 'transition' | 'purge' | 'recovery'
    readonly receiptBytes: string
    readonly createdAt: string
  }): void {
    this.database.prepare(`
      INSERT INTO compatibility_evaluation_operation_receipts (
        operation_id,
        evaluation_id,
        operation_type,
        receipt_bytes,
        created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      input.operationId,
      input.evaluationId,
      input.operationType,
      input.receiptBytes,
      input.createdAt,
    )
  }

  private insertCompatibilityEvaluationEvidence(
    prepared: CompatibilityEvaluationEvidenceRecordV1,
  ): void {
    const existing = readCompatibilityEvaluationEvidenceRow(this.database.prepare(`
      SELECT
        evaluation_id,
        attempt_id,
        matter_id,
        revision_id,
        evidence_digest,
        evidence_bytes,
        matrix_id,
        artifact_reference,
        matrix_bytes,
        revocation_source_id,
        revocation_source_bytes,
        lifecycle_state,
        created_at,
        updated_at
      FROM compatibility_evaluation_evidence
      WHERE evaluation_id = ?
    `).get(prepared.evidence.evaluationId))
    if (existing !== undefined) throw new Error('Compatibility evidence already exists.')
    this.database.prepare(`
      INSERT INTO compatibility_evaluation_evidence (
        evaluation_id,
        attempt_id,
        matter_id,
        revision_id,
        evidence_digest,
        evidence_bytes,
        matrix_id,
        artifact_reference,
        matrix_bytes,
        revocation_source_id,
        revocation_source_bytes,
        lifecycle_state,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      prepared.evidence.evaluationId,
      prepared.evidence.attemptId,
      prepared.evidence.matterId,
      prepared.evidence.revisionId,
      prepared.evidence.evidenceDigest,
      prepared.evidenceCanonicalBytes,
      prepared.evidence.matrixArtifact.matrixId,
      prepared.evidence.matrixArtifact.artifactReference,
      prepared.matrixCanonicalBytes,
      prepared.evidence.revocationSource.sourceId,
      prepared.revocationSourceCanonicalBytes,
      prepared.lifecycleState,
      prepared.createdAt,
      prepared.updatedAt,
    )
  }

  private prepareCompatibilityEvidenceForAppend(
    request: AppendRequest,
    input: CompatibilityEvaluationEvidencePersistenceInputV1,
  ): PreparedCompatibilityEvaluationEvidenceV1 | undefined {
    const prepared = prepareCompatibilityEvaluationEvidence(input)
    if (!prepared.ok) return undefined
    if (
      prepared.value.evidence.matterId !== request.matterId
      || prepared.value.evidence.lifecycleState !== 'active'
    ) return undefined
    return prepared.value
  }

  private internalLoad(matterId: string): InternalLoadResult {
    const head = this.database.prepare(`
      SELECT current_version, head_digest
      FROM business_matter_streams
      WHERE matter_id = ?
    `).get(matterId)

    if (head === undefined) {
      const orphan = this.database.prepare(`
        SELECT
          EXISTS(
            SELECT 1 FROM business_matter_events WHERE matter_id = ?
          ) AS has_events,
          EXISTS(
            SELECT 1 FROM business_matter_appends WHERE matter_id = ?
          ) AS has_appends
      `).get(matterId, matterId)
      if (orphan?.has_events === 1 || orphan?.has_appends === 1) {
        return blockedLoad('corrupt')
      }
      return { kind: 'not-found' }
    }

    const version = rowNumber(head, 'current_version')
    const headDigest = rowBytes(head, 'head_digest')
    if (
      version === undefined
      || version <= 0
      || headDigest === undefined
      || headDigest.byteLength !== DIGEST_BYTES
    ) {
      return blockedLoad('corrupt')
    }

    if (version > this.maxStreamEvents) {
      const firstExcess = this.database.prepare(`
        SELECT stream_version, event_id
        FROM business_matter_events
        WHERE matter_id = ?
        ORDER BY stream_version
        LIMIT 1 OFFSET ?
      `).get(matterId, this.maxStreamEvents)
      const streamVersion = firstExcess === undefined
        ? this.maxStreamEvents + 1
        : rowNumber(firstExcess, 'stream_version') ?? this.maxStreamEvents + 1
      const eventId = firstExcess === undefined
        ? undefined
        : rowString(firstExcess, 'event_id')
      return blockedLoad('stream-too-large', {
        eventIndex: streamVersion - 1,
        streamVersion,
        ...(eventId === undefined ? {} : { eventId }),
        field: 'streamVersion',
        actual: version,
        limit: this.maxStreamEvents,
      })
    }

    const summary = this.database.prepare(`
      SELECT
        COUNT(*) AS event_count,
        MIN(stream_version) AS first_version,
        MAX(stream_version) AS last_version
      FROM business_matter_events
      WHERE matter_id = ?
    `).get(matterId)
    if (summary === undefined) return blockedLoad('corrupt')
    const eventCount = rowNumber(summary, 'event_count')
    const firstVersion = rowNumber(summary, 'first_version')
    const lastVersion = rowNumber(summary, 'last_version')
    if (
      eventCount !== version
      || firstVersion !== 1
      || lastVersion !== version
    ) {
      return blockedLoad('corrupt')
    }

    const oversized = this.database.prepare(`
      SELECT stream_version, event_id, length(payload_bytes) AS payload_size
      FROM business_matter_events
      WHERE matter_id = ? AND length(payload_bytes) > ?
      ORDER BY stream_version
      LIMIT 1
    `).get(matterId, this.maxPayloadBytes)
    if (oversized !== undefined) {
      const streamVersion = rowNumber(oversized, 'stream_version')
      const eventId = rowString(oversized, 'event_id')
      const actual = rowNumber(oversized, 'payload_size')
      return blockedLoad('payload-too-large', {
        ...(streamVersion === undefined
          ? {}
          : { eventIndex: streamVersion - 1, streamVersion }),
        ...(eventId === undefined ? {} : { eventId }),
        field: 'payloadBytes',
        ...(actual === undefined ? {} : { actual }),
        limit: this.maxPayloadBytes,
      })
    }

    const rows = this.database.prepare(`
      SELECT
        matter_id,
        stream_version,
        event_id,
        event_type,
        event_schema_version,
        occurred_at,
        recorded_at,
        payload_bytes,
        previous_digest,
        event_digest
      FROM business_matter_events
      WHERE matter_id = ?
      ORDER BY stream_version
    `).all(matterId)
    if (rows.length !== version) return blockedLoad('corrupt')

    const envelopes: BusinessMatterEventEnvelope[] = []
    const eventIds = new Set<string>()
    let previousDigest: Uint8Array | null = null
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (row === undefined) return blockedLoad('corrupt')
      const streamVersion = rowNumber(row, 'stream_version')
      const eventId = rowString(row, 'event_id')
      const eventType = rowString(row, 'event_type')
      const eventSchemaVersion = rowNumber(row, 'event_schema_version')
      const occurredAt = rowString(row, 'occurred_at')
      const recordedAt = rowString(row, 'recorded_at')
      const payloadBytes = rowBytes(row, 'payload_bytes')
      const storedPrevious = row.previous_digest === null
        ? null
        : rowBytes(row, 'previous_digest')
      const eventDigest = rowBytes(row, 'event_digest')
      const diagnostic: BusinessMatterEventStoreDiagnostic = {
        eventIndex: index,
        streamVersion: index + 1,
        ...(eventId === undefined ? {} : { eventId }),
      }
      if (
        rowString(row, 'matter_id') !== matterId
        || streamVersion !== index + 1
        || !isNonBlank(eventId)
        || !isNonBlank(eventType)
        || !isPositiveSafeInteger(eventSchemaVersion)
        || occurredAt === undefined
        || !isValidIsoUtcTimestamp(occurredAt)
        || recordedAt === undefined
        || !isValidIsoUtcTimestamp(recordedAt)
        || payloadBytes === undefined
        || payloadBytes.byteLength > this.maxPayloadBytes
        || eventDigest === undefined
        || eventDigest.byteLength !== DIGEST_BYTES
        || eventIds.has(eventId)
      ) {
        return blockedLoad('corrupt', diagnostic)
      }
      if (storedPrevious === undefined) {
        return blockedLoad('corrupt', {
          ...diagnostic,
          field: 'previousDigest',
        })
      }
      if (
        (index === 0 && storedPrevious !== null)
        || (
          index > 0
          && (
            storedPrevious === null
            || storedPrevious.byteLength !== DIGEST_BYTES
            || previousDigest === null
            || !equalBytes(storedPrevious, previousDigest)
          )
        )
      ) {
        return blockedLoad('corrupt', {
          ...diagnostic,
          field: 'previousDigest',
        })
      }

      const computed = computeBusinessMatterCommittedEventDigest({
        matterId,
        streamVersion,
        eventId,
        eventType,
        eventSchemaVersion,
        occurredAt,
        recordedAt,
        payloadBytes,
        previousDigest: storedPrevious,
      })
      if (!equalBytes(computed, eventDigest)) {
        return blockedLoad('corrupt', { ...diagnostic, field: 'eventDigest' })
      }
      eventIds.add(eventId)
      previousDigest = eventDigest
      envelopes.push({
        matterId,
        streamVersion,
        eventId,
        eventType,
        eventSchemaVersion,
        occurredAt,
        payloadBytes: payloadBytes.slice(),
      })
    }

    if (previousDigest === null || !equalBytes(previousDigest, headDigest)) {
      return blockedLoad('corrupt', {
        eventIndex: version - 1,
        streamVersion: version,
        field: 'headDigest',
      })
    }

    try {
      return {
        kind: 'loaded',
        version,
        matter: rehydrateBusinessMatter(envelopes),
        envelopes,
        headDigest: headDigest.slice(),
      }
    } catch (error) {
      if (error instanceof BusinessMatterCodecError) {
        const reason = error.code === 'unsupported-schema'
          || error.code === 'unsupported-event-type'
          ? 'unsupported-schema'
          : 'corrupt'
        return blockedLoad(reason, codecDiagnostic(error))
      }
      return blockedLoad('corrupt')
    }
  }

  load(matterId: string): BusinessMatterLoadResult {
    this.assertOpen()
    this.assertStorageBoundary()
    try {
      const result = this.internalLoad(matterId)
      this.assertStorageBoundary()
      if (result.kind !== 'loaded') return result
      return { kind: 'loaded', version: result.version, matter: result.matter }
    } catch (error) {
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return isSqliteCorrupt(error)
        ? blockedLoad('corrupt')
        : blockedLoad('io-unavailable')
    }
  }

  /** 已提交摘要语义（本读方法唯一事实来源）：
   *
   * 选择候选 B——该 matter 事件链中该 revision 的 `revision-entered` 事件的
   * `event_digest`（逐事件链摘要），而非候选 A 的流 head_digest。
   *
   * 理由：①「该 revision 的已提交摘要」必须唯一可寻址到 revision 本身；流
   * head_digest 只锚定「某次 append 后的流终态」，revision 与流版本没有一对一
   * 关系（一个 append 可含多个事件，revision-entered 之后还有 attempt、decision
   * 等事件），用 head_digest 会把 revision 之后的流演化伪装成 revision 的摘要。
   * ② revision-entered 的 event_digest 是 store 自己既有 SHA-256 域分隔链
   * （COMMITTED_EVENT_DIGEST_DOMAIN，computeBusinessMatterCommittedEventDigest）
   * 的产物，append 时写入、internalLoad 时逐事件重算校验、且与 head_digest 链式
   * 锁定（previous_digest 连锁），不另造第二套摘要定义。③ 同一 revisionId 在
   * 不同 matter 下各自有独立事件行，天然隔离。
   *
   * 「已提交」定义：只认 internalLoad 已通过全链校验的流。流被篡改或损坏时按
   * store 既有语义 blocked（抛 BusinessMatterEventStoreError），绝不返回未校验
   * 字节。读到的 32 字节 BLOB 按 `'sha256:' + hex(digest bytes)` 包裹，满足 V2
   * kernel 的 content-digest 形状（/^sha256:[0-9a-f]{64}$/，见
   * security/compatibility.ts）。
   *
   * 返回 undefined 的唯一情形：matter 流不存在，或该 revisionId 不在此流的任何
   * revision-entered 事件里。store 未打开等内部错误按既有语义抛错。
   */
  readRevisionDigest(matterId: string, revisionId: string): string | undefined {
    this.assertOpen()
    this.assertStorageBoundary()
    try {
      const result = this.internalLoad(matterId)
      this.assertStorageBoundary()
      if (result.kind === 'blocked') {
        // The stream failed the store's own full-chain validation. A digest read has no
        // "blocked" shape to return, and answering `undefined` would pass tampered data off
        // as a missing fact, so the blocked outcome surfaces as a thrown integrity
        // violation carrying the blocked reason — never as bytes from an unverified chain.
        throw new BusinessMatterEventStoreError(
          'storage-boundary-violation',
          `The committed stream could not be validated: ${result.reason}.`,
        )
      }
      if (result.kind !== 'loaded') return undefined
      for (const envelope of result.envelopes) {
        if (envelope.eventType !== 'revision-entered') continue
        const payloadBytes = envelope.payloadBytes
        let payload: unknown
        try {
          payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes))
        } catch {
          throw new BusinessMatterEventStoreError(
            'storage-boundary-violation',
            'The committed revision-entered payload is not readable UTF-8 JSON.',
          )
        }
        // The revision-entered payload is `{ type, eventId, matterId, occurredAt,
        // revision: RevisionSnapshot }`; the revision identity lives in
        // payload.revision.revisionId (assertRevision in the codec).
        const record = typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : undefined
        const revision = record === undefined ? undefined : record.revision
        if (
          typeof revision !== 'object'
          || revision === null
          || (revision as Record<string, unknown>).revisionId !== revisionId
        ) continue
        // Stream version n maps 1:1 to envelopes[n-1] and rows ordered by
        // stream_version; internalLoad already verified every event_digest.
        const rows = this.database.prepare(`
          SELECT event_digest
          FROM business_matter_events
          WHERE matter_id = ? AND stream_version = ?
        `).all(matterId, envelope.streamVersion)
        const row = rows.length === 1 ? rows[0] : undefined
        const digest = row === undefined ? undefined : rowBytes(row, 'event_digest')
        if (
          digest === undefined
          || digest.byteLength !== DIGEST_BYTES
        ) {
          throw new BusinessMatterEventStoreError(
            'storage-boundary-violation',
            'The committed revision digest is unreadable.',
          )
        }
        return `sha256:${Buffer.from(digest).toString('hex')}`
      }
      return undefined
    } catch (error) {
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      throw new BusinessMatterEventStoreError(
        'io-unavailable',
        'The committed revision digest could not be read.',
      )
    }
  }

  private appendWithinBoundary(
    input: AppendRequest,
    preparedEvidence?: PreparedCompatibilityEvaluationEvidenceV1,
  ): BusinessMatterAppendResult {
    let preflight: AppendPreflight
    try {
      preflight = preflightAppendRequest(
        input,
        this.maxStreamEvents,
        this.maxPayloadBytes,
      )
    } catch {
      return invalidRequest('invalid-envelope')
    }
    if (preflight.kind === 'invalid') return preflight.result
    if (preflight.kind === 'authority-limit-check') {
      try {
        const authority = this.internalLoad(preflight.matterId)
        this.assertStorageBoundary()
        if (authority.kind === 'blocked') return blockedAppendFromLoad(authority)
        return invalidRequest('stream-too-large', preflight.diagnostic)
      } catch (error) {
        if (error instanceof BusinessMatterEventStoreError) throw error
        this.assertStorageBoundary()
        return isSqliteCorrupt(error)
          ? { kind: 'blocked', reason: 'corrupt' }
          : { kind: 'blocked', reason: 'io-unavailable' }
      }
    }
    const request = preflight.request
    const fingerprint = computeBusinessMatterAppendRequestFingerprint(request)

    try {
      this.database.exec('BEGIN IMMEDIATE')
    } catch (error) {
      this.assertStorageBoundary()
      return isSqliteBusy(error)
        ? { kind: 'storage-busy' }
        : { kind: 'blocked', reason: 'io-unavailable' }
    }

    try {
      const replay = this.database.prepare(`
        SELECT
          a.request_fingerprint,
          a.first_version,
          a.last_version,
          s.current_version
        FROM business_matter_appends AS a
        LEFT JOIN business_matter_streams AS s
          ON s.matter_id = a.matter_id
        WHERE a.matter_id = ? AND a.append_id = ?
      `).get(request.matterId, request.appendId)
      if (replay !== undefined) {
        const storedFingerprint = rowBytes(replay, 'request_fingerprint')
        const firstVersion = rowNumber(replay, 'first_version')
        const lastVersion = rowNumber(replay, 'last_version')
        const currentVersion = rowNumber(replay, 'current_version')
        if (
          storedFingerprint === undefined
          || storedFingerprint.byteLength !== DIGEST_BYTES
          || firstVersion === undefined
          || firstVersion <= 0
          || lastVersion === undefined
          || lastVersion < firstVersion
          || currentVersion === undefined
          || currentVersion < lastVersion
        ) {
          this.rollback()
          return { kind: 'blocked', reason: 'corrupt' }
        }

        const authority = this.internalLoad(request.matterId)
        if (authority.kind === 'blocked') {
          this.rollback()
          return blockedAppendFromLoad(authority)
        }
        if (authority.kind === 'not-found' || authority.version < lastVersion) {
          this.rollback()
          return { kind: 'blocked', reason: 'corrupt' }
        }
        if (!equalBytes(storedFingerprint, fingerprint)) {
          this.rollback()
          return { kind: 'idempotency-conflict' }
        }

        const expectedFirstVersion = request.expectedVersion.kind === 'not-exists'
          ? 1
          : request.expectedVersion.value + 1
        const expectedLastVersion = expectedFirstVersion + request.events.length - 1
        if (
          !Number.isSafeInteger(expectedFirstVersion)
          || !Number.isSafeInteger(expectedLastVersion)
          || firstVersion !== expectedFirstVersion
          || lastVersion !== expectedLastVersion
        ) {
          this.rollback()
          return { kind: 'blocked', reason: 'corrupt' }
        }
        if (preparedEvidence !== undefined) {
          const storedEvidence = this.loadCompatibilityEvaluationEvidence(
            preparedEvidence.evidence.evaluationId,
          )
          if (
            storedEvidence.kind !== 'loaded'
            || storedEvidence.record.evidence.evidenceDigest !== preparedEvidence.evidence.evidenceDigest
            || storedEvidence.record.lifecycleState === 'purged'
          ) {
            this.rollback()
            return { kind: 'blocked', reason: 'compatibility-evidence-unavailable' }
          }
        }
        this.rollback()
        return { kind: 'replayed', firstVersion, lastVersion }
      }

      const current = this.internalLoad(request.matterId)
      if (current.kind === 'blocked') {
        this.rollback()
        return blockedAppendFromLoad(current)
      }
      if (request.expectedVersion.kind === 'not-exists') {
        if (current.kind === 'loaded') {
          this.rollback()
          return { kind: 'version-conflict', actualVersion: current.version }
        }
      } else {
        if (current.kind === 'not-found') {
          this.rollback()
          return { kind: 'version-conflict', actualVersion: null }
        }
        if (current.version !== request.expectedVersion.value) {
          this.rollback()
          return { kind: 'version-conflict', actualVersion: current.version }
        }
      }

      const currentVersion = current.kind === 'loaded' ? current.version : 0
      const currentEnvelopes = current.kind === 'loaded' ? current.envelopes : []
      if (currentVersion + request.events.length > this.maxStreamEvents) {
        const eventIndex = Math.max(0, this.maxStreamEvents - currentVersion)
        const event = request.events[eventIndex]
        this.rollback()
        return invalidRequest('stream-too-large', {
          eventIndex,
          ...(event === undefined ? {} : { eventId: event.eventId }),
          field: 'streamVersion',
          actual: currentVersion + request.events.length,
          limit: this.maxStreamEvents,
        })
      }

      const existingEventIds = new Set(
        currentEnvelopes.map((event) => event.eventId),
      )
      if (request.events.some((event) => existingEventIds.has(event.eventId))) {
        this.rollback()
        return { kind: 'duplicate-event-id' }
      }

      const candidateEnvelopes: BusinessMatterEventEnvelope[] = request.events.map(
        (event, index) => ({
          matterId: event.matterId,
          streamVersion: currentVersion + index + 1,
          eventId: event.eventId,
          eventType: event.eventType,
          eventSchemaVersion: event.eventSchemaVersion,
          occurredAt: event.occurredAt,
          payloadBytes: event.payloadBytes,
        }),
      )
      try {
        rehydrateBusinessMatter([...currentEnvelopes, ...candidateEnvelopes])
      } catch (error) {
        this.rollback()
        if (error instanceof BusinessMatterCodecError) {
          if ((error.eventIndex ?? -1) < currentVersion) {
            const reason = error.code === 'unsupported-schema'
              || error.code === 'unsupported-event-type'
              ? 'unsupported-schema'
              : 'corrupt'
            return {
              kind: 'blocked',
              reason,
              diagnostic: codecDiagnostic(error),
            }
          }
          return invalidRequest(error.code, codecDiagnostic(error))
        }
        return { kind: 'invalid-request', reason: 'semantic-replay-failed' }
      }

      let recordedAt: string
      try {
        recordedAt = this.clock()
      } catch {
        this.rollback()
        this.assertStorageBoundary()
        throw new BusinessMatterEventStoreError(
          'invalid-clock',
          'The BusinessMatter store clock threw.',
        )
      }
      if (!isValidIsoUtcTimestamp(recordedAt)) {
        this.rollback()
        this.assertStorageBoundary()
        throw new BusinessMatterEventStoreError(
          'invalid-clock',
          'The BusinessMatter store clock must return a UTC ISO-8601 timestamp.',
        )
      }
      this.assertStorageBoundary()

      const committed: Array<{
        readonly envelope: CommittedBusinessMatterEvent
        readonly digest: Uint8Array
      }> = []
      let previousDigest = current.kind === 'loaded'
        ? current.headDigest.slice()
        : null
      for (const [index, event] of request.events.entries()) {
        const envelope: CommittedBusinessMatterEvent = {
          ...event,
          streamVersion: currentVersion + index + 1,
          recordedAt,
          previousDigest,
        }
        const digest = computeBusinessMatterCommittedEventDigest(envelope)
        committed.push({ envelope, digest })
        previousDigest = digest
      }
      const finalDigest = committed[committed.length - 1]?.digest
      if (finalDigest === undefined) {
        this.rollback()
        return invalidRequest('empty-events')
      }
      const firstVersion = currentVersion + 1
      const lastVersion = currentVersion + committed.length

      if (current.kind === 'not-found') {
        this.database.prepare(`
          INSERT INTO business_matter_streams (
            matter_id,
            current_version,
            head_digest,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          request.matterId,
          lastVersion,
          finalDigest,
          recordedAt,
          recordedAt,
        )
      }

      const insertEvent = this.database.prepare(`
        INSERT INTO business_matter_events (
          matter_id,
          stream_version,
          event_id,
          event_type,
          event_schema_version,
          occurred_at,
          recorded_at,
          payload_bytes,
          previous_digest,
          event_digest
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      for (const item of committed) {
        insertEvent.run(
          item.envelope.matterId,
          item.envelope.streamVersion,
          item.envelope.eventId,
          item.envelope.eventType,
          item.envelope.eventSchemaVersion,
          item.envelope.occurredAt,
          item.envelope.recordedAt,
          item.envelope.payloadBytes,
          item.envelope.previousDigest,
          item.digest,
        )
      }

      if (current.kind === 'loaded') {
        const update = this.database.prepare(`
          UPDATE business_matter_streams
          SET current_version = ?, head_digest = ?, updated_at = ?
          WHERE matter_id = ? AND current_version = ? AND head_digest = ?
        `).run(
          lastVersion,
          finalDigest,
          recordedAt,
          request.matterId,
          current.version,
          current.headDigest,
        )
        const changes = typeof update.changes === 'bigint'
          ? Number(update.changes)
          : update.changes
        if (changes !== 1) {
          this.rollback()
          const head = this.database.prepare(`
            SELECT current_version
            FROM business_matter_streams
            WHERE matter_id = ?
          `).get(request.matterId)
          return {
            kind: 'version-conflict',
            actualVersion: head === undefined
              ? null
              : rowNumber(head, 'current_version') ?? null,
          }
        }
      }

      this.database.prepare(`
        INSERT INTO business_matter_appends (
          matter_id,
          append_id,
          request_fingerprint,
          first_version,
          last_version,
          committed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        request.matterId,
        request.appendId,
        fingerprint,
        firstVersion,
        lastVersion,
        recordedAt,
      )

      if (preparedEvidence !== undefined) {
        try {
          this.insertCompatibilityEvaluationEvidence({
            ...preparedEvidence,
            lifecycleState: preparedEvidence.evidence.lifecycleState,
            createdAt: recordedAt,
            updatedAt: recordedAt,
          })
        } catch {
          this.rollback()
          return { kind: 'blocked', reason: 'compatibility-evidence-unavailable' }
        }
      }

      try {
        this.database.exec('COMMIT')
      } catch (error) {
        if (this.database.isTransaction) {
          if (!this.rollback()) return { kind: 'commit-unknown' }
          this.assertStorageBoundary()
          return isSqliteBusy(error)
            ? { kind: 'storage-busy' }
            : { kind: 'blocked', reason: 'io-unavailable' }
        }
        this.quarantineAfterUnknownOutcome()
        return { kind: 'commit-unknown' }
      }
      try {
        this.assertStorageBoundary()
      } catch {
        return { kind: 'commit-unknown' }
      }
      return { kind: 'appended', firstVersion, lastVersion }
    } catch (error) {
      if (error instanceof BusinessMatterEventStoreError) throw error
      const rolledBack = this.rollback()
      if (!rolledBack) return { kind: 'commit-unknown' }
      this.assertStorageBoundary()
      if (isSqliteBusy(error)) return { kind: 'storage-busy' }
      if (isDuplicateEventConstraint(error)) return { kind: 'duplicate-event-id' }
      return isSqliteCorrupt(error)
        ? { kind: 'blocked', reason: 'corrupt' }
        : { kind: 'blocked', reason: 'io-unavailable' }
    }
  }

  append(input: AppendRequest): BusinessMatterAppendResult {
    this.assertOpen()
    this.assertStorageBoundary()
    const result = this.appendWithinBoundary(input)
    if (!this.closed) {
      try {
        this.assertStorageBoundary()
      } catch (error) {
        if (result.kind === 'appended') return { kind: 'commit-unknown' }
        throw error
      }
    }
    return result
  }

  appendWithCompatibilityEvidence(
    input: AppendRequest,
    evidence: CompatibilityEvaluationEvidencePersistenceInputV1,
  ): BusinessMatterAppendResult {
    this.assertOpen()
    this.assertStorageBoundary()
    const preparedEvidence = this.prepareCompatibilityEvidenceForAppend(input, evidence)
    if (preparedEvidence === undefined) {
      return { kind: 'blocked', reason: 'compatibility-evidence-unavailable' }
    }
    const result = this.appendWithinBoundary(input, preparedEvidence)
    if (!this.closed) {
      try {
        this.assertStorageBoundary()
      } catch (error) {
        if (result.kind === 'appended') return { kind: 'commit-unknown' }
        throw error
      }
    }
    return result
  }

  private readEvidenceClock(): string {
    let recordedAt: string
    try {
      recordedAt = this.clock()
    } catch {
      throw new BusinessMatterEventStoreError(
        'invalid-clock',
        'The BusinessMatter store clock threw.',
      )
    }
    if (!isValidIsoUtcTimestamp(recordedAt)) {
      throw new BusinessMatterEventStoreError(
        'invalid-clock',
        'The BusinessMatter store clock must return a UTC ISO-8601 timestamp.',
      )
    }
    return recordedAt
  }

  private exportCompatibilityEvaluationEvidence(input: {
    readonly evaluationId: string
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceExportV1> {
    this.assertOpen()
    this.assertStorageBoundary()
    if (!isCompatibilityEvaluationEvidenceOperationId(input.operationId)) {
      return { kind: 'blocked', code: 'compatibility-evidence-invalid' }
    }
    try {
      this.database.exec('BEGIN IMMEDIATE')
      const existingOperation = this.readCompatibilityEvaluationOperation(input.operationId)
      if (existingOperation !== undefined) {
        if (
          existingOperation.evaluationId !== input.evaluationId
          || existingOperation.operationType !== 'export'
        ) {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-operation-conflict' }
        }
        try {
          const receipt = JSON.parse(existingOperation.receiptBytes) as Record<string, unknown>
          const parsed = parseCompatibilityEvaluationEvidenceExportForRestore(receipt.bundle)
          this.rollback()
          return parsed.ok
            ? { kind: 'replayed', value: parsed.value }
            : { kind: 'blocked', code: 'compatibility-evidence-corrupt' }
        } catch {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-corrupt' }
        }
      }
      const loaded = this.loadCompatibilityEvaluationEvidence(input.evaluationId)
      if (loaded.kind === 'not-found') {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-not-found' }
      }
      if (loaded.kind === 'blocked') {
        this.rollback()
        return {
          kind: 'blocked',
          code: loaded.reason === 'purged'
            ? 'compatibility-evidence-purged'
            : 'compatibility-evidence-corrupt',
        }
      }
      const exportedAt = this.readEvidenceClock()
      const exported = createCompatibilityEvaluationEvidenceExport({
        record: { ...loaded.record, updatedAt: exportedAt },
        operationId: input.operationId,
      })
      if (!exported.ok) {
        this.rollback()
        return { kind: 'blocked', code: exported.code }
      }
      const receiptBytes = JSON.stringify({
        receipt: makeCompatibilityEvaluationEvidenceOperationReceipt({
          operationId: input.operationId,
          evaluationId: input.evaluationId,
          operation: 'export',
          state: loaded.record.lifecycleState,
          occurredAt: exportedAt,
        }),
        bundle: exported.value,
      })
      this.insertCompatibilityEvaluationOperation({
        operationId: input.operationId,
        evaluationId: input.evaluationId,
        operationType: 'export',
        receiptBytes,
        createdAt: exportedAt,
      })
      this.database.exec('COMMIT')
      return { kind: 'completed', value: exported.value }
    } catch (error) {
      if (this.database.isTransaction) this.rollback()
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return {
        kind: 'blocked',
        code: isSqliteBusy(error)
          ? 'compatibility-evidence-unavailable'
          : 'compatibility-evidence-unavailable',
      }
    }
  }

  private restoreCompatibilityEvaluationEvidence(input: {
    readonly bundle: unknown
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceRestoreResultV1> {
    this.assertOpen()
    this.assertStorageBoundary()
    if (!isCompatibilityEvaluationEvidenceOperationId(input.operationId)) {
      return { kind: 'blocked', code: 'compatibility-evidence-invalid' }
    }
    const parsedBundle = parseCompatibilityEvaluationEvidenceExportForRestore(input.bundle)
    if (!parsedBundle.ok) return { kind: 'blocked', code: parsedBundle.code }
    const prepared = prepareCompatibilityEvaluationEvidence({
      evidence: parsedBundle.value.evidence,
      historicalMatrix: parsedBundle.value.historicalMatrix,
    })
    if (!prepared.ok) return { kind: 'blocked', code: prepared.code }
    try {
      this.database.exec('BEGIN IMMEDIATE')
      const existingOperation = this.readCompatibilityEvaluationOperation(input.operationId)
      if (existingOperation !== undefined) {
        if (
          existingOperation.evaluationId !== parsedBundle.value.evidence.evaluationId
          || existingOperation.operationType !== 'restore'
        ) {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-operation-conflict' }
        }
        const current = this.loadCompatibilityEvaluationEvidence(parsedBundle.value.evidence.evaluationId)
        this.rollback()
        return current.kind === 'loaded'
          ? {
            kind: 'replayed',
            value: {
              evaluationId: current.record.evidence.evaluationId,
              lifecycleState: current.record.lifecycleState,
              evidenceDigest: current.record.evidence.evidenceDigest,
            },
          }
          : { kind: 'blocked', code: 'compatibility-evidence-corrupt' }
      }
      const current = this.loadCompatibilityEvaluationEvidence(parsedBundle.value.evidence.evaluationId)
      if (current.kind === 'loaded') {
        const candidate: CompatibilityEvaluationEvidenceRecordV1 = {
          ...prepared.value,
          lifecycleState: parsedBundle.value.lifecycleState,
          createdAt: current.record.createdAt,
          updatedAt: current.record.updatedAt,
        }
        if (!sameCompatibilityEvaluationEvidence(current.record, candidate)) {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-conflict' }
        }
        const now = this.readEvidenceClock()
        this.insertCompatibilityEvaluationOperation({
          operationId: input.operationId,
          evaluationId: candidate.evidence.evaluationId,
          operationType: 'restore',
          receiptBytes: makeCompatibilityEvaluationEvidenceOperationReceipt({
            operationId: input.operationId,
            evaluationId: candidate.evidence.evaluationId,
            operation: 'restore',
            state: current.record.lifecycleState,
            occurredAt: now,
          }),
          createdAt: now,
        })
        this.database.exec('COMMIT')
        return {
          kind: 'replayed',
          value: {
            evaluationId: current.record.evidence.evaluationId,
            lifecycleState: current.record.lifecycleState,
            evidenceDigest: current.record.evidence.evidenceDigest,
          },
        }
      }
      if (current.kind === 'blocked') {
        this.rollback()
        return {
          kind: 'blocked',
          code: current.reason === 'purged'
            ? 'compatibility-evidence-purged'
            : 'compatibility-evidence-corrupt',
        }
      }
      const now = this.readEvidenceClock()
      const record: CompatibilityEvaluationEvidenceRecordV1 = {
        ...prepared.value,
        lifecycleState: parsedBundle.value.lifecycleState,
        createdAt: now,
        updatedAt: now,
      }
      this.insertCompatibilityEvaluationEvidence(record)
      this.insertCompatibilityEvaluationOperation({
        operationId: input.operationId,
        evaluationId: record.evidence.evaluationId,
        operationType: 'restore',
        receiptBytes: makeCompatibilityEvaluationEvidenceOperationReceipt({
          operationId: input.operationId,
          evaluationId: record.evidence.evaluationId,
          operation: 'restore',
          state: record.lifecycleState,
          occurredAt: now,
        }),
        createdAt: now,
      })
      this.database.exec('COMMIT')
      return {
        kind: 'completed',
        value: {
          evaluationId: record.evidence.evaluationId,
          lifecycleState: record.lifecycleState,
          evidenceDigest: record.evidence.evidenceDigest,
        },
      }
    } catch (error) {
      if (this.database.isTransaction) this.rollback()
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return { kind: 'blocked', code: 'compatibility-evidence-unavailable' }
    }
  }

  private transitionCompatibilityEvaluationLifecycle(input: {
    readonly evaluationId: string
    readonly operationId: string
    readonly lifecycleState: CompatibilityEvaluationEvidenceLifecycleStateV1
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidenceLifecycleResultV1> {
    this.assertOpen()
    this.assertStorageBoundary()
    if (!isCompatibilityEvaluationEvidenceOperationId(input.operationId)) {
      return { kind: 'blocked', code: 'compatibility-evidence-invalid' }
    }
    try {
      this.database.exec('BEGIN IMMEDIATE')
      const existingOperation = this.readCompatibilityEvaluationOperation(input.operationId)
      if (existingOperation !== undefined) {
        if (
          existingOperation.evaluationId !== input.evaluationId
          || existingOperation.operationType !== 'transition'
        ) {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-operation-conflict' }
        }
        const current = this.loadCompatibilityEvaluationEvidence(input.evaluationId)
        this.rollback()
        return current.kind === 'loaded'
          ? {
            kind: 'replayed',
            value: {
              evaluationId: input.evaluationId,
              operationId: input.operationId,
              previousState: current.record.lifecycleState,
              lifecycleState: current.record.lifecycleState,
            },
          }
          : { kind: 'blocked', code: 'compatibility-evidence-corrupt' }
      }
      const current = this.loadCompatibilityEvaluationEvidence(input.evaluationId)
      if (current.kind === 'not-found') {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-not-found' }
      }
      if (current.kind === 'blocked') {
        this.rollback()
        return {
          kind: 'blocked',
          code: current.reason === 'purged'
            ? 'compatibility-evidence-purged'
            : 'compatibility-evidence-corrupt',
        }
      }
      if (!canTransitionCompatibilityEvaluationLifecycle(
        current.record.lifecycleState,
        input.lifecycleState,
      )) {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-invalid-transition' }
      }
      const now = this.readEvidenceClock()
      this.database.prepare(`
        UPDATE compatibility_evaluation_evidence
        SET lifecycle_state = ?, updated_at = ?
        WHERE evaluation_id = ?
      `).run(input.lifecycleState, now, input.evaluationId)
      const receiptBytes = makeCompatibilityEvaluationEvidenceOperationReceipt({
        operationId: input.operationId,
        evaluationId: input.evaluationId,
        operation: 'transition',
        state: input.lifecycleState,
        occurredAt: now,
      })
      this.insertCompatibilityEvaluationOperation({
        operationId: input.operationId,
        evaluationId: input.evaluationId,
        operationType: 'transition',
        receiptBytes,
        createdAt: now,
      })
      this.database.exec('COMMIT')
      return {
        kind: 'completed',
        value: {
          evaluationId: input.evaluationId,
          operationId: input.operationId,
          previousState: current.record.lifecycleState,
          lifecycleState: input.lifecycleState,
        },
      }
    } catch (error) {
      if (this.database.isTransaction) this.rollback()
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return { kind: 'blocked', code: 'compatibility-evidence-unavailable' }
    }
  }

  private purgeCompatibilityEvaluationEvidence(input: {
    readonly evaluationId: string
    readonly operationId: string
  }): CompatibilityEvaluationEvidenceOperationResultV1<CompatibilityEvaluationEvidencePurgeResultV1> {
    this.assertOpen()
    this.assertStorageBoundary()
    if (!isCompatibilityEvaluationEvidenceOperationId(input.operationId)) {
      return { kind: 'blocked', code: 'compatibility-evidence-invalid' }
    }
    try {
      this.database.exec('BEGIN IMMEDIATE')
      const existingOperation = this.readCompatibilityEvaluationOperation(input.operationId)
      if (existingOperation !== undefined) {
        if (
          existingOperation.evaluationId !== input.evaluationId
          || existingOperation.operationType !== 'purge'
        ) {
          this.rollback()
          return { kind: 'blocked', code: 'compatibility-evidence-operation-conflict' }
        }
        const current = this.loadCompatibilityEvaluationEvidence(input.evaluationId)
        this.rollback()
        return current.kind === 'blocked' && current.reason === 'purged'
          ? {
            kind: 'replayed',
            value: {
              evaluationId: input.evaluationId,
              operationId: input.operationId,
              previousState: 'purged',
              lifecycleState: 'purged',
              purgedBytes: true,
            },
          }
          : { kind: 'blocked', code: 'compatibility-evidence-corrupt' }
      }
      const current = this.loadCompatibilityEvaluationEvidence(input.evaluationId)
      if (current.kind === 'not-found') {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-not-found' }
      }
      if (current.kind === 'blocked') {
        this.rollback()
        return {
          kind: 'blocked',
          code: current.reason === 'purged'
            ? 'compatibility-evidence-purged'
            : 'compatibility-evidence-corrupt',
        }
      }
      if (current.record.lifecycleState === 'legal-hold') {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-legal-hold' }
      }
      if (
        current.record.lifecycleState !== 'retention-expired'
        && current.record.lifecycleState !== 'deletion-pending'
      ) {
        this.rollback()
        return { kind: 'blocked', code: 'compatibility-evidence-invalid-transition' }
      }
      const now = this.readEvidenceClock()
      this.database.prepare(`
        UPDATE compatibility_evaluation_evidence
        SET evidence_bytes = '',
            matrix_bytes = '',
            revocation_source_bytes = '',
            lifecycle_state = 'purged',
            updated_at = ?
        WHERE evaluation_id = ?
      `).run(now, input.evaluationId)
      const exportReceipts = this.database.prepare(`
        SELECT operation_id, evaluation_id, receipt_bytes
        FROM compatibility_evaluation_operation_receipts
        WHERE evaluation_id = ? AND operation_type = 'export'
      `).all(input.evaluationId)
      const updateExportReceipt = this.database.prepare(`
        UPDATE compatibility_evaluation_operation_receipts
        SET receipt_bytes = ?
        WHERE operation_id = ? AND evaluation_id = ?
      `)
      for (const row of exportReceipts) {
        const operationId = rowString(row, 'operation_id')
        const evaluationId = rowString(row, 'evaluation_id')
        const receiptBytes = rowString(row, 'receipt_bytes')
        if (operationId === undefined || evaluationId === undefined || receiptBytes === undefined) {
          throw new Error('The export receipt is corrupt.')
        }
        let receipt: unknown
        try {
          receipt = JSON.parse(receiptBytes)
        } catch {
          throw new Error('The export receipt is corrupt.')
        }
        const receiptRecord = typeof receipt === 'object' && receipt !== null
          ? receipt as Record<string, unknown>
          : {}
        updateExportReceipt.run(
          JSON.stringify({
            receipt: receiptRecord.receipt ?? receipt,
            exportPurged: true,
          }),
          operationId,
          evaluationId,
        )
      }
      this.insertCompatibilityEvaluationOperation({
        operationId: input.operationId,
        evaluationId: input.evaluationId,
        operationType: 'purge',
        receiptBytes: makeCompatibilityEvaluationEvidenceOperationReceipt({
          operationId: input.operationId,
          evaluationId: input.evaluationId,
          operation: 'purge',
          state: 'purged',
          occurredAt: now,
        }),
        createdAt: now,
      })
      this.database.exec('COMMIT')
      return {
        kind: 'completed',
        value: {
          evaluationId: input.evaluationId,
          operationId: input.operationId,
          previousState: current.record.lifecycleState,
          lifecycleState: 'purged',
          purgedBytes: true,
        },
      }
    } catch (error) {
      if (this.database.isTransaction) this.rollback()
      if (error instanceof BusinessMatterEventStoreError) throw error
      this.assertStorageBoundary()
      return { kind: 'blocked', code: 'compatibility-evidence-unavailable' }
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (!this.database.isOpen) return
    if (this.database.isTransaction) {
      try {
        this.database.exec('ROLLBACK')
      } catch {
        // close_v2 remains the final rollback boundary.
      }
    }
    this.database.close()
  }
}

export function openBusinessMatterEventStore(
  input: OpenBusinessMatterEventStoreOptions,
): BusinessMatterEventStore {
  const options = snapshotOpenOptions(input)
  assertOpenOptions(options)
  const runtime = assertPinnedRuntime()
  let storage: PreparedBusinessMatterStorage | undefined
  let database: DatabaseSync | undefined
  try {
    storage = prepareBusinessMatterStorage(options)
    database = new DatabaseSync(storage.databasePath, {
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
      timeout: options.busyTimeoutMs,
      readBigInts: false,
      returnArrays: false,
      allowBareNamedParameters: false,
      allowUnknownNamedParameters: false,
    })
    const pinnedDatabase = runtimeDatabase(database)
    applyConnectionSecurity(pinnedDatabase)
    const openedLocation = database.location()
    if (
      openedLocation === null
      || resolve(openedLocation) !== storage.databasePath
    ) {
      throw storageBoundaryViolation(
        'path-replaced',
        'SQLite did not open the prepared database path.',
      )
    }
    assertPreparedStorageCurrent(storage)

    if (storage.databaseDisposition === 'created') {
      applyDurabilityPragmas(database, options.busyTimeoutMs)
      bootstrapSchema(database)
    } else {
      probeImmediateTransaction(database, storage.databaseDisposition)
      applyDurabilityPragmas(database, options.busyTimeoutMs)
    }

    if (!schemaMatches(readSchemaObjects(database))) {
      throw new BusinessMatterEventStoreError(
        'schema-mismatch',
        'The database schema does not match Sage v1 after bootstrap.',
      )
    }
    assertPreparedStorageCurrent(storage)
    const capabilities = readCapabilities(database, runtime, options)
    return new SqliteBusinessMatterEventStore(
      database,
      capabilities,
      options,
      storage,
    )
  } catch (error) {
    closeQuietly(database)
    // Never perform pathname cleanup from an open failure. SQLite may already
    // have observed the database or recovery sidecars, and unlinking here can
    // race another opener or delete a hot journal. Preserve the failed-open
    // state for explicit inspection or maintenance instead.
    if (error instanceof BusinessMatterEventStoreError) throw error
    if (isSqliteBusy(error)) {
      throw new BusinessMatterEventStoreError(
        'storage-busy',
        'The database is busy during open.',
      )
    }
    if (isSqliteCorrupt(error)) {
      throw new BusinessMatterEventStoreError(
        'schema-mismatch',
        'The database cannot be read as the Sage v1 schema.',
      )
    }
    throw new BusinessMatterEventStoreError(
      'io-unavailable',
      'The database could not be opened.',
    )
  }
}
