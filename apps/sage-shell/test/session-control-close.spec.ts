/** B batch stage 4 (ADR-0317 D4): the synchronous control closure — succeeded/failed paths,
 *  the attempt-unblock effect, idempotence and best-effort silence, over a real sqlite store. */
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createSessionControlCloseRecorder } from '../src/main/session-control-close.js'
import { createSessionPromptAttemptStore } from '../src/main/session-prompt-attempt-store.js'
import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
  startAttempt,
} from '../src/domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../src/domain/business-matter-codec.js'
import { openBusinessMatterEventStore } from '../src/persistence/business-matter-event-store.js'
import { resolveSagePaths } from '../src/profile/paths.js'

const MATTER_ID = 'matter:sage.control-close-1'
const REVISION_ID = 'revision:1'
const ATTEMPT_ID = 'attempt:sage.control-1'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

/** One matter with the control scope declared executable (requiresDecision:false — the live
 *  answer IS the decision; decision-capability lives in the identity grant) and one open
 *  attempt, exactly the state the dispatch step leaves behind. */
async function seeded(root: string, home: string) {
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
    goal: 'Close the control attempt.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  }), {
    eventId: `${MATTER_ID}:revision-1`,
    occurredAt: '2026-10-10T10:01:00Z',
    revisionId: REVISION_ID,
    changeReason: 'x', scope: 'x', permissionBoundary: 'x', dataDestination: 'x',
    evidence: [{ evidenceId: 'e1', source: 'user-selection', observedAt: '2026-10-10T10:00:30Z', status: 'supported' }],
    unknowns: [], options: [], dependencies: [], experienceRefs: [],
    actionPolicies: [{ actionScope: 'session.approval', effectClass: 'external-write', requiresDecision: false }],
  })
  const withAttempt = startAttempt(created, {
    eventId: `${MATTER_ID}:attempt-1`,
    occurredAt: '2026-10-10T10:02:00Z',
    attemptId: ATTEMPT_ID,
    revisionId: REVISION_ID,
    actionScopes: ['session.approval'],
    decisionIds: [],
    executionSnapshot: {
      provider: { identity: 'provider:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      model: { identity: 'model:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      agent: { identity: 'agent:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      preset: { identity: 'preset:local', version: '0.2.0-rc.2', digest: 'sha256:x' },
      capabilities: [],
    },
    compatibility: { outcome: 'equivalent', matrixId: 'urn:sage:compatibility-matrix:sha256:x', reason: 'x' },
    observedTurnEndEdge: null,
  })
  const seedEvents = encodeBusinessMatterEvents(withAttempt).map((event) => ({
    matterId: event.matterId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    occurredAt: event.occurredAt,
    payloadBytes: event.payloadBytes.slice(),
  }))
  expect(store.append({
    matterId: MATTER_ID,
    expectedVersion: { kind: 'not-exists' },
    appendId: 'seed:control-close',
    events: seedEvents,
  }).kind).toBe('appended')
  const attempts = createSessionPromptAttemptStore({ sagePaths: paths })
  cleanups.push(() => attempts.close())
  const recorder = createSessionControlCloseRecorder({
    attempts,
    now: () => '2026-10-12T00:00:00.000Z',
  })
  return { attempts, recorder }
}

async function temporaryRoots() {
  const container = await mkdtemp(join(await realpath(tmpdir()), 'sage-control-close-'))
  cleanups.push(() => rm(container, { recursive: true, force: true }))
  const root = join(container, 'Sage')
  const home = join(container, 'home')
  await mkdir(home, { mode: 0o700 })
  await mkdir(join(root, 'data', 'business-matter'), { mode: 0o700, recursive: true })
  return { root, home }
}

describe('the synchronous control closure (ADR-0317 D4)', () => {
  it('closes the attempt as succeeded, and the matter admits the next attempt again', async () => {
    const { root, home } = await temporaryRoots()
    const { attempts, recorder } = await seeded(root, home)

    await recorder({ matterRef: MATTER_ID, attemptId: ATTEMPT_ID, outcome: { state: 'succeeded' } })

    const read = attempts.readMatter(MATTER_ID)
    expect(read).toBeDefined()
    if (read === undefined || 'denied' in read) throw new Error('matter must read')
    expect(projectBusinessMatter(read.matter).activeAttemptId).toBeUndefined()
    expect(read.matter.events.some((event) => event.type === 'attempt-succeeded')).toBe(true)
  })

  it('closes a determinate refusal as failed with the code in the reason', async () => {
    const { root, home } = await temporaryRoots()
    const { attempts, recorder } = await seeded(root, home)

    await recorder({ matterRef: MATTER_ID, attemptId: ATTEMPT_ID, outcome: { state: 'failed', code: 'approval-not-pending' } })

    const read = attempts.readMatter(MATTER_ID)
    if (read === undefined || 'denied' in read) throw new Error('matter must read')
    expect(projectBusinessMatter(read.matter).activeAttemptId).toBeUndefined()
    const failure = read.matter.events.find((event) => event.type === 'attempt-failed')
    if (failure?.type !== 'attempt-failed') throw new Error('the failure closure must land')
    expect(failure.source).toBe('other')
    expect(failure.reason).toContain('approval-not-pending')
  })

  it('is silent for a missing matter, a foreign attempt and a second close', async () => {
    const { root, home } = await temporaryRoots()
    const { attempts, recorder } = await seeded(root, home)

    await expect(recorder({ matterRef: 'matter:sage.missing', attemptId: ATTEMPT_ID, outcome: { state: 'succeeded' } }))
      .resolves.toBeUndefined()
    await expect(recorder({ matterRef: MATTER_ID, attemptId: 'attempt:sage.foreign', outcome: { state: 'succeeded' } }))
      .resolves.toBeUndefined()
    await recorder({ matterRef: MATTER_ID, attemptId: ATTEMPT_ID, outcome: { state: 'succeeded' } })
    // The second close finds no active attempt; it writes nothing and never throws.
    await expect(recorder({ matterRef: MATTER_ID, attemptId: ATTEMPT_ID, outcome: { state: 'failed', code: 'x' } }))
      .resolves.toBeUndefined()
    const read = attempts.readMatter(MATTER_ID)
    if (read === undefined || 'denied' in read) throw new Error('matter must read')
    expect(read.matter.events.filter((event) => event.type === 'attempt-failed')).toHaveLength(0)
    expect(read.matter.events.filter((event) => event.type === 'attempt-succeeded')).toHaveLength(1)
  })
})
