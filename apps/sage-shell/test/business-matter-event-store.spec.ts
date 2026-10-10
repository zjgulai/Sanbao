import { chmodSync } from 'node:fs'
import { access, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
  startAttempt,
  type BusinessMatter,
} from '../src/domain/business-matter.js'
import {
  encodeBusinessMatterEvents,
} from '../src/domain/business-matter-codec.js'
import {
  BusinessMatterEventStoreError,
  BUSINESS_MATTER_STORE_FILENAME,
  computeBusinessMatterAppendRequestFingerprint,
  computeBusinessMatterCommittedEventDigest,
  openBusinessMatterEventStore,
  type AppendRequest,
  type BusinessMatterEventStore,
  type BusinessMatterEventStoreErrorCode,
  type EncodedNewBusinessMatterEvent,
} from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const APPLICATION_ID = 0x53414745
const USER_VERSION = 1
const DEFAULT_MAX_STREAM_EVENTS = 32
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1024
const DEFAULT_BUSY_TIMEOUT_MS = 75
const RECORDED_AT = '2026-09-27T00:10:00Z'

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryDatabase(name = 'business-matter.sqlite3'): Promise<string> {
  const container = await mkdtemp(join(
    await realpath(tmpdir()),
    `sage-business-matter-store-${name.replace(/[^a-z0-9]+/giu, '-')}-`,
  ))
  const root = join(container, 'Sage')
  await mkdir(join(container, 'home'), { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), {
    mode: 0o700,
    recursive: true,
  })
  cleanups.push(() => rm(container, { force: true, recursive: true }))
  return join(root, 'data', 'business-matter', BUSINESS_MATTER_STORE_FILENAME)
}

function sagePathsForDatabase(databasePath: string) {
  const root = dirname(dirname(dirname(databasePath)))
  return resolveSagePaths({
    home: join(dirname(root), 'home'),
    root,
    platform: process.platform,
  })
}

function sequenceClock(...values: readonly string[]) {
  let calls = 0
  return {
    clock: () => {
      const value = values[Math.min(calls, values.length - 1)]
      calls += 1
      if (value === undefined) throw new Error('The test clock has no value.')
      return value
    },
    get calls() {
      return calls
    },
  }
}

function openTrackedStore(
  databasePath: string,
  overrides: Partial<Parameters<typeof openBusinessMatterEventStore>[0]> = {},
): BusinessMatterEventStore {
  const store = openBusinessMatterEventStore({
    sagePaths: sagePathsForDatabase(databasePath),
    maxStreamEvents: DEFAULT_MAX_STREAM_EVENTS,
    maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
    busyTimeoutMs: DEFAULT_BUSY_TIMEOUT_MS,
    clock: () => RECORDED_AT,
    ...overrides,
  })
  cleanups.push(() => store.close())
  return store
}

function createdMatter(matterId = 'matter:store-001'): BusinessMatter {
  return createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-09-27T00:00:00Z',
    goal: 'Prepare a reviewable draft.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
}

function matterWithEvidence(matterId = 'matter:store-001'): BusinessMatter {
  return enterEvidence(createdMatter(matterId), {
    eventId: `${matterId}:revision-1`,
    occurredAt: '2026-09-27T00:01:00Z',
    revisionId: 'revision:1',
    changeReason: 'Initial evidence.',
    scope: 'Draft only.',
    permissionBoundary: 'No publication.',
    dataDestination: 'Temporary test database.',
    evidence: [{
      evidenceId: 'evidence:brief',
      source: 'fixture:brief',
      observedAt: '2026-09-27T00:00:30Z',
      status: 'supported',
    }],
    unknowns: [],
    options: [],
    dependencies: [],
    experienceRefs: [],
    actionPolicies: [{
      actionScope: 'draft.prepare',
      effectClass: 'local-write',
      requiresDecision: false,
    }],
  })
}

const executionSnapshot = {
  provider: { identity: 'provider:p', version: '1', digest: 'sha256:p' },
  model: { identity: 'model:m', version: '1', digest: 'sha256:m' },
  agent: { identity: 'agent:a', version: '1', digest: 'sha256:a' },
  preset: { identity: 'preset:p', version: '1', digest: 'sha256:preset' },
  capabilities: [{ identity: 'capability:c', version: '1', digest: 'sha256:c' }],
}

const equivalent = {
  outcome: 'equivalent' as const,
  matrixId: 'matrix:1',
  reason: 'Equivalent.',
}

function matterWithAttempt(matterId = 'matter:store-001'): BusinessMatter {
  return startAttempt(matterWithEvidence(matterId), {
    eventId: `${matterId}:attempt-1`,
    occurredAt: '2026-09-27T00:02:00Z',
    attemptId: 'attempt:1',
    revisionId: 'revision:1',
    actionScopes: ['draft.prepare'],
    decisionIds: [],
    executionSnapshot,
    compatibility: equivalent,
  })
}

function asNewEvents(
  matter: BusinessMatter,
  startIndex = 0,
): readonly EncodedNewBusinessMatterEvent[] {
  return encodeBusinessMatterEvents(matter).slice(startIndex).map((event) => ({
    matterId: event.matterId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    occurredAt: event.occurredAt,
    payloadBytes: event.payloadBytes.slice(),
  }))
}

function appendRequest(
  matter: BusinessMatter,
  appendId: string,
  startIndex = 0,
): AppendRequest {
  return {
    matterId: matter.events[0]!.matterId,
    expectedVersion: startIndex === 0
      ? { kind: 'not-exists' }
      : { kind: 'exact', value: startIndex },
    appendId,
    events: asNewEvents(matter, startIndex),
  }
}

function expectStoreError(
  action: () => unknown,
  code: BusinessMatterEventStoreErrorCode,
): BusinessMatterEventStoreError {
  try {
    action()
  } catch (error) {
    if (!(error instanceof BusinessMatterEventStoreError)) throw error
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`Expected BusinessMatterEventStoreError(${code})`)
}

function withDatabase<T>(databasePath: string, action: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath)
  try {
    return action(database)
  } finally {
    database.close()
    chmodSync(databasePath, 0o600)
  }
}

function rowCount(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    readonly count: number
  }
  return row.count
}

function expectEmptyAuthorityTables(databasePath: string): void {
  withDatabase(databasePath, (database) => {
    expect(rowCount(database, 'business_matter_streams')).toBe(0)
    expect(rowCount(database, 'business_matter_events')).toBe(0)
    expect(rowCount(database, 'business_matter_appends')).toBe(0)
  })
}

// WT-02A.2 is deliberately single-connection. Sequential read-only SQL inspection below
// happens only after the store closes. Simultaneous connections, real SQLITE_BUSY,
// fault injection, ACK loss, kill/reopen, path attacks and disk tampering belong to WT-02A.3.
describe('BusinessMatter WT-02A.2 file-backed SQLite event store', () => {
  it('bootstraps the exact schema and reports pinned runtime, PRAGMA and security capabilities', async () => {
    const databasePath = await temporaryDatabase()
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })

    expect(store.capabilities).toEqual({
      runtime: {
        electron: '43.3.0',
        node: '24.18.1',
        sqlite: '3.53.1',
      },
      schema: {
        applicationId: APPLICATION_ID,
        userVersion: USER_VERSION,
      },
      pragmas: {
        journalMode: 'delete',
        synchronous: 3,
        foreignKeys: 1,
        trustedSchema: 0,
        fullfsync: 1,
        busyTimeoutMs: DEFAULT_BUSY_TIMEOUT_MS,
      },
      security: {
        defensive: true,
        extensionLoading: false,
      },
      limits: {
        maxStreamEvents: DEFAULT_MAX_STREAM_EVENTS,
        maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
      },
    })
    expect(clock.calls).toBe(0)

    store.close()
    withDatabase(databasePath, (database) => {
      expect(database.prepare('PRAGMA application_id').get()).toEqual({
        application_id: APPLICATION_ID,
      })
      expect(database.prepare('PRAGMA user_version').get()).toEqual({
        user_version: USER_VERSION,
      })
      expect(database.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' })
      expect(database.prepare('SELECT sqlite_version() AS version').get()).toEqual({
        version: '3.53.1',
      })
      expect(database.prepare(`
        SELECT name, strict
        FROM pragma_table_list
        WHERE schema = 'main' AND name LIKE 'business_matter_%'
        ORDER BY name
      `).all()).toEqual([
        { name: 'business_matter_appends', strict: 1 },
        { name: 'business_matter_events', strict: 1 },
        { name: 'business_matter_streams', strict: 1 },
      ])
      expect(database.prepare(`
        SELECT name
        FROM pragma_table_info('business_matter_events')
        ORDER BY cid
      `).all()).toEqual([
        { name: 'matter_id' },
        { name: 'stream_version' },
        { name: 'event_id' },
        { name: 'event_type' },
        { name: 'event_schema_version' },
        { name: 'occurred_at' },
        { name: 'recorded_at' },
        { name: 'payload_bytes' },
        { name: 'previous_digest' },
        { name: 'event_digest' },
      ])
    })
  })

  it.each([
    ['existing blank database', (_database: DatabaseSync): void => {}],
    ['foreign application id', (database: DatabaseSync) => {
      database.exec('PRAGMA application_id = 1; PRAGMA user_version = 1;')
    }],
    ['future user version', (database: DatabaseSync) => {
      database.exec(`PRAGMA application_id = ${APPLICATION_ID}; PRAGMA user_version = 2;`)
    }],
    ['claimed identity with a mismatched schema', (database: DatabaseSync) => {
      database.exec(`
        CREATE TABLE business_matter_streams (matter_id TEXT PRIMARY KEY) STRICT;
        PRAGMA application_id = ${APPLICATION_ID};
        PRAGMA user_version = ${USER_VERSION};
      `)
    }],
  ] as const)('fails closed for %s', async (_name, prepare) => {
    const databasePath = await temporaryDatabase()
    withDatabase(databasePath, prepare)

    expectStoreError(() => openBusinessMatterEventStore({
      sagePaths: sagePathsForDatabase(databasePath),
      maxStreamEvents: DEFAULT_MAX_STREAM_EVENTS,
      maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
      busyTimeoutMs: DEFAULT_BUSY_TIMEOUT_MS,
      clock: () => RECORDED_AT,
    }), 'schema-mismatch')
  })

  it('rejects a foreign WAL database without changing its journal mode', async () => {
    const databasePath = await temporaryDatabase()
    withDatabase(databasePath, (database) => {
      expect(database.prepare('PRAGMA journal_mode = WAL').get()).toEqual({
        journal_mode: 'wal',
      })
      database.exec('PRAGMA application_id = 1; PRAGMA user_version = 1;')
    })

    expectStoreError(() => openBusinessMatterEventStore({
      sagePaths: sagePathsForDatabase(databasePath),
      maxStreamEvents: DEFAULT_MAX_STREAM_EVENTS,
      maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
      busyTimeoutMs: DEFAULT_BUSY_TIMEOUT_MS,
      clock: () => RECORDED_AT,
    }), 'schema-mismatch')

    withDatabase(databasePath, (database) => {
      expect(database.prepare('PRAGMA journal_mode').get()).toEqual({
        journal_mode: 'wal',
      })
    })
  })

  it('appends, closes, reopens and strictly loads a real file-backed stream', async () => {
    const databasePath = await temporaryDatabase()
    const matter = matterWithEvidence()
    const clock = sequenceClock(RECORDED_AT)
    const first = openTrackedStore(databasePath, { clock: clock.clock })

    expect(first.load('matter:missing')).toEqual({ kind: 'not-found' })
    expect(first.append(appendRequest(matter, 'append:create'))).toEqual({
      kind: 'appended',
      firstVersion: 1,
      lastVersion: 2,
    })
    expect(clock.calls).toBe(1)
    first.close()

    const reopened = openTrackedStore(databasePath)
    const loaded = reopened.load('matter:store-001')
    expect(loaded.kind).toBe('loaded')
    if (loaded.kind !== 'loaded') throw new Error('Expected a loaded matter.')
    expect(loaded.version).toBe(2)
    expect(loaded.matter.events).toEqual(matter.events)
    expect(projectBusinessMatter(loaded.matter)).toEqual(projectBusinessMatter(matter))
    reopened.close()

    withDatabase(databasePath, (database) => {
      const rows = database.prepare(`
        SELECT stream_version, recorded_at, payload_bytes
        FROM business_matter_events
        ORDER BY stream_version
      `).all() as Array<{
        readonly stream_version: number
        readonly recorded_at: string
        readonly payload_bytes: Uint8Array
      }>
      expect(rows.map((row) => row.stream_version)).toEqual([1, 2])
      expect(rows.map((row) => row.recorded_at)).toEqual([RECORDED_AT, RECORDED_AT])
      expect(rows.map((row) => [...row.payload_bytes])).toEqual(
        encodeBusinessMatterEvents(matter).map((event) => [...event.payloadBytes]),
      )
    })
  })

  it('enforces CAS, append idempotency, event identity and one clock read per new batch', async () => {
    const databasePath = await temporaryDatabase()
    const initial = matterWithEvidence()
    const attempted = matterWithAttempt()
    const create = appendRequest(initial, 'append:create')
    const attempt = appendRequest(attempted, 'append:attempt', initial.events.length)
    const clock = sequenceClock(
      '2026-09-27T00:10:00Z',
      '2026-09-27T00:11:00Z',
    )
    const store = openTrackedStore(databasePath, { clock: clock.clock })

    expect(store.append(create)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })
    expect(store.append(create)).toEqual({
      kind: 'replayed', firstVersion: 1, lastVersion: 2,
    })
    expect(clock.calls).toBe(1)

    expect(store.append({
      ...attempt,
      expectedVersion: { kind: 'exact', value: 1 },
    })).toEqual({ kind: 'version-conflict', actualVersion: 2 })
    expect(clock.calls).toBe(1)

    expect(store.append(attempt)).toEqual({
      kind: 'appended', firstVersion: 3, lastVersion: 3,
    })
    expect(clock.calls).toBe(2)
    expect(store.append(create)).toEqual({
      kind: 'replayed', firstVersion: 1, lastVersion: 2,
    })
    expect(store.append({ ...create, events: create.events.slice(0, 1) })).toEqual({
      kind: 'idempotency-conflict',
    })
    expect(store.append({
      matterId: create.matterId,
      expectedVersion: { kind: 'exact', value: 3 },
      appendId: 'append:duplicate-event',
      events: [create.events[0]!],
    })).toEqual({ kind: 'duplicate-event-id' })
    expect(store.append({
      ...attempt,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:not-exists-conflict',
    })).toEqual({ kind: 'version-conflict', actualVersion: 3 })

    const other = createdMatter('matter:absent')
    expect(store.append({
      ...appendRequest(other, 'append:absent-exact'),
      expectedVersion: { kind: 'exact', value: 1 },
    })).toEqual({ kind: 'version-conflict', actualVersion: null })
    expect(clock.calls).toBe(2)

    store.close()
    withDatabase(databasePath, (database) => {
      expect(rowCount(database, 'business_matter_streams')).toBe(1)
      expect(rowCount(database, 'business_matter_events')).toBe(3)
      expect(rowCount(database, 'business_matter_appends')).toBe(2)
      expect(database.prepare(`
        SELECT current_version FROM business_matter_streams WHERE matter_id = ?
      `).get('matter:store-001')).toEqual({ current_version: 3 })
    })
  })

  it('pins v1 request fingerprint and committed-event digest framing with golden vectors', async () => {
    const databasePath = await temporaryDatabase()
    const golden = createBusinessMatter({
      matterId: 'matter:golden',
      eventId: 'event:create',
      occurredAt: '2026-09-27T00:00:00Z',
      goal: 'golden',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    })
    const [event] = asNewEvents(golden)
    if (event === undefined) throw new Error('Expected a golden event.')
    expect(new TextDecoder().decode(event.payloadBytes)).toBe(
      '{"type":"matter-created","eventId":"event:create","matterId":"matter:golden","occurredAt":"2026-09-27T00:00:00Z","goal":"golden","responsibleParty":{"kind":"human","roleRef":"role:owner"}}',
    )
    const request: AppendRequest = {
      matterId: 'matter:golden',
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:golden-a',
      events: [event],
    }
    const fingerprint = computeBusinessMatterAppendRequestFingerprint(request)
    expect(Buffer.from(fingerprint).toString('hex')).toBe(
      'daaeb8cfb4ab215f4658ad1501dc989269a41ed9cba028f92373591983485d7a',
    )
    expect(computeBusinessMatterAppendRequestFingerprint({
      ...request,
      appendId: 'append:golden-b',
    })).toEqual(fingerprint)

    const recordedAt = '2026-09-27T00:00:01Z'
    const digest = computeBusinessMatterCommittedEventDigest({
      ...event,
      streamVersion: 1,
      recordedAt,
      previousDigest: null,
    })
    expect(Buffer.from(digest).toString('hex')).toBe(
      '1cd8f929a096b8d64603ea4b963d1eed7dd386d644e0a8b3a448c8166bf58c88',
    )

    const store = openTrackedStore(databasePath, { clock: () => recordedAt })
    expect(store.append(request)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 1,
    })
    store.close()
    withDatabase(databasePath, (database) => {
      const append = database.prepare(`
        SELECT request_fingerprint FROM business_matter_appends
      `).get() as { readonly request_fingerprint: Uint8Array }
      const committed = database.prepare(`
        SELECT previous_digest, event_digest FROM business_matter_events
      `).get() as {
        readonly previous_digest: Uint8Array | null
        readonly event_digest: Uint8Array
      }
      expect(Buffer.from(append.request_fingerprint).toString('hex')).toBe(
        'daaeb8cfb4ab215f4658ad1501dc989269a41ed9cba028f92373591983485d7a',
      )
      expect(committed.previous_digest).toBeNull()
      expect(Buffer.from(committed.event_digest).toString('hex')).toBe(
        '1cd8f929a096b8d64603ea4b963d1eed7dd386d644e0a8b3a448c8166bf58c88',
      )
    })
  })

  it('classifies malformed candidates as invalid-request and leaves every authority table untouched', async () => {
    const databasePath = await temporaryDatabase()
    const matter = createdMatter()
    const [event] = asNewEvents(matter)
    if (event === undefined) throw new Error('Expected a candidate event.')
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })

    expect(store.append({
      matterId: 'matter:store-001',
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:empty',
      events: [],
    })).toEqual({ kind: 'invalid-request', reason: 'empty-events' })
    expect(store.append({
      matterId: 'matter:store-001',
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:invalid-payload',
      events: [{ ...event, payloadBytes: new TextEncoder().encode('{') }],
    })).toMatchObject({
      kind: 'invalid-request',
      reason: 'invalid-payload',
      diagnostic: {
        eventIndex: 0,
        eventId: event.eventId,
        field: 'payloadBytes',
      },
    })
    expect(store.append({
      matterId: 'matter:other',
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:matter-mismatch',
      events: [event],
    })).toMatchObject({
      kind: 'invalid-request',
      reason: 'matter-identity-mismatch',
      diagnostic: { eventIndex: 0, eventId: event.eventId, field: 'matterId' },
    })
    expect(store.append({
      matterId: 'matter:store-001',
      expectedVersion: { kind: 'not-exists' },
      appendId: 'append:duplicate-in-batch',
      events: [event, event],
    })).toMatchObject({
      kind: 'invalid-request',
      reason: 'duplicate-event-id',
      diagnostic: { eventIndex: 1, eventId: event.eventId, field: 'eventId' },
    })
    expect(clock.calls).toBe(0)

    store.close()
    expectEmptyAuthorityTables(databasePath)
  })

  it('turns hostile request containers into typed invalid-request results without invoking accessors', async () => {
    const databasePath = await temporaryDatabase('hostile-request.sqlite3')
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })
    const valid = appendRequest(
      createdMatter('matter:hostile-request'),
      'append:hostile-request',
    )

    const revokedRequest = Proxy.revocable(valid, {})
    revokedRequest.revoke()
    expect(store.append(revokedRequest.proxy)).toMatchObject({
      kind: 'invalid-request',
    })

    let getterCalls = 0
    const throwingGetter = {
      matterId: valid.matterId,
      expectedVersion: valid.expectedVersion,
      appendId: 'append:throwing-getter',
      get events(): never {
        getterCalls += 1
        throw new Error('untrusted request getter executed')
      },
    }
    expect(store.append(throwingGetter)).toMatchObject({
      kind: 'invalid-request',
    })
    expect(getterCalls).toBe(0)

    expect(store.append({
      ...valid,
      appendId: 'append:non-array-events',
      events: { length: 1 } as never,
    })).toMatchObject({
      kind: 'invalid-request',
    })
    expect(clock.calls).toBe(0)
  })

  it('turns hostile events containers into invalid-request without invoking index accessors', async () => {
    const databasePath = await temporaryDatabase('revoked-events.sqlite3')
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })
    const valid = appendRequest(
      createdMatter('matter:revoked-events'),
      'append:revoked-events',
    )
    const revokedEvents = Proxy.revocable([...valid.events], {})
    revokedEvents.revoke()

    expect(store.append({
      ...valid,
      events: revokedEvents.proxy,
    })).toMatchObject({
      kind: 'invalid-request',
    })

    let indexGetterCalls = 0
    const accessorEvents = new Array<EncodedNewBusinessMatterEvent>(1)
    Object.defineProperty(accessorEvents, 0, {
      configurable: true,
      enumerable: true,
      get(): never {
        indexGetterCalls += 1
        throw new Error('untrusted events index getter executed')
      },
    })
    expect(store.append({
      ...valid,
      appendId: 'append:index-accessor',
      events: accessorEvents,
    })).toMatchObject({
      kind: 'invalid-request',
    })
    expect(indexGetterCalls).toBe(0)
    expect(clock.calls).toBe(0)
  })

  it('rejects Uint8Array instances with hostile slice or byteLength shadows without writes or clock reads', async () => {
    const databasePath = await temporaryDatabase('hostile-payload-slice.sqlite3')
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })
    const valid = appendRequest(
      createdMatter('matter:hostile-payload-slice'),
      'append:hostile-payload-slice',
    )
    const [event] = valid.events
    if (event === undefined) throw new Error('Expected a candidate event.')

    const throwingPayload = event.payloadBytes.slice()
    Object.defineProperty(throwingPayload, 'slice', {
      configurable: true,
      value: (): never => {
        throw new Error('untrusted Uint8Array.slice executed')
      },
    })
    expect.soft(store.append({
      ...valid,
      appendId: 'append:throwing-payload-slice',
      events: [{ ...event, payloadBytes: throwingPayload }],
    })).toMatchObject({
      kind: 'invalid-request',
    })

    const nonBytesPayload = event.payloadBytes.slice()
    Object.defineProperty(nonBytesPayload, 'slice', {
      configurable: true,
      value: () => ({ not: 'bytes' }),
    })
    let nonBytesResult: ReturnType<BusinessMatterEventStore['append']> | undefined
    expect.soft(() => {
      nonBytesResult = store.append({
        ...valid,
        appendId: 'append:non-bytes-payload-slice',
        events: [{ ...event, payloadBytes: nonBytesPayload }],
      })
    }).not.toThrow()
    expect.soft(nonBytesResult).toMatchObject({
      kind: 'invalid-request',
    })
    expect.soft(clock.calls).toBe(0)

    store.close()
    expect.soft(withDatabase(databasePath, (database) => ({
      appends: rowCount(database, 'business_matter_appends'),
      events: rowCount(database, 'business_matter_events'),
      streams: rowCount(database, 'business_matter_streams'),
    }))).toEqual({ appends: 0, events: 0, streams: 0 })

    const shadowDatabasePath = await temporaryDatabase('shadowed-byte-length.sqlite3')
    const shadowClock = sequenceClock(RECORDED_AT)
    const maxPayloadBytes = event.payloadBytes.byteLength - 1
    const shadowStore = openTrackedStore(shadowDatabasePath, {
      maxPayloadBytes,
      clock: shadowClock.clock,
    })
    const shadowedPayload = event.payloadBytes.slice()
    Object.defineProperty(shadowedPayload, 'byteLength', {
      configurable: true,
      value: 0,
    })
    expect(shadowedPayload).toBeInstanceOf(Uint8Array)
    expect(shadowedPayload.byteLength).toBe(0)
    expect(Uint8Array.prototype.slice.call(shadowedPayload).byteLength).toBeGreaterThan(
      maxPayloadBytes,
    )

    expect.soft(shadowStore.append({
      ...valid,
      appendId: 'append:shadowed-byte-length',
      events: [{ ...event, payloadBytes: shadowedPayload }],
    })).toMatchObject({
      kind: 'invalid-request',
      reason: 'payload-too-large',
      diagnostic: {
        eventIndex: 0,
        eventId: event.eventId,
        field: 'payloadBytes',
        actual: event.payloadBytes.byteLength,
        limit: maxPayloadBytes,
      },
    })
    expect.soft(shadowClock.calls).toBe(0)
    shadowStore.close()
    expect.soft(withDatabase(shadowDatabasePath, (database) => ({
      appends: rowCount(database, 'business_matter_appends'),
      events: rowCount(database, 'business_matter_events'),
      streams: rowCount(database, 'business_matter_streams'),
    }))).toEqual({ appends: 0, events: 0, streams: 0 })
  })

  it('rejects an impossible exact version before reading, cloning or hashing events', async () => {
    const databasePath = await temporaryDatabase('impossible-version.sqlite3')
    const clock = sequenceClock(RECORDED_AT)
    const store = openTrackedStore(databasePath, { clock: clock.clock })
    const valid = appendRequest(
      createdMatter('matter:impossible-version'),
      'append:impossible-version',
    )
    let eventReads = 0
    const observedEvents = new Proxy([...valid.events], {
      get(): never {
        eventReads += 1
        throw new Error('events were read before the expected-version limit check')
      },
    })

    expect(store.append({
      ...valid,
      expectedVersion: {
        kind: 'exact',
        value: DEFAULT_MAX_STREAM_EVENTS + 1,
      },
      events: observedEvents,
    })).toMatchObject({
      kind: 'invalid-request',
      reason: 'stream-too-large',
      diagnostic: {
        field: 'expectedVersion.value',
        actual: DEFAULT_MAX_STREAM_EVENTS + 1,
        limit: DEFAULT_MAX_STREAM_EVENTS,
      },
    })
    expect(eventReads).toBe(0)
    expect(clock.calls).toBe(0)
  })

  it('validates the persisted stream before replaying an append ledger entry', async () => {
    const databasePath = await temporaryDatabase('corrupt-replay.sqlite3')
    const matter = matterWithEvidence('matter:corrupt-replay')
    const request = appendRequest(matter, 'append:corrupt-replay')
    const writer = openTrackedStore(databasePath)
    expect(writer.append(request)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })
    writer.close()

    withDatabase(databasePath, (database) => {
      const update = database.prepare(`
        UPDATE business_matter_events
        SET event_digest = zeroblob(32)
        WHERE matter_id = ? AND stream_version = 1
      `).run(matter.events[0]!.matterId)
      expect(update.changes).toBe(1)
    })

    const replayClock = sequenceClock('2026-09-27T00:20:00Z')
    const reopened = openTrackedStore(databasePath, { clock: replayClock.clock })
    expect(reopened.load('matter:corrupt-replay')).toMatchObject({
      kind: 'blocked',
      reason: 'corrupt',
      diagnostic: { eventIndex: 0, streamVersion: 1, field: 'eventDigest' },
    })
    expect(reopened.append(request)).toMatchObject({
      kind: 'blocked',
      reason: 'corrupt',
    })
    expect(replayClock.calls).toBe(0)
  })

  it('preflights candidate and stored stream resource limits with named coordinates and zero writes', async () => {
    const payloadDatabase = await temporaryDatabase('payload.sqlite3')
    const matter = createdMatter('matter:payload-limit')
    const [event] = asNewEvents(matter)
    if (event === undefined) throw new Error('Expected a candidate event.')
    const payloadClock = sequenceClock(RECORDED_AT)
    const payloadStore = openTrackedStore(payloadDatabase, {
      maxPayloadBytes: event.payloadBytes.byteLength - 1,
      clock: payloadClock.clock,
    })
    expect(payloadStore.append(appendRequest(matter, 'append:payload-limit'))).toMatchObject({
      kind: 'invalid-request',
      reason: 'payload-too-large',
      diagnostic: { eventIndex: 0, eventId: event.eventId, field: 'payloadBytes' },
    })
    expect(payloadClock.calls).toBe(0)
    payloadStore.close()
    expectEmptyAuthorityTables(payloadDatabase)

    const countDatabase = await temporaryDatabase('count.sqlite3')
    const twoEvents = matterWithEvidence('matter:count-limit')
    const countClock = sequenceClock(RECORDED_AT)
    const countStore = openTrackedStore(countDatabase, {
      maxStreamEvents: 1,
      clock: countClock.clock,
    })
    expect(countStore.append(appendRequest(twoEvents, 'append:count-limit'))).toMatchObject({
      kind: 'invalid-request',
      reason: 'stream-too-large',
      diagnostic: {
        eventIndex: 1,
        eventId: twoEvents.events[1]!.eventId,
        field: 'streamVersion',
      },
    })
    expect(countClock.calls).toBe(0)
    countStore.close()
    expectEmptyAuthorityTables(countDatabase)

    const storedDatabase = await temporaryDatabase('stored-limit.sqlite3')
    const writer = openTrackedStore(storedDatabase)
    expect(writer.append(appendRequest(twoEvents, 'append:stored'))).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })
    writer.close()

    const blockedClock = sequenceClock('2026-09-27T00:20:00Z')
    const constrained = openTrackedStore(storedDatabase, {
      maxStreamEvents: 1,
      clock: blockedClock.clock,
    })
    expect(constrained.load('matter:count-limit')).toMatchObject({
      kind: 'blocked',
      reason: 'stream-too-large',
      diagnostic: {
        eventIndex: 1,
        streamVersion: 2,
        eventId: twoEvents.events[1]!.eventId,
      },
    })
    const attempted = matterWithAttempt('matter:count-limit')
    expect(constrained.append(appendRequest(
      attempted,
      'append:blocked-current-stream',
      twoEvents.events.length,
    ))).toMatchObject({
      kind: 'blocked',
      reason: 'stream-too-large',
      diagnostic: { eventIndex: 1, streamVersion: 2 },
    })
    expect(blockedClock.calls).toBe(0)
    constrained.close()

    withDatabase(storedDatabase, (database) => {
      expect(rowCount(database, 'business_matter_streams')).toBe(1)
      expect(rowCount(database, 'business_matter_events')).toBe(2)
      expect(rowCount(database, 'business_matter_appends')).toBe(1)
    })
  })

  it('validates configuration before creating a file and enforces close and clock lifecycle', async () => {
    const invalidConfigPath = await temporaryDatabase('invalid-config.sqlite3')
    expectStoreError(() => openBusinessMatterEventStore({
      sagePaths: sagePathsForDatabase(invalidConfigPath),
      maxStreamEvents: 0,
      maxPayloadBytes: DEFAULT_MAX_PAYLOAD_BYTES,
      busyTimeoutMs: DEFAULT_BUSY_TIMEOUT_MS,
      clock: () => RECORDED_AT,
    }), 'invalid-config')
    await expect(access(invalidConfigPath)).rejects.toThrow()

    const closedPath = await temporaryDatabase('closed.sqlite3')
    const closed = openTrackedStore(closedPath)
    closed.close()
    closed.close()
    expectStoreError(() => closed.load('matter:any'), 'store-closed')
    expectStoreError(() => closed.append(appendRequest(
      createdMatter('matter:closed'),
      'append:closed',
    )), 'store-closed')

    const invalidClockPath = await temporaryDatabase('invalid-clock.sqlite3')
    const clock = sequenceClock('not-a-utc-timestamp')
    const invalidClock = openTrackedStore(invalidClockPath, { clock: clock.clock })
    expectStoreError(() => invalidClock.append(appendRequest(
      createdMatter('matter:invalid-clock'),
      'append:invalid-clock',
    )), 'invalid-clock')
    expect(clock.calls).toBe(1)
    expect(invalidClock.load('matter:invalid-clock')).toEqual({ kind: 'not-found' })
    invalidClock.close()
    expectEmptyAuthorityTables(invalidClockPath)
  })

  it('reads the committed revision-entered digest from the validated chain and isolates revisions', async () => {
    const databasePath = await temporaryDatabase('revision-digest.sqlite3')
    const first = openTrackedStore(databasePath)
    const matterA = matterWithEvidence('matter:digest-a')
    const matterB = matterWithEvidence('matter:digest-b')
    expect(first.append(appendRequest(matterA, 'append:digest-a'))).toEqual({
      kind: 'appended',
      firstVersion: 1,
      lastVersion: 2,
    })
    expect(first.append(appendRequest(matterB, 'append:digest-b'))).toEqual({
      kind: 'appended',
      firstVersion: 1,
      lastVersion: 2,
    })

    const digestA = first.readRevisionDigest('matter:digest-a', 'revision:1')
    const digestB = first.readRevisionDigest('matter:digest-b', 'revision:1')
    expect(digestA).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(digestB).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(digestA).not.toEqual(digestB)
    // Same revision id, same matter: the answer is stable within the session.
    expect(first.readRevisionDigest('matter:digest-a', 'revision:1')).toEqual(digestA)
    // Unknown revision inside an existing matter, and unknown matter, stay undefined.
    expect(first.readRevisionDigest('matter:digest-a', 'revision:absent')).toBeUndefined()
    expect(first.readRevisionDigest('matter:absent', 'revision:1')).toBeUndefined()
    first.close()

    // Reopen: the same committed digest comes back from the persisted chain.
    const reopened = openTrackedStore(databasePath)
    expect(reopened.readRevisionDigest('matter:digest-a', 'revision:1')).toEqual(digestA)
    expect(reopened.readRevisionDigest('matter:digest-b', 'revision:1')).toEqual(digestB)

    // A committed event that the digest chain does not verify is a boundary violation, never
    // a settled answer from unvalidated bytes.
    reopened.close()
    withDatabase(databasePath, (database) => {
      const update = database.prepare(`
        UPDATE business_matter_events
        SET event_digest = zeroblob(32)
        WHERE matter_id = ? AND stream_version = 2
      `).run('matter:digest-a')
      expect(update.changes).toBe(1)
    })
    const guarded = openTrackedStore(databasePath)
    expectStoreError(
      () => guarded.readRevisionDigest('matter:digest-a', 'revision:1'),
      'storage-boundary-violation',
    )
    guarded.close()
  })
})
