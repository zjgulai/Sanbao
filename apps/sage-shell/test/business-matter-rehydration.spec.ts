import { describe, expect, it } from 'vitest'

import {
  createBusinessMatter,
  enterEvidence,
  failAttempt,
  projectBusinessMatter,
  reconfirmRevision,
  recordArtifact,
  recordDecision,
  recordReceipt,
  requestClarification,
  revokeDecision,
  startAttempt,
  stopMatter,
  type BusinessMatter,
} from '../src/domain/business-matter.js'
import {
  BusinessMatterCodecError,
  encodeBusinessMatterEvents,
  rehydrateBusinessMatter,
  type BusinessMatterEventEnvelope,
  type BusinessMatterCodecErrorCode,
} from '../src/domain/business-matter-codec.js'

function matter() {
  return enterEvidence(
    createBusinessMatter({
      matterId: 'matter:codec-001',
      eventId: 'event:create',
      occurredAt: '2026-09-27T00:00:00Z',
      goal: 'Prepare a reviewable draft.',
      responsibleParty: { kind: 'human', roleRef: 'role:owner' },
    }),
    {
      eventId: 'event:revision',
      occurredAt: '2026-09-27T00:01:00Z',
      revisionId: 'revision:1',
      changeReason: 'Initial evidence.',
      scope: 'Draft only.',
      permissionBoundary: 'No publication.',
      dataDestination: 'In-memory fixture.',
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
    },
  )
}

const snapshot = {
  provider: { identity: 'provider:p', version: '1', digest: 'sha256:p' },
  model: { identity: 'model:m', version: '1', digest: 'sha256:m' },
  agent: { identity: 'agent:a', version: '1', digest: 'sha256:a' },
  preset: { identity: 'preset:p', version: '1', digest: 'sha256:preset' },
  capabilities: [{ identity: 'capability:c', version: '1', digest: 'sha256:c' }],
}
const equivalent = { outcome: 'equivalent' as const, matrixId: 'matrix:1', reason: 'Equivalent.' }

function allEventHistories(): readonly BusinessMatter[] {
  const protectedRevision = enterEvidence(createBusinessMatter({
    matterId: 'matter:all-1', eventId: 'all:create', occurredAt: '2026-09-27T01:00:00Z',
    goal: 'Protected completion.', responsibleParty: { kind: 'human', roleRef: 'role:owner' },
  }), {
    eventId: 'all:revision', occurredAt: '2026-09-27T01:01:00Z', revisionId: 'revision:1',
    changeReason: 'Initial.', scope: 'Publish.', permissionBoundary: 'Approved only.',
    dataDestination: 'Fixture.', evidence: [{ evidenceId: 'e:1', source: 'fixture', observedAt: '2026-09-27T01:00:30Z', status: 'supported' }],
    unknowns: [], options: [], dependencies: [], experienceRefs: [],
    actionPolicies: [{ actionScope: 'publish', effectClass: 'external-write', requiresDecision: true }],
  })
  const clarifying = requestClarification(protectedRevision, {
    eventId: 'all:clarify', occurredAt: '2026-09-27T01:02:00Z', revisionId: 'revision:1', actionScope: 'publish', reason: 'Approve.',
  })
  const approved = recordDecision(clarifying, {
    eventId: 'all:decision-1', occurredAt: '2026-09-27T01:03:00Z', decisionId: 'decision:1', revisionId: 'revision:1', actionScope: 'publish', outcome: 'approved', actor: { kind: 'human', roleRef: 'role:owner' }, reason: 'Approve once.', expiresAt: undefined,
  })
  const revoked = revokeDecision(approved, { eventId: 'all:revoke', occurredAt: '2026-09-27T01:04:00Z', decisionId: 'decision:1', reason: 'Replace.' })
  const reapproved = recordDecision(revoked, {
    eventId: 'all:decision-2', occurredAt: '2026-09-27T01:05:00Z', decisionId: 'decision:2', revisionId: 'revision:1', actionScope: 'publish', outcome: 'approved', actor: { kind: 'human', roleRef: 'role:owner' }, reason: 'Final approval.', expiresAt: undefined,
  })
  const running = startAttempt(reapproved, {
    eventId: 'all:attempt', occurredAt: '2026-09-27T01:06:00Z', attemptId: 'attempt:1', revisionId: 'revision:1', actionScopes: ['publish'], decisionIds: ['decision:2'], executionSnapshot: snapshot, compatibility: equivalent,
  })
  const artifact = recordArtifact(running, { eventId: 'all:artifact', occurredAt: '2026-09-27T01:07:00Z', artifactId: 'artifact:1', attemptId: 'attempt:1', kind: 'draft', locator: 'memory:1', digest: 'sha256:1' })
  const completed = recordReceipt(artifact, { eventId: 'all:receipt', occurredAt: '2026-09-27T01:08:00Z', receiptId: 'receipt:1', artifactId: 'artifact:1', verdict: 'accepted', actor: { kind: 'human', roleRef: 'role:owner' }, reason: 'Accepted.', evidenceRefs: ['review:1'] })

  const firstRun = startAttempt(matter(), { eventId: 'retry:attempt-1', occurredAt: '2026-09-27T00:02:00Z', attemptId: 'attempt:1', revisionId: 'revision:1', actionScopes: ['draft.prepare'], decisionIds: [], executionSnapshot: snapshot, compatibility: equivalent })
  const failed = failAttempt(firstRun, { eventId: 'retry:failed-1', occurredAt: '2026-09-27T00:03:00Z', attemptId: 'attempt:1', source: 'tool', reason: 'Failed.', impact: 'No artifact.' })
  const reconfirmed = reconfirmRevision(failed, { eventId: 'retry:reconfirm', occurredAt: '2026-09-27T00:04:00Z', revisionId: 'revision:1', compatibility: equivalent, reason: 'Retry.' })
  const secondRun = startAttempt(reconfirmed, { eventId: 'retry:attempt-2', occurredAt: '2026-09-27T00:05:00Z', attemptId: 'attempt:2', revisionId: 'revision:1', actionScopes: ['draft.prepare'], decisionIds: [], executionSnapshot: snapshot, compatibility: equivalent })
  const failedAgain = failAttempt(secondRun, { eventId: 'retry:failed-2', occurredAt: '2026-09-27T00:06:00Z', attemptId: 'attempt:2', source: 'runtime', reason: 'Stopped.', impact: 'No completion.' })
  const stopped = stopMatter(failedAgain, { eventId: 'retry:stop', occurredAt: '2026-09-27T00:07:00Z', revisionId: 'revision:1', reason: 'Stop.' })
  return [completed, stopped]
}

function expectCodecError(
  action: () => unknown,
  code: BusinessMatterCodecErrorCode,
): BusinessMatterCodecError {
  try {
    action()
  } catch (error) {
    if (!(error instanceof BusinessMatterCodecError)) throw error
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`Expected BusinessMatterCodecError(${code})`)
}

function replacePayload(
  envelope: BusinessMatterEventEnvelope,
  mutate: (payload: Record<string, unknown>) => void,
): BusinessMatterEventEnvelope {
  const payload = JSON.parse(new TextDecoder().decode(envelope.payloadBytes)) as Record<string, unknown>
  mutate(payload)
  return { ...envelope, payloadBytes: new TextEncoder().encode(JSON.stringify(payload)) }
}

describe('BusinessMatter WT-02A.1 codec and strict rehydration', () => {
  it('accepts unknown only after validating the top-level array and exact envelope keys', () => {
    expectCodecError(() => rehydrateBusinessMatter(null), 'invalid-envelope')
    expectCodecError(() => rehydrateBusinessMatter({}), 'invalid-envelope')
    expectCodecError(() => rehydrateBusinessMatter([]), 'invalid-envelope')

    const [first, ...rest] = encodeBusinessMatterEvents(matter())
    const extra = { ...first!, unexpected: true }
    expectCodecError(() => rehydrateBusinessMatter([extra, ...rest]), 'invalid-envelope')

    const symbol = Symbol('unexpected')
    const symbolExtra = { ...first!, [symbol]: true }
    expectCodecError(() => rehydrateBusinessMatter([symbolExtra, ...rest]), 'invalid-envelope')

    const hiddenExtra = { ...first! }
    Object.defineProperty(hiddenExtra, 'hidden', { value: true, enumerable: false })
    expectCodecError(() => rehydrateBusinessMatter([hiddenExtra, ...rest]), 'invalid-envelope')
  })

  it('does not execute an envelope getter or leak revoked Proxy introspection errors', () => {
    const [first] = encodeBusinessMatterEvents(matter())
    const throwingGetter = { ...first! }
    Object.defineProperty(throwingGetter, 'eventId', {
      enumerable: true,
      get(): never {
        throw new Error('untrusted getter executed')
      },
    })
    expectCodecError(() => rehydrateBusinessMatter([throwingGetter]), 'invalid-envelope')

    let streamGetExecuted = false
    const guardedStream = new Proxy([first!], {
      get(target, property, receiver) {
        streamGetExecuted = true
        return Reflect.get(target, property, receiver)
      },
    })
    expect(rehydrateBusinessMatter(guardedStream).events).toHaveLength(1)
    expect(streamGetExecuted).toBe(false)

    const envelopeProxy = Proxy.revocable(first!, {})
    envelopeProxy.revoke()
    expectCodecError(() => rehydrateBusinessMatter([envelopeProxy.proxy]), 'invalid-envelope')

    const arrayProxy = Proxy.revocable([first!], {})
    arrayProxy.revoke()
    expectCodecError(() => rehydrateBusinessMatter(arrayProxy.proxy), 'invalid-envelope')
  })
  it('round-trips v1 envelopes through public-command semantic replay', () => {
    const original = matter()
    const envelopes = encodeBusinessMatterEvents(original)
    const restored = rehydrateBusinessMatter(envelopes)

    expect(envelopes.map(({ streamVersion, eventSchemaVersion }) => ({
      streamVersion,
      eventSchemaVersion,
    }))).toEqual([
      { streamVersion: 1, eventSchemaVersion: 1 },
      { streamVersion: 2, eventSchemaVersion: 1 },
    ])
    expect(restored.events).toEqual(original.events)
    expect(projectBusinessMatter(restored)).toEqual(projectBusinessMatter(original))
  })

  it('round-trips two histories whose independent expected set covers all 11 event types', () => {
    const expected = new Set([
      'matter-created', 'revision-entered', 'clarification-requested',
      'decision-recorded', 'decision-revoked', 'attempt-started', 'attempt-failed',
      'revision-reconfirmed', 'artifact-recorded', 'receipt-recorded', 'matter-stopped',
    ])
    const actual = new Set<string>()
    for (const history of allEventHistories()) {
      const envelopes = encodeBusinessMatterEvents(history)
      envelopes.forEach((event) => actual.add(event.eventType))
      expect(rehydrateBusinessMatter(envelopes).events).toEqual(history.events)
    }
    expect(actual).toEqual(expected)
  })

  it('round-trips a rejected artifact followed by a new attempt and latest artifact', () => {
    const run1 = startAttempt(matter(), {
      eventId: 'multi:attempt-1', occurredAt: '2026-09-27T00:02:00Z', attemptId: 'attempt:1',
      revisionId: 'revision:1', actionScopes: ['draft.prepare'], decisionIds: [], executionSnapshot: snapshot, compatibility: equivalent,
    })
    const artifact1 = recordArtifact(run1, {
      eventId: 'multi:artifact-1', occurredAt: '2026-09-27T00:03:00Z', artifactId: 'artifact:1', attemptId: 'attempt:1', kind: 'draft', locator: 'memory:1', digest: 'sha256:1',
    })
    const rejected = recordReceipt(artifact1, {
      eventId: 'multi:receipt-1', occurredAt: '2026-09-27T00:04:00Z', receiptId: 'receipt:1', artifactId: 'artifact:1', verdict: 'rejected', actor: { kind: 'human', roleRef: 'role:owner' }, reason: 'Revise.', evidenceRefs: ['review:1'],
    })
    const reconfirmed = reconfirmRevision(rejected, {
      eventId: 'multi:reconfirm', occurredAt: '2026-09-27T00:05:00Z', revisionId: 'revision:1', compatibility: equivalent, reason: 'Retry.',
    })
    const run2 = startAttempt(reconfirmed, {
      eventId: 'multi:attempt-2', occurredAt: '2026-09-27T00:06:00Z', attemptId: 'attempt:2',
      revisionId: 'revision:1', actionScopes: ['draft.prepare'], decisionIds: [], executionSnapshot: snapshot, compatibility: equivalent,
    })
    const artifact2 = recordArtifact(run2, {
      eventId: 'multi:artifact-2', occurredAt: '2026-09-27T00:07:00Z', artifactId: 'artifact:2', attemptId: 'attempt:2', kind: 'draft', locator: 'memory:2', digest: 'sha256:2',
    })
    const envelopes = encodeBusinessMatterEvents(artifact2)
    expect(rehydrateBusinessMatter(envelopes).events).toEqual(artifact2.events)
    expect(projectBusinessMatter(rehydrateBusinessMatter(envelopes)).artifacts.map((item) => item.artifactId)).toEqual(['artifact:1', 'artifact:2'])
  })

  it.each([
    ['unsupported-event-type', (events: BusinessMatterEventEnvelope[]) => [
      { ...events[0]!, eventType: 'matter-invented' },
      ...events.slice(1),
    ]],
    ['unsupported-schema', (events: BusinessMatterEventEnvelope[]) => [
      { ...events[0]!, eventSchemaVersion: 2 },
      ...events.slice(1),
    ]],
    ['stream-version-gap', (events: BusinessMatterEventEnvelope[]) => [
      events[0]!,
      { ...events[1]!, streamVersion: 3 },
    ]],
    ['duplicate-event-id', (events: BusinessMatterEventEnvelope[]) => [
      events[0]!,
      { ...events[1]!, eventId: events[0]!.eventId },
    ]],
    ['matter-identity-mismatch', (events: BusinessMatterEventEnvelope[]) => [
      events[0]!,
      { ...events[1]!, matterId: 'matter:other' },
    ]],
  ] as const)('rejects %s before creating a branded aggregate', (code, mutate) => {
    expectCodecError(
      () => rehydrateBusinessMatter(mutate([...encodeBusinessMatterEvents(matter())])),
      code,
    )
  })

  it('rejects invalid UTF-8 and invalid JSON payload bytes', () => {
    const events = [...encodeBusinessMatterEvents(matter())]
    expectCodecError(
      () => rehydrateBusinessMatter([
        { ...events[0]!, payloadBytes: Uint8Array.from([0xc3, 0x28]) },
        ...events.slice(1),
      ]),
      'invalid-payload',
    )
    expectCodecError(
      () => rehydrateBusinessMatter([
        { ...events[0]!, payloadBytes: new TextEncoder().encode('{') },
        ...events.slice(1),
      ]),
      'invalid-payload',
    )
  })

  it('rejects payload identity and derived metadata forgery', () => {
    const events = [...encodeBusinessMatterEvents(matter())]
    expectCodecError(
      () => rehydrateBusinessMatter([
        replacePayload(events[0]!, (payload) => { payload.matterId = 'matter:payload-other' }),
        ...events.slice(1),
      ]),
      'matter-identity-mismatch',
    )
    expectCodecError(
      () => rehydrateBusinessMatter([
        events[0]!,
        replacePayload(events[1]!, (payload) => {
          const revision = payload.revision as Record<string, unknown>
          revision.predecessorRevisionId = 'revision:forged'
        }),
      ]),
      'semantic-replay-failed',
    )
  })

  it('returns named codec errors for malformed envelope and payload shapes', () => {
    const events = [...encodeBusinessMatterEvents(matter())]
    for (const bad of [null, [], 1, 'event']) {
      expectCodecError(() => rehydrateBusinessMatter([bad]), 'invalid-envelope')
    }
    expectCodecError(
      () => rehydrateBusinessMatter([{ ...events[0]!, eventId: 3 }]),
      'invalid-envelope',
    )
    for (const payload of ['null', '[]', '1']) {
      expectCodecError(
        () => rehydrateBusinessMatter([{ ...events[0]!, payloadBytes: new TextEncoder().encode(payload) }]),
        'invalid-payload',
      )
    }
    for (const field of ['eventId', 'type', 'occurredAt'] as const) {
      expectCodecError(
        () => rehydrateBusinessMatter([
          replacePayload(events[0]!, (payload) => { payload[field] = 'forged' }),
        ]),
        'invalid-payload',
      )
    }
    expectCodecError(
      () => rehydrateBusinessMatter([
        events[0]!,
        replacePayload({ ...events[1]!, occurredAt: '2026-09-26T23:59:00Z' }, (payload) => {
          payload.occurredAt = '2026-09-26T23:59:00Z'
        }),
      ]),
      'semantic-replay-failed',
    )
    expectCodecError(
      () => rehydrateBusinessMatter([{ ...events[1]!, streamVersion: 1 }]),
      'semantic-replay-failed',
    )
    const secondCreate = replacePayload({
      ...events[0]!, streamVersion: 2, eventId: 'event:create-2', occurredAt: '2026-09-27T00:02:00Z',
    }, (payload) => {
      payload.eventId = 'event:create-2'
      payload.occurredAt = '2026-09-27T00:02:00Z'
    })
    expectCodecError(
      () => rehydrateBusinessMatter([events[0]!, secondCreate]),
      'semantic-replay-failed',
    )
    expectCodecError(
      () => rehydrateBusinessMatter([replacePayload(events[0]!, (payload) => { payload.unknown = true })]),
      'invalid-payload',
    )
  })

  it('rejects forged command-derived fields across six event families', () => {
    const completed = allEventHistories()[0]!
    const envelopes = encodeBusinessMatterEvents(completed)
    const mutations: Readonly<Record<string, {
      readonly code: BusinessMatterCodecErrorCode
      readonly mutate: (payload: Record<string, unknown>) => void
    }>> = {
      'revision-entered': {
        code: 'semantic-replay-failed',
        mutate: (payload) => {
          ;(payload.revision as Record<string, unknown>).createdByEventId = 'forged'
        },
      },
      'clarification-requested': {
        code: 'semantic-replay-failed',
        mutate: (payload) => { payload.attemptId = 'attempt:forged' },
      },
      'decision-recorded': {
        code: 'semantic-replay-failed',
        mutate: (payload) => {
          ;(payload.decision as Record<string, unknown>).recordedAt = '2026-09-27T09:00:00Z'
        },
      },
      'attempt-started': {
        code: 'invalid-payload',
        mutate: (payload) => {
          ;(payload.attempt as Record<string, unknown>).status = 'succeeded'
        },
      },
      'artifact-recorded': {
        code: 'invalid-payload',
        mutate: (payload) => { payload.revisionId = 'revision:forged' },
      },
      'receipt-recorded': {
        code: 'invalid-payload',
        mutate: (payload) => { payload.revisionId = 'revision:forged' },
      },
    }
    for (const [eventType, { code, mutate }] of Object.entries(mutations)) {
      const index = envelopes.findIndex((event) => event.eventType === eventType)
      const forged = [...envelopes]
      forged[index] = replacePayload(envelopes[index]!, mutate)
      expectCodecError(() => rehydrateBusinessMatter(forged), code)
    }
  })

  it.each([
    ['revision-entered', 'revision'],
    ['decision-recorded', 'decision'],
    ['attempt-started', 'attempt'],
    ['artifact-recorded', 'artifact'],
    ['receipt-recorded', 'receipt'],
  ] as const)('rejects malformed %s nested containers as invalid-payload', (eventType, field) => {
    const envelopes = encodeBusinessMatterEvents(allEventHistories()[0]!)
    const index = envelopes.findIndex((event) => event.eventType === eventType)
    for (const malformed of [undefined, null, 7]) {
      const forged = [...envelopes]
      forged[index] = replacePayload(envelopes[index]!, (payload) => {
        if (malformed === undefined) delete payload[field]
        else payload[field] = malformed
      })
      expectCodecError(() => rehydrateBusinessMatter(forged), 'invalid-payload')
    }
  })

  it.each(['evidence', 'unknowns', 'dependencies', 'experienceRefs', 'actionPolicies'] as const)(
    'rejects null and primitive items in revision.%s before domain replay',
    (field) => {
      const envelopes = encodeBusinessMatterEvents(matter())
      for (const malformed of [null, 3]) {
        const forged = [...envelopes]
        forged[1] = replacePayload(envelopes[1]!, (payload) => {
          const revision = payload.revision as Record<string, unknown>
          revision[field] = [malformed]
        })
        expectCodecError(() => rehydrateBusinessMatter(forged), 'invalid-payload')
      }
    },
  )

  describe('payload runtime codec', () => {
    const malformedByEventType: Readonly<Record<string, (payload: Record<string, unknown>) => void>> = {
      'matter-created': (payload) => { payload.goal = 7 },
      'revision-entered': (payload) => {
        ;(payload.revision as Record<string, unknown>).options = [7]
      },
      'clarification-requested': (payload) => { payload.actionScope = null },
      'decision-recorded': (payload) => {
        ;(payload.decision as Record<string, unknown>).outcome = 'maybe'
      },
      'decision-revoked': (payload) => { payload.decisionId = 7 },
      'attempt-started': (payload) => {
        ;(payload.attempt as Record<string, unknown>).actionScopes = [7]
      },
      'attempt-failed': (payload) => { payload.source = 'mystery' },
      'revision-reconfirmed': (payload) => {
        ;(payload.compatibility as Record<string, unknown>).outcome = 'mystery'
      },
      'artifact-recorded': (payload) => {
        ;(payload.artifact as Record<string, unknown>).kind = 7
      },
      'receipt-recorded': (payload) => {
        ;(payload.receipt as Record<string, unknown>).evidenceRefs = [7]
      },
      'matter-stopped': (payload) => { payload.revisionId = 7 },
    }

    it('validates event-specific fields for all 11 event types before replay', () => {
      const envelopes = allEventHistories().flatMap((history) => encodeBusinessMatterEvents(history))
      for (const [eventType, mutate] of Object.entries(malformedByEventType)) {
        const envelope = envelopes.find((candidate) => candidate.eventType === eventType)
        expect(envelope, `missing fixture for ${eventType}`).toBeDefined()
        expectCodecError(
          () => rehydrateBusinessMatter([
            replacePayload({ ...envelope!, streamVersion: 1 }, mutate),
          ]),
          'invalid-payload',
        )
      }
    })

    it('rejects unknown fields for all 11 v1 payload shapes', () => {
      const envelopes = allEventHistories().flatMap((history) => encodeBusinessMatterEvents(history))
      for (const eventType of new Set(envelopes.map((event) => event.eventType))) {
        const envelope = envelopes.find((candidate) => candidate.eventType === eventType)!
        expectCodecError(
          () => rehydrateBusinessMatter([
            replacePayload({ ...envelope, streamVersion: 1 }, (payload) => {
              payload.unexpected = true
            }),
          ]),
          'invalid-payload',
        )
      }
    })

    it('rejects semantically equivalent but non-canonical payload bytes', () => {
      const [first] = encodeBusinessMatterEvents(matter())
      const original = new TextDecoder().decode(first!.payloadBytes)
      const nonCanonical = {
        ...first!,
        payloadBytes: new TextEncoder().encode(` ${original}`),
      }
      expectCodecError(
        () => rehydrateBusinessMatter([nonCanonical]),
        'non-canonical-payload',
      )
    })

    it('rejects calendar-normalized UTC timestamps in envelopes and nested payloads', () => {
      const invalidTimestamp = '2026-02-31T00:00:00Z'
      const events = [...encodeBusinessMatterEvents(matter())]
      expectCodecError(
        () => rehydrateBusinessMatter([
          replacePayload({ ...events[0]!, occurredAt: invalidTimestamp }, (payload) => {
            payload.occurredAt = invalidTimestamp
          }),
        ]),
        'invalid-envelope',
      )

      const malformed = [...events]
      malformed[1] = replacePayload(events[1]!, (payload) => {
        const revision = payload.revision as Record<string, unknown>
        const [evidence] = revision.evidence as Record<string, unknown>[]
        evidence!.observedAt = invalidTimestamp
      })
      expectCodecError(
        () => rehydrateBusinessMatter(malformed),
        'invalid-payload',
      )
    })
  })

  describe('envelope order and identity', () => {
    it('uses a dedicated stream-version-gap error with event context', () => {
      const [first] = encodeBusinessMatterEvents(matter())
      const error = expectCodecError(
        () => rehydrateBusinessMatter([{ ...first!, streamVersion: 2 }]),
        'stream-version-gap',
      )
      expect(error.eventIndex).toBe(0)
      expect(error.streamVersion).toBe(2)
      expect(error.eventId).toBe(first!.eventId)
      expect(error.field).toBe('streamVersion')
    })

    it('does not mutate caller-owned envelopes or payload bytes', () => {
      const envelopes = encodeBusinessMatterEvents(matter()).map((envelope) => ({
        ...envelope,
        payloadBytes: envelope.payloadBytes.slice(),
      }))
      const before = envelopes.map((envelope) => ({
        ...envelope,
        payloadBytes: [...envelope.payloadBytes],
      }))
      rehydrateBusinessMatter(envelopes)
      expect(envelopes.map((envelope) => ({
        ...envelope,
        payloadBytes: [...envelope.payloadBytes],
      }))).toEqual(before)
    })
  })

  describe('semantic replay', () => {
    it('preserves the original domain error code and event coordinates', () => {
      const completed = allEventHistories()[0]!
      const envelopes = [...encodeBusinessMatterEvents(completed)]
      const receiptIndex = envelopes.findIndex((event) => event.eventType === 'receipt-recorded')
      envelopes[receiptIndex] = replacePayload(envelopes[receiptIndex]!, (payload) => {
        const receipt = payload.receipt as Record<string, unknown>
        receipt.actor = { kind: 'human', roleRef: 'role:not-owner' }
      })
      const error = expectCodecError(
        () => rehydrateBusinessMatter(envelopes),
        'semantic-replay-failed',
      )
      expect(error.domainCode).toBe('receipt-authority')
      expect(error.eventIndex).toBe(receiptIndex)
      expect(error.streamVersion).toBe(receiptIndex + 1)
      expect(error.eventId).toBe(envelopes[receiptIndex]!.eventId)
    })
  })

  describe('forged receipt', () => {
    function completedEnvelopes(): BusinessMatterEventEnvelope[] {
      return [...encodeBusinessMatterEvents(allEventHistories()[0]!)]
    }

    it('rejects an accepted receipt when the artifact event is absent', () => {
      const envelopes = completedEnvelopes()
      const artifactIndex = envelopes.findIndex((event) => event.eventType === 'artifact-recorded')
      const withoutArtifact = envelopes.filter((_, index) => index !== artifactIndex)
        .map((event, index) => ({ ...event, streamVersion: index + 1 }))
      const error = expectCodecError(
        () => rehydrateBusinessMatter(withoutArtifact),
        'semantic-replay-failed',
      )
      expect(error.domainCode).toBe('invalid-transition')
    })

    it('rejects a receipt from a different responsible role', () => {
      const envelopes = completedEnvelopes()
      const index = envelopes.findIndex((event) => event.eventType === 'receipt-recorded')
      envelopes[index] = replacePayload(envelopes[index]!, (payload) => {
        const receipt = payload.receipt as Record<string, unknown>
        receipt.actor = { kind: 'human', roleRef: 'role:not-owner' }
      })
      const error = expectCodecError(
        () => rehydrateBusinessMatter(envelopes),
        'semantic-replay-failed',
      )
      expect(error.domainCode).toBe('receipt-authority')
    })

    it('rejects a receipt without evidence references', () => {
      const envelopes = completedEnvelopes()
      const index = envelopes.findIndex((event) => event.eventType === 'receipt-recorded')
      envelopes[index] = replacePayload(envelopes[index]!, (payload) => {
        const receipt = payload.receipt as Record<string, unknown>
        receipt.evidenceRefs = []
      })
      const error = expectCodecError(
        () => rehydrateBusinessMatter(envelopes),
        'semantic-replay-failed',
      )
      expect(error.domainCode).toBe('invalid-input')
    })

    it('rejects a receipt whose time precedes the previous event', () => {
      const envelopes = completedEnvelopes()
      const index = envelopes.findIndex((event) => event.eventType === 'receipt-recorded')
      const occurredAt = '2026-09-27T00:00:00Z'
      envelopes[index] = replacePayload({ ...envelopes[index]!, occurredAt }, (payload) => {
        payload.occurredAt = occurredAt
      })
      const error = expectCodecError(
        () => rehydrateBusinessMatter(envelopes),
        'semantic-replay-failed',
      )
      expect(error.domainCode).toBe('invalid-input')
    })
  })
})
