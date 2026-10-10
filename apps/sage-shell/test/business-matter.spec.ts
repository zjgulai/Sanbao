import { describe, expect, it } from 'vitest'

import {
  BusinessMatterError,
  createBusinessMatter,
  enterEvidence,
  failAttempt,
  markDispatchUnknown,
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
  type BusinessMatterErrorCode,
  type CompatibilityDecision,
  type EffectClass,
  type EnterEvidenceInput,
  type ExecutionSnapshot,
  type StartAttemptInput,
} from '../src/domain/business-matter.js'

const RESPONSIBLE = {
  kind: 'human' as const,
  roleRef: 'role:catalog-owner',
}

const EQUIVALENT: CompatibilityDecision = {
  outcome: 'equivalent',
  matrixId: 'matrix:wt-01-v1',
  reason: 'The approved version set is equivalent for this revision.',
}

function versioned(identity: string, version = '1.0.0') {
  return {
    identity,
    version,
    digest: `sha256:${identity}-${version}`,
  }
}

function executionSnapshot(version = '1.0.0'): ExecutionSnapshot {
  return {
    provider: versioned('provider:local', version),
    model: versioned('model:reasoning', version),
    agent: versioned('agent:catalog-operator', version),
    preset: versioned('preset:catalog-draft', version),
    capabilities: [versioned('capability:content-draft', version)],
  }
}

function createdMatter(): BusinessMatter {
  return createBusinessMatter({
    matterId: 'matter:catalog-001',
    eventId: 'event:create',
    occurredAt: '2026-09-27T00:00:00Z',
    goal: 'Prepare a reviewable product content package for the selected channel.',
    responsibleParty: RESPONSIBLE,
  })
}

function readyRevision(
  matter = createdMatter(),
  overrides: Partial<EnterEvidenceInput> = {},
): BusinessMatter {
  return enterEvidence(matter, {
    eventId: 'event:revision-1',
    occurredAt: '2026-09-27T00:01:00Z',
    revisionId: 'revision:1',
    changeReason: 'Initial evidence boundary.',
    scope: 'Produce a draft content package; do not publish it.',
    permissionBoundary: 'Draft and review only.',
    dataDestination: 'In-memory WT-01 test projection.',
    evidence: [
      {
        evidenceId: 'evidence:product-brief',
        source: 'fixture:product-brief',
        observedAt: '2026-09-27T00:00:30Z',
        status: 'supported',
      },
    ],
    unknowns: [],
    options: ['Prepare a channel-ready draft'],
    dependencies: [
      {
        dependencyId: 'dependency:channel-rules',
        status: 'ready',
      },
    ],
    experienceRefs: [],
    actionPolicies: [
      {
        actionScope: 'catalog.prepare-draft',
        effectClass: 'local-write',
        requiresDecision: false,
      },
    ],
    ...overrides,
  })
}

function startReadyAttempt(
  matter = readyRevision(),
  overrides: Partial<StartAttemptInput> = {},
): BusinessMatter {
  return startAttempt(matter, {
    eventId: 'event:attempt-1',
    occurredAt: '2026-09-27T00:02:00Z',
    attemptId: 'attempt:1',
    revisionId: 'revision:1',
    actionScopes: ['catalog.prepare-draft'],
    decisionIds: [],
    executionSnapshot: executionSnapshot(),
    compatibility: EQUIVALENT,
    ...overrides,
  })
}

function expectDomainError(
  action: () => unknown,
  expectedCode: BusinessMatterErrorCode,
): void {
  try {
    action()
  } catch (error) {
    if (!(error instanceof BusinessMatterError)) {
      throw error
    }
    expect(error.code).toBe(expectedCode)
    return
  }

  throw new Error(`Expected BusinessMatterError(${expectedCode})`)
}

describe('BusinessMatter WT-01 domain kernel', () => {
  it('creates the matter without inventing an empty revision or attempt', () => {
    const matter = createdMatter()
    const state = projectBusinessMatter(matter)

    expect(state.stage).toBe('created')
    expect(state.currentRevisionId).toBeUndefined()
    expect(state.activeAttemptId).toBeUndefined()
    expect(state.revisions).toEqual([])
    expect(state.attempts).toEqual([])
    expect(matter.events.map((event) => event.type)).toEqual(['matter-created'])
  })

  it('makes the event authority and returned projection immutable at runtime', () => {
    const matter = readyRevision()
    const state = projectBusinessMatter(matter)

    expect(Object.isFrozen(matter)).toBe(true)
    expect(Object.isFrozen(matter.events)).toBe(true)
    expect(Object.isFrozen(matter.events[0])).toBe(true)
    expect(Object.isFrozen(state)).toBe(true)
    expect(Object.isFrozen(state.revisions)).toBe(true)
    expect(Object.isFrozen(state.revisions[0]?.evidence)).toBe(true)
  })

  it('rejects an aggregate forged by copying the private symbol', () => {
    const legitimate = createdMatter()
    const symbols = Object.getOwnPropertySymbols(legitimate)
    const forged = {
      [symbols[0]!]: true,
      events: legitimate.events,
    } as BusinessMatter

    expectDomainError(() => projectBusinessMatter(forged), 'invalid-event-stream')
  })

  it('rejects UTC-looking timestamps that normalize to another calendar instant', () => {
    expectDomainError(
      () => createBusinessMatter({
        matterId: 'matter:invalid-calendar-time',
        eventId: 'event:create-invalid-calendar-time',
        occurredAt: '2026-02-31T00:00:00Z',
        goal: 'This matter must not be created.',
        responsibleParty: RESPONSIBLE,
      }),
      'invalid-input',
    )
  })

  it('rejects an evidence revision with neither evidence nor an explicit unknown', () => {
    const matter = createdMatter()

    expectDomainError(
      () =>
        readyRevision(matter, {
          evidence: [],
          unknowns: [],
        }),
      'invalid-input',
    )
    expectDomainError(
      () =>
        readyRevision(matter, {
          evidence: [
            {
              evidenceId: 'evidence:from-the-future',
              source: 'fixture:future',
              observedAt: '2026-09-27T00:02:00Z',
              status: 'supported',
            },
          ],
        }),
      'invalid-input',
    )
    expect(projectBusinessMatter(matter).stage).toBe('created')
  })

  it('creates a new immutable revision when a business boundary changes', () => {
    const first = readyRevision()
    const second = enterEvidence(first, {
      eventId: 'event:revision-2',
      occurredAt: '2026-09-27T00:02:00Z',
      revisionId: 'revision:2',
      changeReason: 'The destination channel changed.',
      scope: 'Prepare a second-channel draft; do not publish it.',
      permissionBoundary: 'Draft and review only.',
      dataDestination: 'In-memory WT-01 second-channel projection.',
      evidence: [
        {
          evidenceId: 'evidence:channel-2-rules',
          source: 'fixture:channel-2-rules',
          observedAt: '2026-09-27T00:01:30Z',
          status: 'supported',
        },
      ],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: [
        {
          actionScope: 'catalog.prepare-draft',
          effectClass: 'local-write',
          requiresDecision: false,
        },
      ],
    })

    expect(projectBusinessMatter(first).currentRevisionId).toBe('revision:1')
    expect(projectBusinessMatter(first).revisions).toHaveLength(1)
    expect(projectBusinessMatter(second).currentRevisionId).toBe('revision:2')
    expect(projectBusinessMatter(second).revisions).toHaveLength(2)
    expect(projectBusinessMatter(second).revisions[1]?.predecessorRevisionId).toBe(
      'revision:1',
    )
    expectDomainError(
      () =>
        requestClarification(first, {
          eventId: 'event:backdated-clarification',
          occurredAt: '2026-09-27T00:00:59Z',
          revisionId: 'revision:1',
          actionScope: undefined,
          reason: 'This event was appended after evidence but backdated before it.',
        }),
      'invalid-input',
    )
    expect(first.events).toHaveLength(2)
  })

  it.each<EffectClass>([
    'local-read',
    'local-write',
    'external-read',
    'external-write',
    'privileged',
  ])('recognizes the %s effect class independently from decision policy', (effectClass) => {
    const revision = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.prepare-draft',
          effectClass,
          requiresDecision: false,
        },
      ],
    })

    const running = startReadyAttempt(revision)
    expect(projectBusinessMatter(running).stage).toBe('running')
  })

  it('fails closed for an unknown effect class at the runtime boundary', () => {
    expectDomainError(
      () =>
        readyRevision(createdMatter(), {
          actionPolicies: [
            {
              actionScope: 'catalog.prepare-draft',
              effectClass: 'network-ish' as EffectClass,
              requiresDecision: false,
            },
          ],
        }),
      'invalid-input',
    )
  })

  it('does not create an attempt while a material unknown remains', () => {
    const revision = readyRevision(createdMatter(), {
      unknowns: [
        {
          unknownId: 'unknown:channel-policy',
          description: 'The channel policy has not been verified.',
        },
      ],
    })

    expectDomainError(() => startReadyAttempt(revision), 'evidence-not-ready')
    expect(projectBusinessMatter(revision).attempts).toEqual([])
  })

  it('does not create an attempt while a dependency is blocked or unknown', () => {
    for (const status of ['blocked', 'unknown'] as const) {
      const revision = readyRevision(createdMatter(), {
        dependencies: [
          {
            dependencyId: `dependency:${status}`,
            status,
          },
        ],
      })

      expectDomainError(() => startReadyAttempt(revision), 'evidence-not-ready')
      expect(projectBusinessMatter(revision).attempts).toEqual([])
    }
  })

  it('requires a matching approved decision for a protected action', () => {
    const revision = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })

    expectDomainError(
      () =>
        startReadyAttempt(revision, {
          actionScopes: ['catalog.publish'],
        }),
      'decision-required',
    )
  })

  it('allows a protected action only after clarification and matching approval', () => {
    const revision = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })
    const clarifying = requestClarification(revision, {
      eventId: 'event:clarification',
      occurredAt: '2026-09-27T00:02:00Z',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      reason: 'A human decision is required before external publication.',
    })
    const approved = recordDecision(clarifying, {
      eventId: 'event:decision',
      occurredAt: '2026-09-27T00:03:00Z',
      decisionId: 'decision:publish',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      outcome: 'approved',
      actor: RESPONSIBLE,
      reason: 'The draft is approved for this exact publication scope.',
      expiresAt: '2026-09-27T01:00:00Z',
    })
    const running = startReadyAttempt(approved, {
      eventId: 'event:attempt-publish',
      occurredAt: '2026-09-27T00:04:00Z',
      attemptId: 'attempt:publish',
      actionScopes: ['catalog.publish'],
      decisionIds: ['decision:publish'],
    })

    expect(projectBusinessMatter(running).stage).toBe('running')
    expect(projectBusinessMatter(running).attempts[0]?.decisionIds).toEqual([
      'decision:publish',
    ])
  })

  it('rejects a decision from a predecessor revision', () => {
    const first = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })
    const clarifying = requestClarification(first, {
      eventId: 'event:clarification-1',
      occurredAt: '2026-09-27T00:02:00Z',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      reason: 'Request approval.',
    })
    const approved = recordDecision(clarifying, {
      eventId: 'event:decision-1',
      occurredAt: '2026-09-27T00:03:00Z',
      decisionId: 'decision:revision-1',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      outcome: 'approved',
      actor: RESPONSIBLE,
      reason: 'Approved for revision 1 only.',
      expiresAt: undefined,
    })
    const second = readyRevision(approved, {
      eventId: 'event:revision-2',
      occurredAt: '2026-09-27T00:04:00Z',
      revisionId: 'revision:2',
      changeReason: 'Publication destination changed.',
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })

    expectDomainError(
      () =>
        startReadyAttempt(second, {
          eventId: 'event:attempt-2',
          occurredAt: '2026-09-27T00:05:00Z',
          attemptId: 'attempt:2',
          revisionId: 'revision:2',
          actionScopes: ['catalog.publish'],
          decisionIds: ['decision:revision-1'],
        }),
      'decision-invalid',
    )
  })

  it('rejects expired and revoked decisions', () => {
    const revision = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })
    const clarifying = requestClarification(revision, {
      eventId: 'event:clarification',
      occurredAt: '2026-09-27T00:02:00Z',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      reason: 'Request approval.',
    })
    const approved = recordDecision(clarifying, {
      eventId: 'event:decision',
      occurredAt: '2026-09-27T00:03:00Z',
      decisionId: 'decision:publish',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      outcome: 'approved',
      actor: RESPONSIBLE,
      reason: 'Short-lived approval.',
      expiresAt: '2026-09-27T00:04:00Z',
    })

    expectDomainError(
      () =>
        startReadyAttempt(approved, {
          eventId: 'event:expired-attempt',
          occurredAt: '2026-09-27T00:04:00Z',
          attemptId: 'attempt:expired',
          actionScopes: ['catalog.publish'],
          decisionIds: ['decision:publish'],
        }),
      'decision-invalid',
    )

    const revoked = revokeDecision(approved, {
      eventId: 'event:decision-revoked',
      occurredAt: '2026-09-27T00:03:30Z',
      decisionId: 'decision:publish',
      reason: 'The responsible person withdrew approval before execution.',
    })
    expectDomainError(
      () =>
        startReadyAttempt(revoked, {
          eventId: 'event:revoked-attempt',
          occurredAt: '2026-09-27T00:03:45Z',
          attemptId: 'attempt:revoked',
          actionScopes: ['catalog.publish'],
          decisionIds: ['decision:publish'],
        }),
      'decision-invalid',
    )
  })

  it('preserves a rejected decision and moves to failure/retry', () => {
    const revision = readyRevision(createdMatter(), {
      actionPolicies: [
        {
          actionScope: 'catalog.publish',
          effectClass: 'external-write',
          requiresDecision: true,
        },
      ],
    })
    const clarifying = requestClarification(revision, {
      eventId: 'event:clarification',
      occurredAt: '2026-09-27T00:02:00Z',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      reason: 'Request approval.',
    })
    const rejected = recordDecision(clarifying, {
      eventId: 'event:decision-rejected',
      occurredAt: '2026-09-27T00:03:00Z',
      decisionId: 'decision:rejected',
      revisionId: 'revision:1',
      actionScope: 'catalog.publish',
      outcome: 'rejected',
      actor: RESPONSIBLE,
      reason: 'The destination is not approved.',
      expiresAt: undefined,
    })

    const state = projectBusinessMatter(rejected)
    expect(state.stage).toBe('failed-retry')
    expect(state.decisions[0]?.status).toBe('rejected')
    expect(state.attempts).toEqual([])
  })

  it.each(['unknown', 'requires-new-revision'] as const)(
    'blocks the %s compatibility outcome',
    (outcome) => {
      expectDomainError(
        () =>
          startReadyAttempt(readyRevision(), {
            compatibility: {
              outcome,
              matrixId: 'matrix:wt-01-v1',
              reason: 'This combination cannot run against the current revision.',
            },
          }),
        'compatibility-blocked',
      )
    },
  )

  it('blocks an execution snapshot with a missing identity, version, or digest', () => {
    const malformed = executionSnapshot()
    malformed.agent.digest = ''

    expectDomainError(
      () =>
        startReadyAttempt(readyRevision(), {
          executionSnapshot: malformed,
        }),
      'compatibility-blocked',
    )
  })

  it('does not permit an in-place execution identity switch while an attempt runs', () => {
    const running = startReadyAttempt()

    expectDomainError(
      () =>
        startReadyAttempt(running, {
          eventId: 'event:attempt-2',
          occurredAt: '2026-09-27T00:03:00Z',
          attemptId: 'attempt:2',
          executionSnapshot: executionSnapshot('2.0.0'),
        }),
      'active-attempt',
    )
    expect(projectBusinessMatter(running).attempts).toHaveLength(1)
  })

  it('ends the old attempt before an equivalent combination starts a new attempt', () => {
    const running = startReadyAttempt()
    const failed = failAttempt(running, {
      eventId: 'event:attempt-1-failed',
      occurredAt: '2026-09-27T00:03:00Z',
      attemptId: 'attempt:1',
      source: 'execution-snapshot-changed',
      reason: 'The selected model identity changed during execution.',
      impact: 'The partial draft is not a completion artifact.',
    })
    const rechecked = reconfirmRevision(failed, {
      eventId: 'event:revision-reconfirmed',
      occurredAt: '2026-09-27T00:04:00Z',
      revisionId: 'revision:1',
      compatibility: EQUIVALENT,
      reason: 'The current revision remains valid for a fresh attempt.',
    })
    const restarted = startReadyAttempt(rechecked, {
      eventId: 'event:attempt-2',
      occurredAt: '2026-09-27T00:05:00Z',
      attemptId: 'attempt:2',
      executionSnapshot: executionSnapshot('2.0.0'),
    })

    const state = projectBusinessMatter(restarted)
    expect(state.attempts.map((attempt) => attempt.status)).toEqual([
      'failed',
      'running',
    ])
    expect(state.attempts.map((attempt) => attempt.attemptId)).toEqual([
      'attempt:1',
      'attempt:2',
    ])
  })

  it('does not treat an artifact as completion without an accepted receipt', () => {
    const artifact = recordArtifact(startReadyAttempt(), {
      eventId: 'event:artifact',
      occurredAt: '2026-09-27T00:03:00Z',
      artifactId: 'artifact:draft-package',
      attemptId: 'attempt:1',
      kind: 'content-package',
      locator: 'memory:artifact/draft-package',
      digest: 'sha256:draft-package',
    })
    const state = projectBusinessMatter(artifact)

    expect(state.stage).toBe('artifact-receipt')
    expect(state.conclusion).toBeUndefined()
    expect(state.artifacts).toHaveLength(1)
    expect(state.receipts).toEqual([])
  })

  it('completes only after the responsible human records an accepted receipt', () => {
    const artifact = recordArtifact(startReadyAttempt(), {
      eventId: 'event:artifact',
      occurredAt: '2026-09-27T00:03:00Z',
      artifactId: 'artifact:draft-package',
      attemptId: 'attempt:1',
      kind: 'content-package',
      locator: 'memory:artifact/draft-package',
      digest: 'sha256:draft-package',
    })
    const completed = recordReceipt(artifact, {
      eventId: 'event:receipt',
      occurredAt: '2026-09-27T00:04:00Z',
      receiptId: 'receipt:accepted',
      artifactId: 'artifact:draft-package',
      verdict: 'accepted',
      actor: RESPONSIBLE,
      reason: 'The responsible person verified the draft package.',
      evidenceRefs: ['evidence:manual-review'],
    })

    const state = projectBusinessMatter(completed)
    expect(state.conclusion).toBe('completed')
    expect(state.receipts[0]?.actor).toEqual(RESPONSIBLE)
    expect(completed.events.map((event) => event.type)).toEqual([
      'matter-created',
      'revision-entered',
      'attempt-started',
      'artifact-recorded',
      'receipt-recorded',
    ])
  })

  it('rejects a receipt signed by a different role without making an auth claim', () => {
    const artifact = recordArtifact(startReadyAttempt(), {
      eventId: 'event:artifact',
      occurredAt: '2026-09-27T00:03:00Z',
      artifactId: 'artifact:draft-package',
      attemptId: 'attempt:1',
      kind: 'content-package',
      locator: 'memory:artifact/draft-package',
      digest: 'sha256:draft-package',
    })

    expectDomainError(
      () =>
        recordReceipt(artifact, {
          eventId: 'event:receipt',
          occurredAt: '2026-09-27T00:04:00Z',
          receiptId: 'receipt:unauthorized-role',
          artifactId: 'artifact:draft-package',
          verdict: 'accepted',
          actor: {
            kind: 'human',
            roleRef: 'role:unrelated-reviewer',
          },
          reason: 'A different role attempted to accept the artifact.',
          evidenceRefs: ['evidence:manual-review'],
        }),
      'receipt-authority',
    )
    expect(projectBusinessMatter(artifact).conclusion).toBeUndefined()
  })

  it('preserves a rejected receipt and moves to failure/retry', () => {
    const artifact = recordArtifact(startReadyAttempt(), {
      eventId: 'event:artifact',
      occurredAt: '2026-09-27T00:03:00Z',
      artifactId: 'artifact:draft-package',
      attemptId: 'attempt:1',
      kind: 'content-package',
      locator: 'memory:artifact/draft-package',
      digest: 'sha256:draft-package',
    })
    const rejected = recordReceipt(artifact, {
      eventId: 'event:receipt-rejected',
      occurredAt: '2026-09-27T00:04:00Z',
      receiptId: 'receipt:rejected',
      artifactId: 'artifact:draft-package',
      verdict: 'rejected',
      actor: RESPONSIBLE,
      reason: 'The draft does not satisfy the channel rules.',
      evidenceRefs: ['evidence:manual-review'],
    })

    const state = projectBusinessMatter(rejected)
    expect(state.stage).toBe('failed-retry')
    expect(state.conclusion).toBeUndefined()
    expect(state.artifacts).toHaveLength(1)
    expect(state.receipts[0]?.verdict).toBe('rejected')
  })

  it('accepts a receipt only for the latest pending artifact', () => {
    const firstArtifact = recordArtifact(startReadyAttempt(), {
      eventId: 'event:artifact-1',
      occurredAt: '2026-09-27T00:03:00Z',
      artifactId: 'artifact:first',
      attemptId: 'attempt:1',
      kind: 'content-package',
      locator: 'memory:artifact/first',
      digest: 'sha256:first',
    })
    const rejected = recordReceipt(firstArtifact, {
      eventId: 'event:receipt-rejected',
      occurredAt: '2026-09-27T00:04:00Z',
      receiptId: 'receipt:rejected',
      artifactId: 'artifact:first',
      verdict: 'rejected',
      actor: RESPONSIBLE,
      reason: 'The first artifact needs another attempt.',
      evidenceRefs: ['evidence:first-review'],
    })
    const reconfirmed = reconfirmRevision(rejected, {
      eventId: 'event:revision-reconfirmed-after-receipt',
      occurredAt: '2026-09-27T00:05:00Z',
      revisionId: 'revision:1',
      compatibility: EQUIVALENT,
      reason: 'The same revision remains valid for a corrected artifact.',
    })
    const secondAttempt = startReadyAttempt(reconfirmed, {
      eventId: 'event:attempt-2',
      occurredAt: '2026-09-27T00:06:00Z',
      attemptId: 'attempt:2',
    })
    const secondArtifact = recordArtifact(secondAttempt, {
      eventId: 'event:artifact-2',
      occurredAt: '2026-09-27T00:07:00Z',
      artifactId: 'artifact:second',
      attemptId: 'attempt:2',
      kind: 'content-package',
      locator: 'memory:artifact/second',
      digest: 'sha256:second',
    })

    expectDomainError(
      () => recordReceipt(secondArtifact, {
        eventId: 'event:false-old-receipt',
        occurredAt: '2026-09-27T00:08:00Z',
        receiptId: 'receipt:false-old',
        artifactId: 'artifact:first',
        verdict: 'accepted',
        actor: RESPONSIBLE,
        reason: 'An old rejected artifact must not become current again.',
        evidenceRefs: ['evidence:second-review'],
      }),
      'reference-mismatch',
    )
    expect(projectBusinessMatter(secondArtifact).conclusion).toBeUndefined()
  })

  it('turns a running blocker into clarification without rewriting the attempt', () => {
    const running = startReadyAttempt()
    const clarifying = requestClarification(running, {
      eventId: 'event:runtime-clarification',
      occurredAt: '2026-09-27T00:03:00Z',
      revisionId: 'revision:1',
      actionScope: undefined,
      reason: 'A channel rule became ambiguous during drafting.',
    })

    const state = projectBusinessMatter(clarifying)
    expect(state.stage).toBe('clarification')
    expect(state.activeAttemptId).toBeUndefined()
    expect(state.attempts[0]?.status).toBe('blocked')
    expect(state.attempts[0]?.terminationReason).toContain('ambiguous')

    expectDomainError(
      () =>
        startReadyAttempt(clarifying, {
          eventId: 'event:attempt-after-unresolved-clarification',
          occurredAt: '2026-09-27T00:04:00Z',
          attemptId: 'attempt:2',
        }),
      'invalid-transition',
    )
  })

  it('cannot create an artifact or receipt after a tool failure', () => {
    const failed = failAttempt(startReadyAttempt(), {
      eventId: 'event:tool-failed',
      occurredAt: '2026-09-27T00:03:00Z',
      attemptId: 'attempt:1',
      source: 'tool',
      reason: 'The drafting tool stopped before producing a valid package.',
      impact: 'Partial output is retained only as an observation.',
    })

    expectDomainError(
      () =>
        recordArtifact(failed, {
          eventId: 'event:false-artifact',
          occurredAt: '2026-09-27T00:04:00Z',
          artifactId: 'artifact:false-completion',
          attemptId: 'attempt:1',
          kind: 'content-package',
          locator: 'memory:artifact/partial',
          digest: 'sha256:partial',
        }),
      'invalid-transition',
    )
    expect(projectBusinessMatter(failed).receipts).toEqual([])
  })

  it('marks a dispatch-unknown note on the active attempt without closing it (ADR-0296 D4)', () => {
    const running = startReadyAttempt()
    const marked = markDispatchUnknown(running, {
      eventId: 'event:dispatch-unknown',
      occurredAt: '2026-09-27T00:02:30Z',
      attemptId: 'attempt:1',
    })
    const projection = projectBusinessMatter(marked)
    expect(projection.attempts[0]?.dispatchUnknown).toBe(true)
    // A note only: the attempt stays running and active; nothing else moves.
    expect(projection.attempts[0]?.status).toBe('running')
    expect(projection.activeAttemptId).toBe('attempt:1')
    expect(projection.stage).toBe('running')

    // Only the active running attempt may be marked: once it has failed, the mark is refused.
    const failed = failAttempt(running, {
      eventId: 'event:failed',
      occurredAt: '2026-09-27T00:03:00Z',
      attemptId: 'attempt:1',
      source: 'runtime',
      reason: 'Turn ended in error.',
      impact: 'The attempt is closed.',
    })
    expectDomainError(
      () =>
        markDispatchUnknown(failed, {
          eventId: 'event:late-mark',
          occurredAt: '2026-09-27T00:04:00Z',
          attemptId: 'attempt:1',
        }),
      'invalid-transition',
    )
  })

  it('records an explicit stopped conclusion only from failure/retry', () => {
    const failed = failAttempt(startReadyAttempt(), {
      eventId: 'event:failed',
      occurredAt: '2026-09-27T00:03:00Z',
      attemptId: 'attempt:1',
      source: 'runtime',
      reason: 'The operator chose not to retry.',
      impact: 'No completion artifact or receipt exists.',
    })
    const stopped = stopMatter(failed, {
      eventId: 'event:stopped',
      occurredAt: '2026-09-27T00:04:00Z',
      revisionId: 'revision:1',
      reason: 'The responsible person stopped this revision.',
    })

    expect(projectBusinessMatter(stopped).conclusion).toBe('stopped')
  })
})
