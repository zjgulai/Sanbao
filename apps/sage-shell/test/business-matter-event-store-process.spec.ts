import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { chmodSync, existsSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync, StatementSync, type SQLInputValue } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createBusinessMatter,
  enterEvidence,
  startAttempt,
  type BusinessMatter,
} from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import {
  BusinessMatterEventStoreError,
  BUSINESS_MATTER_STORE_FILENAME,
  computeBusinessMatterCommittedEventDigest,
  openBusinessMatterEventStore,
  type AppendRequest,
  type BusinessMatterEventStore,
  type EncodedNewBusinessMatterEvent,
} from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const RECORDED_AT = '2026-09-27T00:10:00Z'
const CHILD_SCENARIO = process.env.SAGE_STORE_CHILD_SCENARIO
const PROCESS_SPEC_PATH = fileURLToPath(import.meta.url)
const require = createRequire(import.meta.url)
const VITEST_PATH = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const DEFAULT_OPTIONS = {
  maxStreamEvents: 32,
  maxPayloadBytes: 64 * 1024,
  busyTimeoutMs: 25,
  clock: () => RECORDED_AT,
} as const

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryDatabase(name: string): Promise<string> {
  const container = await mkdtemp(join(
    await realpath(tmpdir()),
    `sage-business-matter-process-${name.replace(/[^a-z0-9]+/giu, '-')}-`,
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

function openTrackedStore(
  databasePath: string,
  overrides: Partial<Parameters<typeof openBusinessMatterEventStore>[0]> = {},
): BusinessMatterEventStore {
  const store = openBusinessMatterEventStore({
    sagePaths: sagePathsForDatabase(databasePath),
    ...DEFAULT_OPTIONS,
    ...overrides,
  })
  cleanups.push(() => store.close())
  return store
}

function createdMatter(matterId: string): BusinessMatter {
  return createBusinessMatter({
    matterId,
    eventId: `${matterId}:created`,
    occurredAt: '2026-09-27T00:00:00Z',
    goal: 'Prepare a reviewable draft.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
}

function matterWithEvidence(matterId: string): BusinessMatter {
  return enterEvidence(createdMatter(matterId), {
    eventId: `${matterId}:revision-1`,
    occurredAt: '2026-09-27T00:01:00Z',
    revisionId: 'revision:1',
    changeReason: 'Initial evidence.',
    scope: 'Draft only.',
    permissionBoundary: 'No publication.',
    dataDestination: 'Temporary process-test database.',
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

function matterWithAttempt(matterId: string): BusinessMatter {
  return startAttempt(matterWithEvidence(matterId), {
    eventId: `${matterId}:attempt-1`,
    occurredAt: '2026-09-27T00:02:00Z',
    attemptId: 'attempt:1',
    revisionId: 'revision:1',
    actionScopes: ['draft.prepare'],
    decisionIds: [],
    executionSnapshot: {
      provider: { identity: 'provider:p', version: '1', digest: 'sha256:p' },
      model: { identity: 'model:m', version: '1', digest: 'sha256:m' },
      agent: { identity: 'agent:a', version: '1', digest: 'sha256:a' },
      preset: { identity: 'preset:p', version: '1', digest: 'sha256:preset' },
      capabilities: [{ identity: 'capability:c', version: '1', digest: 'sha256:c' }],
    },
    compatibility: {
      outcome: 'equivalent',
      matrixId: 'matrix:1',
      reason: 'Equivalent.',
    },
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

function withDatabase<T>(databasePath: string, action: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(databasePath)
  try {
    return action(database)
  } finally {
    database.close()
    chmodSync(databasePath, 0o600)
  }
}

function authorityCounts(databasePath: string): {
  readonly streams: number
  readonly events: number
  readonly appends: number
} {
  return withDatabase(databasePath, (database) => {
    const count = (table: string) => {
      const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        readonly count: number
      }
      return row.count
    }
    return {
      streams: count('business_matter_streams'),
      events: count('business_matter_events'),
      appends: count('business_matter_appends'),
    }
  })
}

function authorityRawSnapshot(databasePath: string): {
  readonly streams: readonly Record<string, unknown>[]
  readonly events: readonly Record<string, unknown>[]
  readonly appends: readonly Record<string, unknown>[]
} {
  return withDatabase(databasePath, (database) => ({
    streams: database.prepare(`
      SELECT
        matter_id,
        current_version,
        hex(head_digest) AS head_digest_hex,
        created_at,
        updated_at
      FROM business_matter_streams
      ORDER BY matter_id
    `).all(),
    events: database.prepare(`
      SELECT
        matter_id,
        stream_version,
        event_id,
        event_type,
        event_schema_version,
        occurred_at,
        recorded_at,
        hex(payload_bytes) AS payload_bytes_hex,
        CASE
          WHEN previous_digest IS NULL THEN NULL
          ELSE hex(previous_digest)
        END AS previous_digest_hex,
        hex(event_digest) AS event_digest_hex
      FROM business_matter_events
      ORDER BY matter_id, stream_version
    `).all(),
    appends: database.prepare(`
      SELECT
        matter_id,
        append_id,
        hex(request_fingerprint) AS request_fingerprint_hex,
        first_version,
        last_version,
        committed_at
      FROM business_matter_appends
      ORDER BY matter_id, append_id
    `).all(),
  }))
}

function expectStoreClosed(action: () => unknown): void {
  try {
    action()
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessMatterEventStoreError)
    expect((error as BusinessMatterEventStoreError).code).toBe('store-closed')
    return
  }
  throw new Error('Expected the quarantined store to reject access as store-closed.')
}

function requiredChildEnvironment(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing child environment ${name}.`)
  }
  return value
}

function waitForGateSync(gatePath: string, timeoutMs = 10_000): void {
  const deadline = Date.now() + timeoutMs
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT))
  while (!existsSync(gatePath)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${gatePath}.`)
    Atomics.wait(sleeper, 0, 0, 10)
  }
}

function signalReadyAndWait(): void {
  writeFileSync(requiredChildEnvironment('SAGE_STORE_READY_FILE'), `${process.pid}\n`, {
    flag: 'wx',
  })
  waitForGateSync(requiredChildEnvironment('SAGE_STORE_GO_FILE'))
}

function childRequest(): AppendRequest {
  const matterId = requiredChildEnvironment('SAGE_STORE_MATTER_ID')
  const appendId = requiredChildEnvironment('SAGE_STORE_APPEND_ID')
  const requestKind = requiredChildEnvironment('SAGE_STORE_REQUEST_KIND')
  if (requestKind === 'create') {
    return appendRequest(matterWithEvidence(matterId), appendId)
  }
  if (requestKind === 'attempt') {
    const initial = matterWithEvidence(matterId)
    return appendRequest(
      matterWithAttempt(matterId),
      appendId,
      initial.events.length,
    )
  }
  throw new Error(`Unknown child request kind ${requestKind}.`)
}

function openChildStore(databasePath: string): BusinessMatterEventStore {
  const configuredTimeout = process.env.SAGE_STORE_BUSY_TIMEOUT_MS
  const busyTimeoutMs = configuredTimeout === undefined
    ? 5_000
    : Number(configuredTimeout)
  return openBusinessMatterEventStore({
    sagePaths: sagePathsForDatabase(databasePath),
    ...DEFAULT_OPTIONS,
    // This timeout is deliberately longer than the in-process BUSY probes so a
    // slow CI machine still serializes contenders into a stable open verdict.
    busyTimeoutMs,
  })
}

function recordOpenOutcome(
  databasePath: string,
  resultFile: string,
): void {
  try {
    const store = openChildStore(databasePath)
    try {
      writeFileSync(resultFile, JSON.stringify({ kind: 'opened' }), { flag: 'wx' })
    } finally {
      store.close()
    }
  } catch (error) {
    if (!(error instanceof BusinessMatterEventStoreError)) throw error
    writeFileSync(resultFile, JSON.stringify({
      kind: 'error',
      code: error.code,
      reason: error.reason,
    }), { flag: 'wx' })
  }
}

function runChildScenario(): void {
  const scenario = requiredChildEnvironment('SAGE_STORE_CHILD_SCENARIO')
  const databasePath = requiredChildEnvironment('SAGE_STORE_DATABASE_PATH')
  const resultFile = requiredChildEnvironment('SAGE_STORE_RESULT_FILE')

  if (scenario === 'open-only') {
    signalReadyAndWait()
    recordOpenOutcome(databasePath, resultFile)
    return
  }

  if (scenario === 'hold-bootstrap-open') {
    const originalExec = DatabaseSync.prototype.exec
    let heldBootstrap = false
    DatabaseSync.prototype.exec = function (sql: string) {
      const result = originalExec.call(this, sql)
      if (!heldBootstrap && sql === 'BEGIN IMMEDIATE') {
        heldBootstrap = true
        signalReadyAndWait()
      }
      return result
    }
    try {
      recordOpenOutcome(databasePath, resultFile)
    } finally {
      DatabaseSync.prototype.exec = originalExec
    }
    return
  }

  const store = openChildStore(databasePath)
  const request = childRequest()

  if (scenario === 'append') {
    try {
      signalReadyAndWait()
      writeFileSync(resultFile, JSON.stringify(store.append(request)), { flag: 'wx' })
    } finally {
      store.close()
    }
    return
  }

  if (scenario === 'kill-mid-transaction') {
    const originalRun = StatementSync.prototype.run
    let signalled = false
    StatementSync.prototype.run = (function (
      this: StatementSync,
      ...params: SQLInputValue[]
    ) {
      const result = Reflect.apply(originalRun, this, params)
      if (!signalled && this.sourceSQL.includes('INSERT INTO business_matter_events')) {
        signalled = true
        signalReadyAndWait()
      }
      return result
    }) as typeof StatementSync.prototype.run
    try {
      const result = store.append(request)
      writeFileSync(resultFile, JSON.stringify(result), { flag: 'wx' })
    } finally {
      StatementSync.prototype.run = originalRun
      store.close()
    }
    return
  }

  if (scenario === 'kill-after-commit') {
    const originalExec = DatabaseSync.prototype.exec
    DatabaseSync.prototype.exec = function (sql: string) {
      const result = originalExec.call(this, sql)
      if (sql === 'COMMIT') signalReadyAndWait()
      return result
    }
    try {
      const result = store.append(request)
      writeFileSync(resultFile, JSON.stringify(result), { flag: 'wx' })
    } finally {
      DatabaseSync.prototype.exec = originalExec
      store.close()
    }
    return
  }

  store.close()
  throw new Error(`Unknown child scenario ${scenario}.`)
}

interface SpawnedStoreChild {
  readonly process: ChildProcessWithoutNullStreams
  readonly root: string
  readonly readyFile: string
  readonly goFile: string
  readonly resultFile: string
  readonly output: () => string
  readonly exit: Promise<{
    readonly code: number | null
    readonly signal: NodeJS.Signals | null
  }>
}

async function spawnStoreChild(input: {
  readonly databasePath: string
  readonly scenario:
    | 'append'
    | 'hold-bootstrap-open'
    | 'kill-mid-transaction'
    | 'kill-after-commit'
    | 'open-only'
  readonly requestKind: 'create' | 'attempt'
  readonly matterId: string
  readonly appendId: string
  readonly busyTimeoutMs?: number
}): Promise<SpawnedStoreChild> {
  const root = await mkdtemp(join(tmpdir(), 'sage-business-matter-child-'))
  const readyFile = join(root, 'ready')
  const goFile = join(root, 'go')
  const resultFile = join(root, 'result.json')
  let stdout = ''
  let stderr = ''
  const child = spawn(process.execPath, [
    VITEST_PATH,
    'run',
    PROCESS_SPEC_PATH,
    '--reporter=dot',
    '--pool=threads',
    '--maxWorkers=1',
    '--no-file-parallelism',
  ], {
    cwd: dirname(dirname(PROCESS_SPEC_PATH)),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      SAGE_STORE_CHILD_SCENARIO: input.scenario,
      SAGE_STORE_DATABASE_PATH: input.databasePath,
      SAGE_STORE_REQUEST_KIND: input.requestKind,
      SAGE_STORE_MATTER_ID: input.matterId,
      SAGE_STORE_APPEND_ID: input.appendId,
      SAGE_STORE_READY_FILE: readyFile,
      SAGE_STORE_GO_FILE: goFile,
      SAGE_STORE_RESULT_FILE: resultFile,
      ...(input.busyTimeoutMs === undefined
        ? {}
        : { SAGE_STORE_BUSY_TIMEOUT_MS: String(input.busyTimeoutMs) }),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child.stdin.end()
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => { stdout += chunk })
  child.stderr.on('data', (chunk: string) => { stderr += chunk })
  const exit = new Promise<{
    readonly code: number | null
    readonly signal: NodeJS.Signals | null
  }>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  const spawned = {
    process: child,
    root,
    readyFile,
    goFile,
    resultFile,
    output: () => `${stdout}\n${stderr}`.trim(),
    exit,
  }
  cleanups.push(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await exit.catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  })
  return spawned
}

async function waitForPath(path: string, children: readonly SpawnedStoreChild[]): Promise<void> {
  const deadline = Date.now() + 10_000
  while (!existsSync(path)) {
    const exited = children.find(
      (child) => child.process.exitCode !== null || child.process.signalCode !== null,
    )
    if (exited !== undefined) {
      throw new Error(`Child exited before readiness.\n${exited.output()}`)
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for child path ${path}.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function waitForExit(child: SpawnedStoreChild): Promise<{
  readonly code: number | null
  readonly signal: NodeJS.Signals | null
}> {
  return await Promise.race([
    child.exit,
    new Promise<never>((_, reject) => {
      const timeout = setTimeout(() => {
        child.process.kill('SIGKILL')
        reject(new Error(`Child timed out.\n${child.output()}`))
      }, 10_000)
      child.exit.finally(() => clearTimeout(timeout)).catch(() => undefined)
    }),
  ])
}

async function readChildResult(child: SpawnedStoreChild): Promise<unknown> {
  const raw = await readFile(child.resultFile, 'utf8')
  return JSON.parse(raw) as unknown
}

if (CHILD_SCENARIO !== undefined) {
  describe('BusinessMatter WT-02A.3A controlled child worker', () => {
    it('executes the requested isolated process scenario', () => {
      runChildScenario()
    }, 15_000)
  })
} else {
describe('BusinessMatter WT-02A.3A process and SQLite adversarial boundaries', () => {
  it('reports bootstrap lock contention as storage-busy, then opens after commit', async () => {
    const databasePath = await temporaryDatabase('concurrent-first-open.sqlite3')
    const initializer = await spawnStoreChild({
      databasePath,
      scenario: 'hold-bootstrap-open',
      requestKind: 'create',
      matterId: 'matter:unused-initializer',
      appendId: 'append:unused-initializer',
    })
    await waitForPath(initializer.readyFile, [initializer])

    const follower = await spawnStoreChild({
      databasePath,
      scenario: 'open-only',
      requestKind: 'create',
      matterId: 'matter:unused-follower',
      appendId: 'append:unused-follower',
      busyTimeoutMs: 100,
    })
    await waitForPath(follower.readyFile, [initializer, follower])
    await writeFile(follower.goFile, 'go\n', { flag: 'wx' })
    expect(await waitForExit(follower)).toEqual({ code: 0, signal: null })
    expect(await readChildResult(follower)).toEqual({
      kind: 'error',
      code: 'storage-busy',
    })

    await writeFile(initializer.goFile, 'go\n', { flag: 'wx' })
    expect(await waitForExit(initializer)).toEqual({ code: 0, signal: null })
    expect(await readChildResult(initializer)).toEqual({ kind: 'opened' })

    const reopened = openTrackedStore(databasePath)
    expect(reopened.load('matter:missing')).toEqual({ kind: 'not-found' })
    expect(authorityCounts(databasePath)).toEqual({ streams: 0, events: 0, appends: 0 })
  }, 20_000)

  it('returns real storage-busy when BEGIN IMMEDIATE meets another connection write lock', async () => {
    const databasePath = await temporaryDatabase('begin-busy.sqlite3')
    const matterId = 'matter:begin-busy'
    const writer = openTrackedStore(databasePath)
    const locker = new DatabaseSync(databasePath, { timeout: 25 })
    cleanups.push(() => {
      if (locker.isOpen) {
        if (locker.isTransaction) locker.exec('ROLLBACK')
        locker.close()
      }
    })
    locker.exec('BEGIN IMMEDIATE')

    const request = appendRequest(
      matterWithEvidence(matterId),
      'append:begin-busy',
    )
    expect(writer.append(request)).toEqual({ kind: 'storage-busy' })
    expect(writer.load(matterId)).toEqual({ kind: 'not-found' })

    locker.exec('ROLLBACK')
    expect(writer.append(request)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })
  })

  it('returns real storage-busy when COMMIT cannot promote past another connection read lock', async () => {
    const databasePath = await temporaryDatabase('commit-busy.sqlite3')
    const matterId = 'matter:commit-busy'
    const initial = matterWithEvidence(matterId)
    const writer = openTrackedStore(databasePath)
    expect(writer.append(appendRequest(initial, 'append:initial'))).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })

    const reader = new DatabaseSync(databasePath, { timeout: 25 })
    cleanups.push(() => {
      if (reader.isOpen) {
        if (reader.isTransaction) reader.exec('ROLLBACK')
        reader.close()
      }
    })
    reader.exec('BEGIN')
    expect(reader.prepare(`
      SELECT current_version
      FROM business_matter_streams
      WHERE matter_id = ?
    `).get(matterId)).toEqual({ current_version: 2 })

    const attempted = matterWithAttempt(matterId)
    const retryRequest = appendRequest(
      attempted,
      'append:attempt',
      initial.events.length,
    )
    expect(writer.append(retryRequest)).toEqual({ kind: 'storage-busy' })

    reader.exec('ROLLBACK')
    expect(writer.load(matterId)).toMatchObject({ kind: 'loaded', version: 2 })
    expect(writer.append(retryRequest)).toEqual({
      kind: 'appended', firstVersion: 3, lastVersion: 3,
    })
    expect(writer.load(matterId)).toMatchObject({ kind: 'loaded', version: 3 })
  })

  it.each([
    {
      boundary: 'second event insert in a two-event append',
      triggerName: 'fail_event_insert',
      trigger: `
        CREATE TRIGGER fail_event_insert
        BEFORE INSERT ON main.business_matter_events
        WHEN NEW.stream_version = 3
        BEGIN SELECT RAISE(ABORT, 'controlled event failure'); END
      `,
    },
    {
      boundary: 'stream head update',
      triggerName: 'fail_stream_update',
      trigger: `
        CREATE TRIGGER fail_stream_update
        BEFORE UPDATE ON main.business_matter_streams
        BEGIN SELECT RAISE(ABORT, 'controlled stream failure'); END
      `,
    },
    {
      boundary: 'append ledger insert',
      triggerName: 'fail_append_insert',
      trigger: `
        CREATE TRIGGER fail_append_insert
        BEFORE INSERT ON main.business_matter_appends
        BEGIN SELECT RAISE(ABORT, 'controlled append failure'); END
      `,
    },
  ])('rolls back every authority byte and remains reusable after a real SQLite $boundary failure', async ({
    trigger,
    triggerName,
  }) => {
    const databasePath = await temporaryDatabase('trigger-rollback.sqlite3')
    const matterId = 'matter:trigger-rollback'
    const initial = createdMatter(matterId)
    const writer = openTrackedStore(databasePath)
    expect(writer.append(appendRequest(initial, 'append:initial'))).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 1,
    })
    const before = authorityRawSnapshot(databasePath)

    // Install only after schema validation. The trigger is then visible to the already-open
    // store connection and exercises SQLite's real transaction rollback.
    withDatabase(databasePath, (database) => {
      database.exec(trigger)
    })

    const attempted = matterWithAttempt(matterId)
    const request = appendRequest(
      attempted,
      'append:attempt',
      initial.events.length,
    )
    expect(request.events).toHaveLength(2)
    expect(writer.append(request)).toEqual({ kind: 'blocked', reason: 'io-unavailable' })
    expect(writer.load(matterId)).toMatchObject({ kind: 'loaded', version: 1 })
    expect(authorityRawSnapshot(databasePath)).toEqual(before)

    withDatabase(databasePath, (database) => {
      database.exec(`DROP TRIGGER ${triggerName}`)
    })
    expect(writer.append(request)).toEqual({
      kind: 'appended', firstVersion: 2, lastVersion: 3,
    })
    expect(writer.load(matterId)).toMatchObject({ kind: 'loaded', version: 3 })
    expect(authorityCounts(databasePath)).toEqual({ streams: 1, events: 3, appends: 2 })
  })

  it('serializes two independent process creates with exactly one C-02 winner', async () => {
    const databasePath = await temporaryDatabase('concurrent-create.sqlite3')
    const matterId = 'matter:concurrent-create'
    const bootstrap = openTrackedStore(databasePath)
    bootstrap.close()

    const children = await Promise.all([
      spawnStoreChild({
        databasePath,
        scenario: 'append',
        requestKind: 'create',
        matterId,
        appendId: 'append:contender-a',
      }),
      spawnStoreChild({
        databasePath,
        scenario: 'append',
        requestKind: 'create',
        matterId,
        appendId: 'append:contender-b',
      }),
    ])
    await Promise.all(children.map((child) => waitForPath(child.readyFile, children)))
    await Promise.all(children.map((child) => writeFile(child.goFile, 'go\n', { flag: 'wx' })))
    const exits = await Promise.all(children.map(waitForExit))
    expect(exits).toEqual([
      { code: 0, signal: null },
      { code: 0, signal: null },
    ])

    const results = await Promise.all(children.map(readChildResult))
    expect(results).toEqual(expect.arrayContaining([
      { kind: 'appended', firstVersion: 1, lastVersion: 2 },
      { kind: 'version-conflict', actualVersion: 2 },
    ]))

    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toMatchObject({ kind: 'loaded', version: 2 })
    expect(authorityCounts(databasePath)).toEqual({ streams: 1, events: 2, appends: 1 })
  }, 20_000)

  it('serializes two independent process exact-version appends with one C-01 winner', async () => {
    const databasePath = await temporaryDatabase('concurrent-exact.sqlite3')
    const matterId = 'matter:concurrent-exact'
    const initial = matterWithEvidence(matterId)
    const bootstrap = openTrackedStore(databasePath)
    expect(bootstrap.append(appendRequest(initial, 'append:initial'))).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 2,
    })
    bootstrap.close()

    const children = await Promise.all([
      spawnStoreChild({
        databasePath,
        scenario: 'append',
        requestKind: 'attempt',
        matterId,
        appendId: 'append:contender-a',
      }),
      spawnStoreChild({
        databasePath,
        scenario: 'append',
        requestKind: 'attempt',
        matterId,
        appendId: 'append:contender-b',
      }),
    ])
    await Promise.all(children.map((child) => waitForPath(child.readyFile, children)))
    await Promise.all(children.map((child) => writeFile(child.goFile, 'go\n', { flag: 'wx' })))
    const exits = await Promise.all(children.map(waitForExit))
    expect(exits).toEqual([
      { code: 0, signal: null },
      { code: 0, signal: null },
    ])

    const results = await Promise.all(children.map(readChildResult))
    expect(results).toEqual(expect.arrayContaining([
      { kind: 'appended', firstVersion: 3, lastVersion: 3 },
      { kind: 'version-conflict', actualVersion: 3 },
    ]))

    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toMatchObject({ kind: 'loaded', version: 3 })
    expect(authorityCounts(databasePath)).toEqual({ streams: 1, events: 3, appends: 2 })
  }, 20_000)

  it.runIf(process.platform !== 'win32')(
    'recovers an all-or-nothing database after SIGKILL during a real event transaction',
    async () => {
      const databasePath = await temporaryDatabase('kill-mid-transaction.sqlite3')
      const matterId = 'matter:kill-mid-transaction'
      const bootstrap = openTrackedStore(databasePath)
      bootstrap.close()

      const child = await spawnStoreChild({
        databasePath,
        scenario: 'kill-mid-transaction',
        requestKind: 'create',
        matterId,
        appendId: 'append:killed-mid-transaction',
      })
      await waitForPath(child.readyFile, [child])
      expect(Number(await readFile(child.readyFile, 'utf8'))).toBe(child.process.pid)
      expect((await stat(`${databasePath}-journal`)).size).toBeGreaterThan(0)
      expect(child.process.kill('SIGKILL')).toBe(true)
      expect(await waitForExit(child)).toEqual({ code: null, signal: 'SIGKILL' })

      const reopened = openTrackedStore(databasePath)
      expect(reopened.load(matterId)).toEqual({ kind: 'not-found' })
      expect(authorityCounts(databasePath)).toEqual({ streams: 0, events: 0, appends: 0 })
      withDatabase(databasePath, (database) => {
        expect(database.prepare('PRAGMA integrity_check').get()).toEqual({
          integrity_check: 'ok',
        })
      })
    },
    20_000,
  )

  it.runIf(process.platform !== 'win32')(
    'replays the same appendId after SIGKILL following real COMMIT but before acknowledgement',
    async () => {
      const databasePath = await temporaryDatabase('kill-after-commit.sqlite3')
      const matterId = 'matter:kill-after-commit'
      const request = appendRequest(
        matterWithEvidence(matterId),
        'append:killed-after-commit',
      )
      const bootstrap = openTrackedStore(databasePath)
      bootstrap.close()

      const child = await spawnStoreChild({
        databasePath,
        scenario: 'kill-after-commit',
        requestKind: 'create',
        matterId,
        appendId: request.appendId,
      })
      await waitForPath(child.readyFile, [child])
      expect(Number(await readFile(child.readyFile, 'utf8'))).toBe(child.process.pid)
      expect(child.process.kill('SIGKILL')).toBe(true)
      expect(await waitForExit(child)).toEqual({ code: null, signal: 'SIGKILL' })

      const reopened = openTrackedStore(databasePath)
      expect(reopened.append(request)).toEqual({
        kind: 'replayed', firstVersion: 1, lastVersion: 2,
      })
      expect(reopened.load(matterId)).toMatchObject({ kind: 'loaded', version: 2 })
      expect(authorityCounts(databasePath)).toEqual({ streams: 1, events: 2, appends: 1 })
    },
    20_000,
  )

  it('classifies a controlled post-COMMIT driver exception as commit-unknown and replays safely', async () => {
    const databasePath = await temporaryDatabase('controlled-commit-unknown.sqlite3')
    const matterId = 'matter:controlled-commit-unknown'
    const request = appendRequest(
      matterWithEvidence(matterId),
      'append:controlled-commit-unknown',
    )
    const store = openTrackedStore(databasePath)
    const originalExec = DatabaseSync.prototype.exec
    DatabaseSync.prototype.exec = function (sql: string) {
      const result = originalExec.call(this, sql)
      if (sql === 'COMMIT') throw new Error('controlled post-COMMIT driver exception')
      return result
    }
    try {
      expect(store.append(request)).toEqual({ kind: 'commit-unknown' })
    } finally {
      DatabaseSync.prototype.exec = originalExec
    }
    expectStoreClosed(() => store.load(matterId))
    expectStoreClosed(() => store.append(request))

    const reopened = openTrackedStore(databasePath)
    expect(reopened.append(request)).toEqual({
      kind: 'replayed', firstVersion: 1, lastVersion: 2,
    })
    expect(authorityCounts(databasePath)).toEqual({ streams: 1, events: 2, appends: 1 })
  })

  it('classifies a controlled rollback exception as commit-unknown and leaves no partial authority', async () => {
    const databasePath = await temporaryDatabase('controlled-rollback-unknown.sqlite3')
    const matterId = 'matter:controlled-rollback-unknown'
    const store = openTrackedStore(databasePath)
    const originalRun = StatementSync.prototype.run
    const originalExec = DatabaseSync.prototype.exec
    StatementSync.prototype.run = (function (
      this: StatementSync,
      ...params: SQLInputValue[]
    ) {
      if (this.sourceSQL.includes('INSERT INTO business_matter_events')) {
        throw new Error('controlled statement failure')
      }
      return Reflect.apply(originalRun, this, params)
    }) as typeof StatementSync.prototype.run
    DatabaseSync.prototype.exec = function (sql: string) {
      if (sql === 'ROLLBACK') throw new Error('controlled rollback failure')
      return originalExec.call(this, sql)
    }
    try {
      expect(store.append(appendRequest(
        matterWithEvidence(matterId),
        'append:controlled-rollback-unknown',
      ))).toEqual({ kind: 'commit-unknown' })
    } finally {
      StatementSync.prototype.run = originalRun
      DatabaseSync.prototype.exec = originalExec
    }
    expectStoreClosed(() => store.load(matterId))
    expectStoreClosed(() => store.append(appendRequest(
      matterWithEvidence(matterId),
      'append:controlled-rollback-unknown',
    )))

    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toEqual({ kind: 'not-found' })
    expect(authorityCounts(databasePath)).toEqual({ streams: 0, events: 0, appends: 0 })
  })

  it('does not leak a raw exception when controlled rollback and final close both fail', async () => {
    const databasePath = await temporaryDatabase('controlled-rollback-close-unknown.sqlite3')
    const matterId = 'matter:controlled-rollback-close-unknown'
    const store = openTrackedStore(databasePath)
    const originalRun = StatementSync.prototype.run
    const originalExec = DatabaseSync.prototype.exec
    const originalClose = DatabaseSync.prototype.close
    StatementSync.prototype.run = (function (
      this: StatementSync,
      ...params: SQLInputValue[]
    ) {
      if (this.sourceSQL.includes('INSERT INTO business_matter_events')) {
        throw new Error('controlled statement failure')
      }
      return Reflect.apply(originalRun, this, params)
    }) as typeof StatementSync.prototype.run
    DatabaseSync.prototype.exec = function (sql: string) {
      if (sql === 'ROLLBACK') throw new Error('controlled rollback failure')
      return originalExec.call(this, sql)
    }
    DatabaseSync.prototype.close = function () {
      originalClose.call(this)
      throw new Error('controlled close failure')
    }
    try {
      expect(store.append(appendRequest(
        matterWithEvidence(matterId),
        'append:controlled-rollback-close-unknown',
      ))).toEqual({ kind: 'commit-unknown' })
    } finally {
      StatementSync.prototype.run = originalRun
      DatabaseSync.prototype.exec = originalExec
      DatabaseSync.prototype.close = originalClose
    }
    expectStoreClosed(() => store.load(matterId))
    expectStoreClosed(() => store.append(appendRequest(
      matterWithEvidence(matterId),
      'append:controlled-rollback-close-unknown',
    )))
  })

  it.each([
    {
      tamper: 'missing middle stream version',
      mutate: (database: DatabaseSync, matterId: string) => {
        database.prepare(`
          DELETE FROM business_matter_events
          WHERE matter_id = ? AND stream_version = 2
        `).run(matterId)
      },
    },
    {
      tamper: 'changed payload byte without a matching digest',
      mutate: (database: DatabaseSync, matterId: string) => {
        database.prepare(`
          UPDATE business_matter_events
          SET payload_bytes = x'7b'
          WHERE matter_id = ? AND stream_version = 1
        `).run(matterId)
      },
    },
    {
      tamper: 'changed previous digest',
      mutate: (database: DatabaseSync, matterId: string) => {
        database.prepare(`
          UPDATE business_matter_events
          SET previous_digest = zeroblob(32)
          WHERE matter_id = ? AND stream_version = 2
        `).run(matterId)
      },
    },
    {
      tamper: 'changed stream head digest',
      mutate: (database: DatabaseSync, matterId: string) => {
        database.prepare(`
          UPDATE business_matter_streams
          SET head_digest = zeroblob(32)
          WHERE matter_id = ?
        `).run(matterId)
      },
    },
    {
      tamper: 'orphan events and append ledger',
      mutate: (database: DatabaseSync, matterId: string) => {
        database.exec('PRAGMA foreign_keys = OFF')
        database.prepare(`
          DELETE FROM business_matter_streams
          WHERE matter_id = ?
        `).run(matterId)
      },
    },
  ])('fails closed and does not repair direct DB tamper: $tamper', async ({ mutate }) => {
    const databasePath = await temporaryDatabase('direct-tamper.sqlite3')
    const matterId = 'matter:direct-tamper'
    const matter = matterWithAttempt(matterId)
    const request = appendRequest(matter, 'append:direct-tamper')
    const writer = openTrackedStore(databasePath)
    expect(writer.append(request)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 3,
    })
    writer.close()

    withDatabase(databasePath, (database) => mutate(database, matterId))
    const bytesBeforeObservation = authorityRawSnapshot(databasePath)
    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toMatchObject({
      kind: 'blocked', reason: 'corrupt',
    })
    expect(reopened.load(matterId)).toMatchObject({
      kind: 'blocked', reason: 'corrupt',
    })
    expect(reopened.append(request)).toMatchObject({
      kind: 'blocked', reason: 'corrupt',
    })
    expect(reopened.append(request)).toMatchObject({
      kind: 'blocked', reason: 'corrupt',
    })
    expect(authorityRawSnapshot(databasePath)).toEqual(bytesBeforeObservation)
  })

  it('reports unsupported-schema when an attacker recomputes a valid digest for an unknown schema', async () => {
    const databasePath = await temporaryDatabase('unknown-schema-tamper.sqlite3')
    const matterId = 'matter:unknown-schema-tamper'
    const writer = openTrackedStore(databasePath)
    expect(writer.append(appendRequest(
      createdMatter(matterId),
      'append:unknown-schema-tamper',
    ))).toEqual({ kind: 'appended', firstVersion: 1, lastVersion: 1 })
    writer.close()

    withDatabase(databasePath, (database) => {
      const row = database.prepare(`
        SELECT
          event_id,
          event_type,
          occurred_at,
          recorded_at,
          payload_bytes
        FROM business_matter_events
        WHERE matter_id = ? AND stream_version = 1
      `).get(matterId)
      if (
        row === undefined
        || typeof row.event_id !== 'string'
        || typeof row.event_type !== 'string'
        || typeof row.occurred_at !== 'string'
        || typeof row.recorded_at !== 'string'
        || !(row.payload_bytes instanceof Uint8Array)
      ) {
        throw new Error('Expected the committed event row for tampering.')
      }
      const digest = computeBusinessMatterCommittedEventDigest({
        matterId,
        streamVersion: 1,
        eventId: row.event_id,
        eventType: row.event_type,
        eventSchemaVersion: 999,
        occurredAt: row.occurred_at,
        recordedAt: row.recorded_at,
        payloadBytes: row.payload_bytes,
        previousDigest: null,
      })
      database.prepare(`
        UPDATE business_matter_events
        SET event_schema_version = 999, event_digest = ?
        WHERE matter_id = ? AND stream_version = 1
      `).run(digest, matterId)
      database.prepare(`
        UPDATE business_matter_streams
        SET head_digest = ?
        WHERE matter_id = ?
      `).run(digest, matterId)
    })

    const bytesBeforeObservation = authorityRawSnapshot(databasePath)
    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toMatchObject({
      kind: 'blocked',
      reason: 'unsupported-schema',
      diagnostic: { eventIndex: 0, streamVersion: 1 },
    })
    expect(reopened.load(matterId)).toMatchObject({
      kind: 'blocked', reason: 'unsupported-schema',
    })
    const request = appendRequest(
      createdMatter(matterId),
      'append:unknown-schema-tamper',
    )
    expect(reopened.append(request)).toMatchObject({
      kind: 'blocked', reason: 'unsupported-schema',
    })
    expect(reopened.append(request)).toMatchObject({
      kind: 'blocked', reason: 'unsupported-schema',
    })
    expect(authorityRawSnapshot(databasePath)).toEqual(bytesBeforeObservation)
  })

  it('blocks replay when the append ledger range is directly corrupted', async () => {
    const databasePath = await temporaryDatabase('append-range-tamper.sqlite3')
    const matterId = 'matter:append-range-tamper'
    const matter = matterWithAttempt(matterId)
    const request = appendRequest(matter, 'append:range-tamper')
    const writer = openTrackedStore(databasePath)
    expect(writer.append(request)).toEqual({
      kind: 'appended', firstVersion: 1, lastVersion: 3,
    })
    writer.close()

    withDatabase(databasePath, (database) => {
      database.exec('PRAGMA ignore_check_constraints = ON')
      database.prepare(`
        UPDATE business_matter_appends
        SET first_version = 2, last_version = 1
        WHERE matter_id = ? AND append_id = ?
      `).run(matterId, request.appendId)
    })

    const bytesBeforeObservation = authorityRawSnapshot(databasePath)
    const reopened = openTrackedStore(databasePath)
    expect(reopened.load(matterId)).toMatchObject({ kind: 'loaded', version: 3 })
    expect(reopened.append(request)).toEqual({ kind: 'blocked', reason: 'corrupt' })
    expect(reopened.append(request)).toEqual({ kind: 'blocked', reason: 'corrupt' })
    expect(reopened.load(matterId)).toMatchObject({ kind: 'loaded', version: 3 })
    expect(authorityRawSnapshot(databasePath)).toEqual(bytesBeforeObservation)
  })
})
}
