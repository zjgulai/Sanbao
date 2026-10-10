import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'

import type { SageDispatchIntent } from '../src/appservice/command-contracts.js'
import { projectBusinessMatter } from '../src/domain/business-matter.js'
import { createMatterCustody } from '../src/main/matter-custody.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths, type SagePaths } from '../src/profile/paths.js'

/**
 * T04: the real custodian over the Sage-owned authoritative store. The cases pin the wire shape
 * (create once, receipt = formal identity), the idempotency story (same attempt never duplicates),
 * the proof-based conflict handling, and the fail-closed paths shared with the rehydrate port.
 * The last case reads the accepted creation back from a second, freshly spawned process.
 */

const CHILD_SCENARIO = process.env.SAGE_CUSTODY_CHILD_SCENARIO
const SPEC_PATH = fileURLToPath(import.meta.url)
const require = createRequire(import.meta.url)
const VITEST_PATH = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const APP_ROOT = dirname(dirname(SPEC_PATH))

const cleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function temporaryPaths(label: string): Promise<SagePaths> {
  const physical = await realpath(tmpdir())
  const container = await mkdtemp(join(physical, `sage-custody-${label}-`))
  const home = join(container, 'home')
  const root = join(container, 'Sage')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(root, { mode: 0o700 })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return resolveSagePaths({ home, platform: 'darwin', root })
}

function creationIntent(overrides: { readonly draftId?: string, readonly payload?: Readonly<Record<string, string>> } = {}): SageDispatchIntent {
  return {
    matterId: `draft:${overrides.draftId ?? 'draft-1'}`,
    revisionId: 'draft-revision:1',
    actionType: 'create-matter',
    actionScope: 'revision',
    payload: {
      goal: '把首屏做出来',
      deliverable: '可运行的首屏',
      responsibleParty: '负责人甲',
      ...overrides.payload,
    },
    origin: 'renderer-action',
  }
}

function readStore(paths: SagePaths) {
  const store = openBusinessMatterEventStore({
    sagePaths: paths,
    maxStreamEvents: 4096,
    maxPayloadBytes: 1024 * 1024,
    busyTimeoutMs: 2000,
    clock: () => '2026-10-10T00:00:30Z',
  })
  cleanups.push(() => store.close())
  return store
}

describe('the custody provider creates the first stream exactly once', () => {
  it('appends matter-created plus the creation revision and answers the formal identity', async () => {
    const paths = await temporaryPaths('create')
    const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
    cleanups.push(() => custody.close())

    const result = custody.createMatter({ intent: creationIntent(), correlation: 'corr-create' })
    expect(result).toEqual({ receiptRef: 'matter:corr-create' })

    const loaded = readStore(paths).load('matter:corr-create')
    expect(loaded.kind, JSON.stringify(loaded)).toBe('loaded')
    if (loaded.kind !== 'loaded') return
    expect(loaded.version).toBe(2)
    const projection = projectBusinessMatter(loaded.matter)
    expect(projection).toMatchObject({
      goal: '把首屏做出来',
      currentRevisionId: 'revision:1',
      stage: 'evidence',
      responsibleParty: { kind: 'human', roleRef: '负责人甲' },
    })
    expect(projection.revisions[0]).toMatchObject({
      revisionId: 'revision:1',
      changeReason: '首页草案确认创建',
      permissionBoundary: '创建时未声明额外权限边界',
      dataDestination: '本机 Sage 数据根',
      dependencies: [],
    })
    expect(projection.revisions[0]!.scope).toBe('交付物：可运行的首屏')
    expect(loaded.matter.events[0]).toMatchObject({ type: 'matter-created', eventId: 'matter:corr-create:created' })
    expect(loaded.matter.events[1]).toMatchObject({ type: 'revision-entered', eventId: 'matter:corr-create:revision-1' })
  })

  it('folds the project and the selected context into the declared scope', async () => {
    const paths = await temporaryPaths('scope')
    const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
    cleanups.push(() => custody.close())

    const result = custody.createMatter({
      intent: creationIntent({ payload: { projectRef: 'K3', attachedFragments: JSON.stringify(['第一段', '第二段']) } }),
      correlation: 'corr-scope',
    })
    expect(result).toEqual({ receiptRef: 'matter:corr-scope' })
    const loaded = readStore(paths).load('matter:corr-scope')
    if (loaded.kind !== 'loaded') throw new Error('expected the created stream')
    expect(projectBusinessMatter(loaded.matter).revisions[0]!.scope).toBe('交付物：可运行的首屏\n项目：K3\n附带上文：\n第一段\n第二段')
    expect(projectBusinessMatter(loaded.matter).revisions[0]!.evidence[0]).toMatchObject({
      source: 'draft:draft-1',
      status: 'insufficient',
    })
  })

  it('replays the same attempt without duplicating when the bytes match', async () => {
    const paths = await temporaryPaths('replay')
    const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
    cleanups.push(() => custody.close())

    expect(custody.createMatter({ intent: creationIntent(), correlation: 'corr-replay' })).toEqual({ receiptRef: 'matter:corr-replay' })
    expect(custody.createMatter({ intent: creationIntent(), correlation: 'corr-replay' })).toEqual({ receiptRef: 'matter:corr-replay' })
    const loaded = readStore(paths).load('matter:corr-replay')
    if (loaded.kind !== 'loaded') throw new Error('expected the created stream')
    expect(loaded.version).toBe(2)
  })

  it('settles a drifted re-entry through the stream proof, never minting a second stream', async () => {
    const paths = await temporaryPaths('drift')
    let now = '2026-10-10T00:00:00Z'
    const custody = createMatterCustody({ sagePaths: paths, clock: () => now })
    cleanups.push(() => custody.close())

    expect(custody.createMatter({ intent: creationIntent(), correlation: 'corr-drift' })).toEqual({ receiptRef: 'matter:corr-drift' })
    // A second call for the same attempt with a different clock changes the bytes: the store
    // answers idempotency-conflict, and only the committed stream itself proves the receipt.
    now = '2026-10-10T00:00:05Z'
    expect(custody.createMatter({ intent: creationIntent(), correlation: 'corr-drift' })).toEqual({ receiptRef: 'matter:corr-drift' })
    const loaded = readStore(paths).load('matter:corr-drift')
    if (loaded.kind !== 'loaded') throw new Error('expected the created stream')
    expect(loaded.version).toBe(2)
  })

  it('refuses malformed intents provably: denied, and nothing is written', async () => {
    const paths = await temporaryPaths('refuse')
    const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
    cleanups.push(() => custody.close())
    const store = readStore(paths)

    const missingGoal = { ...creationIntent(), payload: { deliverable: 'x', responsibleParty: 'y' } } as SageDispatchIntent
    expect(custody.createMatter({ intent: missingGoal, correlation: 'corr-bad-1' })).toEqual({ denied: 'custody-unavailable' })
    const wrongAction = { ...creationIntent(), actionType: 'start-attempt' } as SageDispatchIntent
    expect(custody.createMatter({ intent: wrongAction, correlation: 'corr-bad-2' })).toEqual({ denied: 'custody-unavailable' })
    const badFragments = creationIntent({ payload: { attachedFragments: 'not-json' } })
    expect(custody.createMatter({ intent: badFragments, correlation: 'corr-bad-3' })).toEqual({ denied: 'custody-unavailable' })

    expect(store.load('matter:corr-bad-1').kind).toBe('not-found')
    expect(store.load('matter:corr-bad-2').kind).toBe('not-found')
    expect(store.load('matter:corr-bad-3').kind).toBe('not-found')
  })
})

describe('reconcile answers only from the committed stream', () => {
  it('stays unknown before the creation and observes it once committed', async () => {
    const paths = await temporaryPaths('reconcile')
    const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
    cleanups.push(() => custody.close())

    expect(custody.reconcileCreation({ draftId: 'draft-1', correlation: 'corr-reconcile' }))
      .toEqual({ state: 'unknown', code: 'creation-not-observed' })
    custody.createMatter({ intent: creationIntent(), correlation: 'corr-reconcile' })
    expect(custody.reconcileCreation({ draftId: 'draft-1', correlation: 'corr-reconcile' }))
      .toEqual({ state: 'settled', matterRef: 'matter:corr-reconcile' })
  })

  it('answers no query port when the custodian is closed, and provider-unavailable when unopenable', async () => {
    const closedPaths = await temporaryPaths('reconcile-closed')
    const closed = createMatterCustody({ sagePaths: closedPaths })
    closed.close()
    expect(closed.createMatter({ intent: creationIntent(), correlation: 'corr-closed' })).toBeUndefined()
    expect(closed.reconcileCreation({ draftId: 'draft-1', correlation: 'corr-closed' }))
      .toEqual({ state: 'unknown', code: 'custodian-query-unavailable' })

    const brokenPaths = await temporaryPaths('reconcile-broken')
    // A file where the store expects its data directory: opening must fail closed.
    writeFileSync(join(brokenPaths.root, 'data'), 'not a directory')
    const broken = createMatterCustody({ sagePaths: brokenPaths })
    cleanups.push(() => broken.close())
    expect(broken.createMatter({ intent: creationIntent(), correlation: 'corr-broken' })).toBeUndefined()
    expect(broken.reconcileCreation({ draftId: 'draft-1', correlation: 'corr-broken' }))
      .toEqual({ state: 'unknown', code: 'custodian-query-unavailable' })
  })
})

async function runReadBackChild(): Promise<void> {
  const root = process.env.SAGE_CUSTODY_CHILD_ROOT
  const home = process.env.SAGE_CUSTODY_CHILD_HOME
  const matterId = process.env.SAGE_CUSTODY_CHILD_MATTER
  const resultFile = process.env.SAGE_CUSTODY_CHILD_RESULT_FILE
  if (root === undefined || home === undefined || matterId === undefined || resultFile === undefined) {
    throw new Error('read-back child environment is incomplete')
  }
  const paths = resolveSagePaths({ home, platform: 'darwin', root })
  const store = openBusinessMatterEventStore({
    sagePaths: paths,
    maxStreamEvents: 4096,
    maxPayloadBytes: 1024 * 1024,
    busyTimeoutMs: 2000,
    clock: () => '2026-10-10T00:01:00Z',
  })
  try {
    const loaded = store.load(matterId)
    let result: Record<string, unknown>
    if (loaded.kind !== 'loaded') {
      result = { kind: loaded.kind }
    } else {
      const first = loaded.matter.events[0]
      result = {
        kind: 'loaded',
        version: loaded.version,
        eventId: first?.eventId ?? null,
        goal: first !== undefined && first.type === 'matter-created' ? first.goal : null,
        currentRevisionId: projectBusinessMatter(loaded.matter).currentRevisionId,
      }
    }
    writeFileSync(resultFile, JSON.stringify(result), { flag: 'wx' })
  } finally {
    store.close()
  }
}

if (CHILD_SCENARIO !== undefined) {
  describe('custody read-back child', () => {
    it('reads the accepted creation from its own process', async () => {
      await runReadBackChild()
    }, 15_000)
  })
} else {
  describe('a new process reads the accepted creation back', () => {
    it('sees the same matter, goal and current revision as the creating process', async () => {
      const paths = await temporaryPaths('process')
      const custody = createMatterCustody({ sagePaths: paths, clock: () => '2026-10-10T00:00:00Z' })
      cleanups.push(() => custody.close())
      expect(custody.createMatter({ intent: creationIntent(), correlation: 'corr-process' })).toEqual({ receiptRef: 'matter:corr-process' })

      const sandbox = await mkdtemp(join(await realpath(tmpdir()), 'sage-custody-child-'))
      const resultFile = join(sandbox, 'result.json')
      cleanups.push(() => rm(sandbox, { recursive: true, force: true }))
      const child = spawn(process.execPath, [
        VITEST_PATH,
        'run',
        SPEC_PATH,
        '--reporter=dot',
        '--pool=threads',
        '--maxWorkers=1',
        '--no-file-parallelism',
      ], {
        cwd: APP_ROOT,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          SAGE_CUSTODY_CHILD_SCENARIO: 'read-back',
          SAGE_CUSTODY_CHILD_ROOT: paths.root,
          SAGE_CUSTODY_CHILD_HOME: paths.home,
          SAGE_CUSTODY_CHILD_MATTER: 'matter:corr-process',
          SAGE_CUSTODY_CHILD_RESULT_FILE: resultFile,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let output = ''
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', (chunk: string) => { output += chunk })
      child.stderr.on('data', (chunk: string) => { output += chunk })
      const exit = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve(code))
      })
      cleanups.push(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        await exit.catch(() => undefined)
      })

      const deadline = Date.now() + 30_000
      while (!existsSync(resultFile)) {
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`child exited before writing the result\n${output}`)
        if (Date.now() >= deadline) throw new Error(`child never wrote the result\n${output}`)
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      const result = JSON.parse(await readFile(resultFile, 'utf8')) as Record<string, unknown>
      expect(result).toMatchObject({
        kind: 'loaded',
        version: 2,
        eventId: 'matter:corr-process:created',
        goal: '把首屏做出来',
        currentRevisionId: 'revision:1',
      })
    }, 60_000)
  })
}
