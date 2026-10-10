/** ADR-0293: turn-end closure — the light `attempt-succeeded` path, the failure mapping, and the
 *  repeat-send unblock, over a real sqlite store. */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createSessionTurnClose } from '../src/main/session-turn-close.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
  recordDecision,
  requestClarification,
  startAttempt,
  succeedAttempt,
} from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const MATTER_ID = 'matter:sage.turn-close-1'
const REVISION_ID = 'revision:1'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function seeded(root: string, home: string, startAttemptNow: boolean) {
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
    goal: 'Close the turn.',
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
  const withAttempt = startAttemptNow
    ? startAttempt(created, {
        eventId: `${MATTER_ID}:attempt-1`,
        occurredAt: '2026-10-10T10:02:00Z',
        attemptId: 'attempt:sage.close-1',
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
      })
    : created
  const seeded = store.append({
    matterId: MATTER_ID,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'seed:turn-close-1',
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
  const container = await mkdtemp(join(await realpath(tmpdir()), `sage-close-${name}-`))
  const root = join(container, 'Sage')
  const home = join(container, 'home')
  await mkdir(home, { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  return { root, home }
}

function runner(paths: ReturnType<typeof resolveSagePaths>) {
  const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
  cleanups.push(() => attempts.close())
  return {
    attempts,
    close: createSessionTurnClose({
      attempts,
      now: () => '2026-10-12T00:00:01.000Z',
    }),
  }
}

describe('turn-end closure (ADR-0293)', () => {
  it('closes a completed turn with the light event and unblocks the next attempt in the same revision', async () => {
    const { root, home } = await temporaryRoot('completed')
    const { paths, store } = await seeded(root, home, true)
    const { attempts, close } = runner(paths)

    await close({ matterRef: MATTER_ID, endKind: 'completed' })

    const loaded = store.load(MATTER_ID)
    expect(loaded.kind).toBe('loaded')
    if (loaded.kind !== 'loaded') throw new Error('expected loaded')
    const projection = projectBusinessMatter(loaded.matter)
    expect(projection.activeAttemptId).toBeUndefined()
    expect(projection.attempts.map((attempt) => attempt.status)).toEqual(['succeeded'])
    expect(loaded.matter.events.at(-1)?.type).toBe('attempt-succeeded')

    // The repeat-send path: a NEW attempt may start in the same revision right away.
    const next = startAttempt(loaded.matter, {
      eventId: `${MATTER_ID}:attempt-2`,
      occurredAt: '2026-10-12T00:00:02.000Z',
      attemptId: 'attempt:sage.close-2',
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
    })
    expect(projectBusinessMatter(next).activeAttemptId).toBe('attempt:sage.close-2')

    // Idempotent: re-observing the same turn end finds no active attempt and appends nothing.
    await close({ matterRef: MATTER_ID, endKind: 'completed' })
    const again = attempts.readMatter(MATTER_ID)
    expect(again !== undefined && 'matter' in again && again.matter.events.length).toBe(loaded.matter.events.length)
  })

  it('maps failure kinds to attempt-failed and leaves blocked or unknown kinds open', async () => {
    const failedRoot = await temporaryRoot('failed')
    const failedCase = await seeded(failedRoot.root, failedRoot.home, true)
    const failed = runner(failedCase.paths)
    await failed.close({ matterRef: MATTER_ID, endKind: 'error' })
    const loadedFailed = failedCase.store.load(MATTER_ID)
    if (loadedFailed.kind !== 'loaded') throw new Error('expected loaded')
    expect(loadedFailed.matter.events.at(-1)?.type).toBe('attempt-failed')
    expect(projectBusinessMatter(loadedFailed.matter).attempts[0]?.status).toBe('failed')

    for (const kind of ['blocked', 'mystery']) {
      const openRoot = await temporaryRoot(`open-${kind}`)
      const openCase = await seeded(openRoot.root, openRoot.home, true)
      const open = runner(openCase.paths)
      const before = openCase.store.load(MATTER_ID)
      if (before.kind !== 'loaded') throw new Error('expected loaded')
      await open.close({ matterRef: MATTER_ID, endKind: kind })
      const after = openCase.store.load(MATTER_ID)
      if (after.kind !== 'loaded') throw new Error('expected loaded')
      expect(after.matter.events.length, kind).toBe(before.matter.events.length)
      expect(projectBusinessMatter(after.matter).activeAttemptId, kind).toBe('attempt:sage.close-1')
    }
  })

  it('leaves a decision-demanding scope open for the review path (ADR-0295 strategy split)', async () => {
    const { root, home } = await temporaryRoot('review')
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
      goal: 'Review-gated turn.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    }), {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: REVISION_ID,
      changeReason: 'x', scope: 'x', permissionBoundary: 'x', dataDestination: 'x',
      evidence: [{ evidenceId: 'e1', source: 'user-input', observedAt: '2026-10-10T10:00:30Z', status: 'supported' }],
      unknowns: [], options: [], dependencies: [], experienceRefs: [],
      actionPolicies: [{ actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: true }],
    })
    const clarifying = requestClarification(created, {
      eventId: `${MATTER_ID}:clarify-1`,
      occurredAt: '2026-10-10T10:01:15Z',
      revisionId: REVISION_ID,
      actionScope: 'session.prompt',
      reason: 'Approve once.',
    })
    const approved = recordDecision(clarifying, {
      eventId: `${MATTER_ID}:decision-1`,
      occurredAt: '2026-10-10T10:01:30Z',
      decisionId: 'decision:1',
      revisionId: REVISION_ID,
      actionScope: 'session.prompt',
      outcome: 'approved',
      actor: { kind: 'human', roleRef: 'role:owner' },
      reason: 'Approve once.',
      expiresAt: undefined,
    })
    const withAttempt = startAttempt(approved, {
      eventId: `${MATTER_ID}:attempt-1`,
      occurredAt: '2026-10-10T10:02:00Z',
      attemptId: 'attempt:sage.close-1',
      revisionId: REVISION_ID,
      actionScopes: ['session.prompt'],
      decisionIds: ['decision:1'],
      executionSnapshot: {
        provider: { identity: 'provider:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
        model: { identity: 'model:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
        agent: { identity: 'agent:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
        preset: { identity: 'preset:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
        capabilities: [],
      },
      compatibility: { outcome: 'equivalent', matrixId: 'urn:sage:compatibility-matrix:sha256:x', reason: 'x' },
    })
    const seededReview = store.append({
      matterId: MATTER_ID,
      expectedVersion: { kind: 'not-exists' },
      appendId: 'seed:turn-close-review-1',
      events: encodeBusinessMatterEvents(withAttempt).map((event) => ({
        matterId: event.matterId,
        eventId: event.eventId,
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion,
        occurredAt: event.occurredAt,
        payloadBytes: event.payloadBytes.slice(),
      })),
    })
    expect(seededReview.kind).toBe('appended')

    const { close } = runner(paths)
    const before = store.load(MATTER_ID)
    if (before.kind !== 'loaded') throw new Error('expected loaded')
    await close({ matterRef: MATTER_ID, endKind: 'completed' })
    const afterCompleted = store.load(MATTER_ID)
    if (afterCompleted.kind !== 'loaded') throw new Error('expected loaded')
    expect(afterCompleted.matter.events.length).toBe(before.matter.events.length)
    expect(projectBusinessMatter(afterCompleted.matter).activeAttemptId).toBe('attempt:sage.close-1')

    // A failure still closes honestly — review gating guards the light path only.
    await close({ matterRef: MATTER_ID, endKind: 'error' })
    const afterError = store.load(MATTER_ID)
    if (afterError.kind !== 'loaded') throw new Error('expected loaded')
    expect(afterError.matter.events.at(-1)?.type).toBe('attempt-failed')
  })

  it('no-ops when no attempt is active or the matter is unknown', async () => {
    const { root, home } = await temporaryRoot('noop')
    const { paths, store } = await seeded(root, home, false)
    const { close } = runner(paths)
    const before = store.load(MATTER_ID)
    if (before.kind !== 'loaded') throw new Error('expected loaded')
    await close({ matterRef: MATTER_ID, endKind: 'completed' })
    await close({ matterRef: 'matter:sage.unknown-1', endKind: 'completed' })
    const after = store.load(MATTER_ID)
    if (after.kind !== 'loaded') throw new Error('expected loaded')
    expect(after.matter.events.length).toBe(before.matter.events.length)
  })
})
