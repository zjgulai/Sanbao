/** T05 prepare (ADR-0290): the governed local preparation write — front four ports, the user's
 *  explicit input as witness, requirement-projected policies, an idempotent revision-entered
 *  append — and the end-to-end flow where a fresh matter reaches the full ten-step chain. */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSessionPromptPrepareRunner } from '../src/main/session-prompt-prepare.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import {
  createBusinessMatter,
  enterEvidence,
  projectBusinessMatter,
  recordArtifact,
  startAttempt,
} from '../src/domain/business-matter.js'

const MATTER_ID = 'matter:sage.prepare-1'
const REVISION_ID = 'revision:sage.prepare-1'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

function budgetMatter() {
  return createBusinessMatter({
    matterId: MATTER_ID,
    eventId: `${MATTER_ID}:created`,
    occurredAt: '2026-10-10T10:00:00Z',
    goal: 'Prepare and send the first admitted prompt.',
    responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  })
}

function runner(overrides: {
  readonly matter?: ReturnType<typeof budgetMatter> | undefined
  readonly denied?: boolean
  readonly ports?: Partial<Record<'verifyCaller' | 'resolveActiveContext' | 'matchCandidate' | 'resolveIdentityPolicy', unknown>>
  readonly appendRevision?: unknown
  readonly requirementBundle?: unknown
} = {}) {
  const appended: unknown[] = []
  const bundle = loadSessionPromptRequirementBundle()
  if (!bundle.ok) throw new Error(bundle.reason)
  const matter = 'matter' in overrides ? overrides.matter : budgetMatter()
  return {
    appended,
    run: createSessionPromptPrepareRunner({
      ports: {
        verifyCaller: vi.fn(async () => ({ state: 'allowed' as const, value: { bindingRef: 'caller:session-core' } })),
        resolveActiveContext: vi.fn(async () => ({
          state: 'allowed' as const,
          value: { scope: 'request' as const, callerBindingRef: 'caller:session-core', sessionRef: 'session:active', matterRef: MATTER_ID, revisionRef: REVISION_ID, generation: '7' },
        })),
        matchCandidate: vi.fn(async () => ({ state: 'allowed' as const, value: { candidateRef: 'matter:active' } })),
        resolveIdentityPolicy: vi.fn(async () => ({ state: 'allowed' as const, value: { decisionRef: 'decision:fixture', actorScopeRef: 'actor:local' } })),
        ...(overrides.ports ?? {}),
      } as never,
      attempts: {
        readMatter: () => (overrides.denied === true ? { denied: 'not-found' } : matter === undefined ? undefined : { matter, version: 2 }),
        appendRevision: (request: { events: unknown }) => {
          appended.push(request)
          return { kind: overrides.appendRevision ?? 'appended' }
        },
      } as never,
      requirementBundle: (overrides.requirementBundle ?? bundle) as never,
      callerCorrelation: 'caller:session-core',
      now: () => '2026-10-12T00:00:00.000Z',
    }),
  }
}

describe('the governed prepare runner (ADR-0290)', () => {
  it('prepares a fresh matter: user witness, requirement policies, one revision-entered append', async () => {
    const harness = runner()
    expect(await harness.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'prepared' })
    expect(harness.appended).toHaveLength(1)
    const append = harness.appended[0] as { appendId: string, expectedVersion: unknown, events: { eventType: string, matterId: string }[] }
    expect(append.appendId).toMatch(/^session-prepare:[0-9a-f-]{36}$/u)
    expect(append.expectedVersion).toEqual({ kind: 'exact', value: 2 })
    expect(append.events.map((event) => event.eventType)).toEqual(['revision-entered'])
  })

  it('answers not-needed when a revision exists or the matter is unknown, and never calls the ports', async () => {
    const withRevision = budgetMatter()
    const prepared = enterEvidence(withRevision, {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: REVISION_ID,
      changeReason: 'x',
      scope: 'x',
      permissionBoundary: 'x',
      dataDestination: 'x',
      evidence: [{ evidenceId: 'e1', source: 'user-input', observedAt: '2026-10-10T10:00:30Z', status: 'supported' }],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: [{ actionScope: 'session.prompt', effectClass: 'external-write', requiresDecision: false }],
    })
    const exists = runner({ matter: prepared })
    expect(await exists.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'not-needed' })
    expect(exists.appended).toHaveLength(0)

    const unknown = runner({ denied: true })
    expect(await unknown.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'not-needed' })
  })

  it('refuses honestly on every front-port failure and a domain decline', async () => {
    const storeDown = runner({ matter: undefined })
    expect(await storeDown.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'refused', code: 'protected-effect-unavailable' })

    const badText = runner()
    expect(await badText.run({ matterRef: MATTER_ID, text: '' })).toEqual({ state: 'refused', code: 'invalid-session-request' })

    for (const [port, state, code] of [
      ['verifyCaller', 'denied', 'protected-effect-denied'],
      ['resolveActiveContext', 'stale', 'protected-effect-stale'],
      ['matchCandidate', 'unavailable', 'protected-effect-unavailable'],
      ['resolveIdentityPolicy', 'denied', 'protected-effect-denied'],
    ] as const) {
      const failed = runner({ ports: { [port]: vi.fn(async () => ({ state })) } })
      expect(await failed.run({ matterRef: MATTER_ID, text: 'run' }), port).toEqual({ state: 'refused', code })
      expect(failed.appended).toHaveLength(0)
    }

    // A running attempt on a revision that does NOT declare the send scope: prepare decides it
    // must enter a new revision, and the domain kernel declines (running attempt).
    const running = budgetMatter()
    const withRevision = enterEvidence(running, {
      eventId: 'm:r1',
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: 'revision:old',
      changeReason: 'x', scope: 'x', permissionBoundary: 'x', dataDestination: 'x',
      evidence: [{ evidenceId: 'e1', source: 'user-input', observedAt: '2026-10-10T10:00:30Z', status: 'supported' }],
      unknowns: [], options: [], dependencies: [], experienceRefs: [],
      actionPolicies: [{ actionScope: 'other.scope', effectClass: 'local-write', requiresDecision: false }],
    })
    const attempting = startAttempt(withRevision, {
      eventId: 'm:a1',
      occurredAt: '2026-10-10T10:02:00Z',
      attemptId: 'attempt:sage.old-1',
      revisionId: 'revision:old',
      actionScopes: ['other.scope'],
      decisionIds: [],
      executionSnapshot: {
        provider: { identity: 'provider:local', version: '1.0.0', digest: 'sha256:x' },
        model: { identity: 'model:local', version: '1.0.0', digest: 'sha256:x' },
        agent: { identity: 'agent:local', version: '1.0.0', digest: 'sha256:x' },
        preset: { identity: 'preset:local', version: '1.0.0', digest: 'sha256:x' },
        capabilities: [],
      },
      compatibility: { outcome: 'equivalent', matrixId: 'urn:sage:compatibility-matrix:sha256:x', reason: 'x' },
    })
    const declined = runner({ matter: attempting })
    expect(await declined.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'refused', code: 'session-prepare-declined' })
    expect(declined.appended).toHaveLength(0)
  })

  it('prepares over a custody-style birth revision whose policies are empty', async () => {
    // The real product shape: createMatter enters revision:1 with NO policies and insufficient
    // evidence ("a later revision declares what may run"). The runner must enter the run
    // revision rather than answer not-needed.
    const birth = enterEvidence(budgetMatter(), {
      eventId: `${MATTER_ID}:revision-1`,
      occurredAt: '2026-10-10T10:01:00Z',
      revisionId: 'revision:1',
      changeReason: 'creation', scope: 'creation', permissionBoundary: 'creation', dataDestination: 'creation',
      evidence: [{ evidenceId: 'evidence:draft-confirmation', source: 'draft:d1', observedAt: '2026-10-10T10:00:30Z', status: 'insufficient' }],
      unknowns: [], options: [], dependencies: [], experienceRefs: [],
      actionPolicies: [],
    })
    const harness = runner({ matter: birth })
    expect(await harness.run({ matterRef: MATTER_ID, text: 'run' })).toEqual({ state: 'prepared' })
    const append = harness.appended[0] as { events: { eventType: string }[] }
    expect(append.events.map((event) => event.eventType)).toEqual(['revision-entered'])
  })
})

// DEFERRED (found by this batch's end-to-end attempt, 2026-10-11): the send-time prepare hook
// cannot complete the fresh-matter flow alone. The active context binds a revision that must
// already exist when it was activated; prepare enters a NEW revision afterwards, so the send
// chain then binds a stale revisionRef and fails closed. The orchestration must move to the
// selection flow (ensure the run revision BEFORE context activation) — registered as the next
// slice of ADR-0290. The send-time hook stays: it answers not-needed honestly and is exercised
// by the step-10 end-to-end spec.
