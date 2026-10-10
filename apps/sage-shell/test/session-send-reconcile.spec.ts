/** ADR-0293 (alternative C): the send-path reconcile fallback — closes a stuck active attempt
 *  from the observable fold before the next send, with every guard, over a real sqlite store. */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSessionSendReconcile } from '../src/main/session-send-reconcile.js'
import { createSessionTurnClose } from '../src/main/session-turn-close.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
  startAttempt,
} from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const MATTER_ID = 'matter:sage.send-reconcile-1'
const REVISION_ID = 'revision:1'
type Fold = { readonly state: 'read' | 'no-session' | 'unavailable', readonly execution: 'idle' | 'executing', readonly lastTurnEnd: string | null, readonly lastTurnEndEdge: string | null }

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function seededWithActiveAttempt(root: string, home: string) {
  const paths = resolveSagePaths({ home, root, platform: process.platform })
  const store = openBusinessMatterEventStore({
    sagePaths: paths,
    maxStreamEvents: 32,
    maxPayloadBytes: 64 * 1024,
    busyTimeoutMs: 75,
    clock: () => '2026-10-12T00:00:00.000Z',
  })
  cleanups.push(() => store.close())
  const created = enterEvidence(createBusinessMatter({
    matterId: MATTER_ID,
    eventId: `${MATTER_ID}:created`,
    occurredAt: '2026-10-10T10:00:00Z',
    goal: 'Reconcile before the next send.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  }), {
    eventId: `${MATTER_ID}:revision-1`,
    occurredAt: '2026-10-10T10:01:00Z',
    revisionId: REVISION_ID,
    changeReason: 'x', scope: 'x', permissionBoundary: 'x', dataDestination: 'x',
    evidence: [{ evidenceId: 'e1', source: 'user-selection', observedAt: '2026-10-10T10:00:30Z', status: 'supported' }],
    unknowns: [], options: [], dependencies: [], experienceRefs: [],
    actionPolicies: [{ actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false }],
  })
  const withAttempt = startAttempt(created, {
    eventId: `${MATTER_ID}:attempt-1`,
    occurredAt: '2026-10-10T10:02:00Z',
    attemptId: 'attempt:sage.reconcile-1',
    revisionId: REVISION_ID,
    actionScopes: ['session.prompt'],
    decisionIds: [],
    executionSnapshot: {
      provider: { identity: 'provider:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      model: { identity: 'model:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      agent: { identity: 'agent:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      preset: { identity: 'preset:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      capabilities: [],
    },
    compatibility: { outcome: 'equivalent', matrixId: 'urn:sage:compatibility-matrix:sha256:x', reason: 'x' },
    // ADR-0296: the fold already showed this edge when the attempt started — exactly the case
    // the evidence-scoping guard exists for.
    observedTurnEndEdge: '9:completed',
  })
  const seeded = store.append({
    matterId: MATTER_ID,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'seed:send-reconcile-1',
    events: encodeBusinessMatterEvents(withAttempt).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    })),
  })
  expect(seeded.kind).toBe('appended')
  return { paths, store }
}

async function temporaryRoot(name: string) {
  const container = await mkdtemp(join(await realpath(tmpdir()), `sage-send-reconcile-${name}-`))
  const root = join(container, 'Sage')
  const home = join(container, 'home')
  await mkdir(home, { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return { root, home }
}

function harness(
  paths: ReturnType<typeof resolveSagePaths>,
  fold: Fold,
  overrides?: { readonly close?: ReturnType<typeof createSessionTurnClose> },
) {
  const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
  cleanups.push(() => attempts.close())
  const close = overrides?.close
    ?? createSessionTurnClose({ attempts, now: () => '2026-10-12T00:00:01.000Z' })
  const readChannel = vi.fn(async (): Promise<Fold> => fold)
  const reconcile = createSessionSendReconcile({ attempts, readChannel, close })
  return { attempts, close, readChannel, reconcile }
}

function eventCount(store: ReturnType<typeof openBusinessMatterEventStore>): number {
  return loadedMatter(store).events.length
}

function loadedMatter(store: ReturnType<typeof openBusinessMatterEventStore>) {
  const loaded = store.load(MATTER_ID)
  if (loaded.kind !== 'loaded') throw new Error('expected loaded')
  return loaded.matter
}

describe('the send-path reconcile fallback (ADR-0293 alternative C)', () => {
  it('closes the stuck attempt when the fold says the turn ended and the channel is idle', async () => {
    const { root, home } = await temporaryRoot('completed')
    const { paths, store } = await seededWithActiveAttempt(root, home)
    const { reconcile } = harness(paths, { state: 'read', execution: 'idle', lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' })

    await reconcile({ matterRef: MATTER_ID })

    const matter = loadedMatter(store)
    const projection = projectBusinessMatter(matter)
    expect(projection.activeAttemptId).toBeUndefined()
    expect(projection.attempts.map((attempt) => attempt.status)).toEqual(['succeeded'])
    expect(matter.events.at(-1)?.type).toBe('attempt-succeeded')
  })

  it('never appends while the turn is still executing', async () => {
    const { root, home } = await temporaryRoot('executing')
    const { paths, store } = await seededWithActiveAttempt(root, home)
    const { reconcile } = harness(paths, { state: 'read', execution: 'executing', lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' })
    const before = eventCount(store)

    await reconcile({ matterRef: MATTER_ID })

    expect(eventCount(store)).toBe(before)
    expect(projectBusinessMatter(loadedMatter(store)).activeAttemptId).toBe('attempt:sage.reconcile-1')
  })

  it('appends nothing when the fold has no observed turn end or is not readable', async () => {
    for (const fold of [
      { state: 'read' as const, execution: 'idle' as const, lastTurnEnd: null, lastTurnEndEdge: null },
      { state: 'no-session' as const, execution: 'idle' as const, lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' },
      { state: 'unavailable' as const, execution: 'idle' as const, lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' },
    ]) {
      const name = fold.state === 'read' ? 'null-end' : fold.state
      const { root, home } = await temporaryRoot(name)
      const { paths, store } = await seededWithActiveAttempt(root, home)
      const { reconcile } = harness(paths, fold)
      const before = eventCount(store)

      await reconcile({ matterRef: MATTER_ID })

      expect(eventCount(store), name).toBe(before)
      expect(projectBusinessMatter(loadedMatter(store)).activeAttemptId, name).toBe('attempt:sage.reconcile-1')
    }
  })

  it('refuses to close on the stale edge the attempt already started with (ADR-0296)', async () => {
    // The regression: the fold still shows the pre-attempt edge (the dispatch never landed or
    // its turn never started). Closing on it would record an outcome the evidence cannot prove.
    const { root, home } = await temporaryRoot('stale-edge')
    const { paths, store } = await seededWithActiveAttempt(root, home)
    const { reconcile } = harness(paths, { state: 'read', execution: 'idle', lastTurnEnd: 'completed', lastTurnEndEdge: '9:completed' })
    const before = eventCount(store)

    await reconcile({ matterRef: MATTER_ID })

    expect(eventCount(store)).toBe(before)
    expect(projectBusinessMatter(loadedMatter(store)).activeAttemptId).toBe('attempt:sage.reconcile-1')
  })

  it('no-ops when no attempt is active (the normal send path skips the close entirely)', async () => {
    const { root, home } = await temporaryRoot('no-active')
    const { paths, store } = await seededWithActiveAttempt(root, home)
    // Close the attempt once through the same runner; the second reconcile then finds no
    // active attempt and must not even reach the channel read.
    const first = harness(paths, { state: 'read', execution: 'idle', lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' })
    await first.reconcile({ matterRef: MATTER_ID })
    const closed = eventCount(store)
    expect(closed).toBeGreaterThan(0)

    const second = harness(paths, { state: 'read', execution: 'idle', lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' })
    await second.reconcile({ matterRef: MATTER_ID })

    expect(second.readChannel).not.toHaveBeenCalled()
    expect(eventCount(store)).toBe(closed)
  })

  it('swallows a throwing close and writes nothing', async () => {
    const { root, home } = await temporaryRoot('close-throws')
    const { paths, store } = await seededWithActiveAttempt(root, home)
    const close = vi.fn(async () => { throw new Error('probe') })
    const { reconcile } = harness(paths, { state: 'read', execution: 'idle', lastTurnEnd: 'completed', lastTurnEndEdge: '12:completed' }, { close })
    const before = eventCount(store)

    await expect(reconcile({ matterRef: MATTER_ID })).resolves.toBeUndefined()

    expect(close).toHaveBeenCalledTimes(1)
    expect(eventCount(store)).toBe(before)
  })
})

describe('the send route rides the reconcile before prepare (composition)', () => {
  const call = async (options: {
    readonly reconcile: ReturnType<typeof vi.fn>
    readonly prepare?: ReturnType<typeof vi.fn>
  }) => {
    const providers = createUnavailableFirstService(null, {
      reconcileSessionAttempt: options.reconcile as never,
      ...(options.prepare === undefined ? {} : { prepareSessionPrompt: options.prepare as never }),
    })
    return handleSageServiceRequest(new Request('dsh-app://app/.sage/session/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matterRef: MATTER_ID, workspaceRoot: '/w', text: 'go' }),
    }), { callerBinding: { correlation: 'caller:session-core' }, providers })
  }

  it('runs the reconcile first and still completes the send flow when it throws', async () => {
    const order: string[] = []
    const reconcile = vi.fn(async () => { order.push('reconcile'); throw new Error('probe') })
    const prepare = vi.fn(async () => { order.push('prepare'); return { state: 'not-needed' as const } })

    await call({ reconcile, prepare })

    expect(reconcile).toHaveBeenCalledWith({ matterRef: MATTER_ID })
    expect(order).toEqual(['reconcile', 'prepare'])
  })

  it('skips the reconcile entirely when the option is absent', async () => {
    const prepare = vi.fn(async () => ({ state: 'not-needed' as const }))

    await call({ reconcile: vi.fn(), prepare })

    expect(prepare).toHaveBeenCalledTimes(1)
  })
})
