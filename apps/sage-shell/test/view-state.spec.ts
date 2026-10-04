import { describe, expect, it } from 'vitest'
import type { BusinessMatterProjection } from '../src/domain/business-matter.js'
import {
  createSageFixtureViewState,
  parseSageFixtureStage,
  projectSageMatterViewState,
  SAGE_FIXTURE_STAGES,
  type SageFixtureStage,
} from '../src/product/view-state.js'

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== 'object' || value === null) return
  expect(Object.isFrozen(value)).toBe(true)
  for (const item of Object.values(value)) expectDeepFrozen(item)
}

function projection(): BusinessMatterProjection {
  return {
    matterId: 'matter:test',
    creationEventId: 'event:test.created',
    goal: '验证 ViewState 的安全投影',
    responsibleParty: { kind: 'human', roleRef: 'role:operator' },
    stage: 'artifact-receipt',
    conclusion: undefined,
    currentRevisionId: 'revision:test.2',
    activeAttemptId: undefined,
    pendingClarification: undefined,
    revisions: [{
      revisionId: 'revision:test.2',
      predecessorRevisionId: 'revision:test.1',
      createdByEventId: 'event:test.revision',
      matterCreatedByEventId: 'event:test.created',
      changeReason: 'test',
      scope: 'test.read',
      permissionBoundary: 'test-only',
      dataDestination: 'test-only',
      evidence: [{
        evidenceId: 'evidence:test',
        source: 'fixture',
        observedAt: '2026-09-30T00:00:00.000Z',
        status: 'supported',
      }],
      unknowns: [{ unknownId: 'unknown:test', description: 'not yet known' }],
      options: ['inspect'],
      dependencies: [{ dependencyId: 'dependency:test', status: 'ready' }],
      experienceRefs: [],
      actionPolicies: [{ actionScope: 'test.read', effectClass: 'local-read', requiresDecision: false }],
    }],
    decisions: [{
      decisionId: 'decision:test',
      revisionId: 'revision:test.2',
      actionScope: 'test.read',
      status: 'approved',
      actor: { kind: 'human', roleRef: 'role:approver' },
      reason: 'approved for test',
      expiresAt: undefined,
      recordedAt: '2026-09-30T00:00:00.000Z',
      revokedAt: undefined,
      revocationReason: undefined,
    }],
    attempts: [{
      attemptId: 'attempt:test',
      revisionId: 'revision:test.2',
      actionScopes: ['test.read'],
      actionPolicies: [{ actionScope: 'test.read', effectClass: 'local-read', requiresDecision: false }],
      decisionIds: ['decision:test'],
      executionSnapshot: {
        provider: { identity: 'provider:secret', version: '1.0.0', digest: 'digest:secret' },
        model: { identity: 'model:secret', version: '1.0.0', digest: 'digest:secret' },
        agent: { identity: 'agent:secret', version: '1.0.0', digest: 'digest:secret' },
        preset: { identity: 'preset:secret', version: '1.0.0', digest: 'digest:secret' },
        capabilities: [],
      },
      compatibility: { outcome: 'equivalent', matrixId: 'matrix:secret', reason: 'secret reason' },
      status: 'succeeded',
      startedAt: '2026-09-30T00:00:00.000Z',
      endedAt: '2026-09-30T00:01:00.000Z',
      terminationReason: undefined,
    }],
    artifacts: [{
      artifactId: 'artifact:test',
      revisionId: 'revision:test.2',
      attemptId: 'attempt:test',
      kind: 'report',
      locator: '/secret/path/report.html',
      digest: 'digest:artifact-secret',
      recordedAt: '2026-09-30T00:01:00.000Z',
    }],
    receipts: [{
      receiptId: 'receipt:test',
      revisionId: 'revision:test.2',
      artifactId: 'artifact:test',
      verdict: 'accepted',
      actor: { kind: 'human', roleRef: 'role:approver' },
      reason: 'accepted',
      evidenceRefs: ['evidence:test'],
      recordedAt: '2026-09-30T00:02:00.000Z',
    }],
  }
}

describe('Sage ViewState adapter seam', () => {
  it('keeps the fixture visibly blocked and provenance-qualified', () => {
    const view = createSageFixtureViewState()

    expect(view.schemaVersion).toBe('sage.matter-view.v1')
    expect(view.projectionSource).toBe('fixture')
    expect(view.compatibilityOutcome).toBe('unknown')
    expect(view.authorizationState).toBe('unknown')
    expect(view.availabilityState).toBe('unknown')
    expect(view.actionability).toBe('blocked')
    expect(view.denialReason).toBe('fixture-only')
    expect(view.actions.every((action) => action.actionability === 'blocked')).toBe(true)
  })

  it('maps domain summaries while excluding authority, resolver, and filesystem details', () => {
    const view = projectSageMatterViewState(projection(), {
      projectionSource: 'live',
      compatibilityOutcome: 'requires-new-revision',
      authorizationState: 'requires-confirmation',
      availabilityState: 'unavailable',
      actionability: 'requires-confirmation',
      denialReason: 'decision-required',
      actions: [{
        type: 'start-attempt',
        revisionId: 'revision:test.2',
        actionScope: 'test.read',
        actionability: 'blocked',
        denialReason: 'decision-required',
      }],
    })

    expect(view.matter).toMatchObject({
      matterId: 'matter:test',
      stage: 'artifact-receipt',
      revisionCount: 1,
      evidenceCount: 1,
      unknownCount: 1,
      dependencyCount: 1,
    })
    expect(view.compatibilityOutcome).toBe('requires-new-revision')
    expect(view.authorizationState).toBe('requires-confirmation')
    expect(view.availabilityState).toBe('unavailable')
    expect(view.actionability).toBe('requires-confirmation')
    expect(view.attempts[0]).toMatchObject({ attemptId: 'attempt:test', status: 'succeeded' })
    expect(view.artifacts[0]).toMatchObject({ artifactId: 'artifact:test', kind: 'report' })
    expect(view.receipts[0]).toMatchObject({ receiptId: 'receipt:test', actorRoleRef: 'role:approver' })

    const serialized = JSON.stringify(view)
    expect(serialized).not.toContain('executionSnapshot')
    expect(serialized).not.toContain('digest:secret')
    expect(serialized).not.toContain('/secret/path')
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.matter)).toBe(true)
  })

  it('fails closed for blocked context without a reason or an unknown action', () => {
    expect(() => projectSageMatterViewState(projection(), {
      projectionSource: 'live',
      compatibilityOutcome: 'unknown',
      authorizationState: 'unknown',
      availabilityState: 'unknown',
      actionability: 'blocked',
      denialReason: undefined,
      actions: [],
    })).toThrow(/denial reason/u)

    expect(() => projectSageMatterViewState(projection(), {
      projectionSource: 'live',
      compatibilityOutcome: 'unknown',
      authorizationState: 'unknown',
      availabilityState: 'unknown',
      actionability: 'allowed',
      denialReason: undefined,
      actions: [{
        type: 'not-a-real-action' as never,
        revisionId: undefined,
        actionScope: undefined,
        actionability: 'allowed',
        denialReason: undefined,
      }],
    })).toThrow(/action type/u)
  })
})

describe('UI-FIXTURE-01 deterministic matter stages', () => {
  const expected = [
    {
      stage: 'created', revisionCount: 0, evidenceCount: 0, unknownCount: 0,
      dependencyCount: 0, clarification: false, decisions: 0, attempts: [], artifacts: [],
    },
    {
      stage: 'evidence', revisionCount: 1, evidenceCount: 1, unknownCount: 1,
      dependencyCount: 1, clarification: false, decisions: 0, attempts: [], artifacts: [],
    },
    {
      stage: 'clarification', revisionCount: 1, evidenceCount: 1, unknownCount: 1,
      dependencyCount: 1, clarification: true, decisions: 0, attempts: [], artifacts: [],
    },
    {
      stage: 'running', revisionCount: 1, evidenceCount: 1, unknownCount: 0,
      dependencyCount: 1, clarification: false, decisions: 1,
      attempts: [['attempt:sage.shopify-abi.fixture.running', 'running']], artifacts: [],
    },
    {
      stage: 'artifact-receipt', revisionCount: 1, evidenceCount: 1, unknownCount: 0,
      dependencyCount: 1, clarification: false, decisions: 1,
      attempts: [['attempt:sage.shopify-abi.fixture.artifact', 'succeeded']],
      artifacts: ['artifact:sage.shopify-abi.fixture.report'],
    },
    {
      stage: 'failed-retry', revisionCount: 1, evidenceCount: 1, unknownCount: 0,
      dependencyCount: 1, clarification: false, decisions: 1,
      attempts: [
        ['attempt:sage.shopify-abi.fixture.failed', 'failed'],
        ['attempt:sage.shopify-abi.fixture.retry', 'failed'],
      ],
      artifacts: [],
    },
  ] as const satisfies readonly {
    readonly stage: SageFixtureStage
    readonly revisionCount: number
    readonly evidenceCount: number
    readonly unknownCount: number
    readonly dependencyCount: number
    readonly clarification: boolean
    readonly decisions: number
    readonly attempts: readonly (readonly [string, string])[]
    readonly artifacts: readonly string[]
  }[]

  it('publishes the exact six-stage vocabulary and rejects aliases or whitespace', () => {
    expect(SAGE_FIXTURE_STAGES).toEqual([
      'created',
      'evidence',
      'clarification',
      'running',
      'artifact-receipt',
      'failed-retry',
    ])
    for (const stage of SAGE_FIXTURE_STAGES) expect(parseSageFixtureStage(stage)).toBe(stage)
    for (const value of [undefined, null, '', ' running', 'running ', 'RUNNING', 'completed', 1]) {
      expect(parseSageFixtureStage(value)).toBeUndefined()
    }
  })

  it.each(expected)('creates the exact read-only $stage fixture facts', (item) => {
    const view = createSageFixtureViewState(item.stage)

    expect(view).toMatchObject({
      schemaVersion: 'sage.matter-view.v1',
      projectionSource: 'fixture',
      compatibilityOutcome: 'unknown',
      authorizationState: 'unknown',
      availabilityState: 'unknown',
      actionability: 'blocked',
      denialReason: 'fixture-only',
    })
    expect(view.matter).toMatchObject({
      matterId: 'matter:sage.shopify-abi.fixture',
      stage: item.stage,
      conclusion: undefined,
      revisionCount: item.revisionCount,
      evidenceCount: item.evidenceCount,
      unknownCount: item.unknownCount,
      dependencyCount: item.dependencyCount,
    })
    expect(view.matter.currentRevisionId).toBe(
      item.revisionCount === 0 ? undefined : 'revision:sage.shopify-abi.fixture.1',
    )
    expect(view.matter.pendingClarification !== undefined).toBe(item.clarification)
    expect(view.decisions).toHaveLength(item.decisions)
    expect(view.attempts.map(({ attemptId, status }) => [attemptId, status])).toEqual(item.attempts)
    expect(view.artifacts.map(({ artifactId }) => artifactId)).toEqual(item.artifacts)
    expect(view.receipts).toEqual([])
    expect(view.actions.length).toBeGreaterThan(0)
    expect(view.actions.every((action) => (
      action.actionability === 'blocked' && action.denialReason === 'fixture-only'
    ))).toBe(true)
    expectDeepFrozen(view)

    const serialized = JSON.stringify(view)
    for (const forbidden of [
      'executionSnapshot', 'matrixId', 'digest', 'locator', '/Users/', '/secret/', 'file://',
    ]) expect(serialized).not.toContain(forbidden)
  })

  it('keeps clarification as the backwards-compatible default fixture', () => {
    expect(createSageFixtureViewState()).toEqual(createSageFixtureViewState('clarification'))
  })

  it('keeps artifact and retry history separate from a business conclusion', () => {
    const artifact = createSageFixtureViewState('artifact-receipt')
    expect(artifact.attempts).toHaveLength(1)
    expect(artifact.attempts[0]).toMatchObject({ status: 'succeeded' })
    expect(artifact.artifacts).toHaveLength(1)
    expect(artifact.receipts).toEqual([])
    expect(artifact.matter.conclusion).toBeUndefined()

    const retry = createSageFixtureViewState('failed-retry')
    expect(new Set(retry.attempts.map(({ attemptId }) => attemptId)).size).toBe(2)
    expect(retry.attempts.every(({ status }) => status === 'failed')).toBe(true)
    expect(retry.matter.conclusion).toBeUndefined()
  })
})
