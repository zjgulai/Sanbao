import type {
  BusinessMatterProjection,
  BusinessMatterStage,
  CompatibilityOutcome,
} from '../domain/business-matter.js'

/** Public schema consumed by the Sage-owned UI; it is not a domain event or an authority record. */
export const SAGE_MATTER_VIEW_STATE_SCHEMA = 'sage.matter-view.v1' as const

export type SageProjectionSource = 'fixture' | 'live'
export type SageAuthorizationState = 'authorized' | 'denied' | 'requires-confirmation' | 'unknown'
export type SageAvailabilityState = 'available' | 'unavailable' | 'recovering' | 'unknown'
export type SageActionability = 'allowed' | 'blocked' | 'requires-confirmation'

export type SageDenialReasonCode =
  | 'fixture-only'
  | 'runtime-unavailable'
  | 'compatibility-unknown'
  | 'authorization-required'
  | 'decision-required'
  | 'stale-revision'
  | 'external-capability-unavailable'

export const SAGE_ACTION_TYPES = [
  'create-matter',
  'enter-evidence',
  'answer-clarification',
  'approve',
  'reject',
  'revoke',
  'start-attempt',
  'stop-attempt',
  'retry-attempt',
  'open-artifact',
  'accept-receipt',
  'reject-receipt',
  'retry-capability',
] as const

export type SageActionType = (typeof SAGE_ACTION_TYPES)[number]

export const SAGE_FIXTURE_STAGES = Object.freeze([
  'created',
  'evidence',
  'clarification',
  'running',
  'artifact-receipt',
  'failed-retry',
] as const satisfies readonly BusinessMatterStage[])

export type SageFixtureStage = (typeof SAGE_FIXTURE_STAGES)[number]

export interface SageActionProjection {
  readonly type: SageActionType
  readonly revisionId: string | undefined
  readonly actionScope: string | undefined
  readonly actionability: SageActionability
  readonly denialReason: SageDenialReasonCode | undefined
}

export interface SageMatterViewState {
  readonly schemaVersion: typeof SAGE_MATTER_VIEW_STATE_SCHEMA
  readonly projectionSource: SageProjectionSource
  readonly matter: {
    readonly matterId: string
    readonly goal: string
    readonly responsiblePartyRoleRef: string
    readonly stage: BusinessMatterStage
    readonly conclusion: 'completed' | 'stopped' | undefined
    readonly currentRevisionId: string | undefined
    readonly revisionCount: number
    readonly evidenceCount: number
    readonly unknownCount: number
    readonly dependencyCount: number
    readonly pendingClarification: {
      readonly eventId: string
      readonly revisionId: string
      readonly actionScope: string | undefined
      readonly reason: string
      readonly requestedAt: string
    } | undefined
  }
  readonly compatibilityOutcome: CompatibilityOutcome
  readonly authorizationState: SageAuthorizationState
  readonly availabilityState: SageAvailabilityState
  readonly actionability: SageActionability
  readonly denialReason: SageDenialReasonCode | undefined
  readonly actions: readonly SageActionProjection[]
  readonly decisions: readonly {
    readonly decisionId: string
    readonly revisionId: string
    readonly actionScope: string
    readonly status: 'approved' | 'rejected' | 'revoked'
    readonly expiresAt: string | undefined
  }[]
  readonly attempts: readonly {
    readonly attemptId: string
    readonly revisionId: string
    readonly status: 'running' | 'blocked' | 'failed' | 'succeeded'
    readonly startedAt: string
    readonly endedAt: string | undefined
  }[]
  readonly artifacts: readonly {
    readonly artifactId: string
    readonly revisionId: string
    readonly attemptId: string
    readonly kind: string
    readonly recordedAt: string
  }[]
  readonly receipts: readonly {
    readonly receiptId: string
    readonly revisionId: string
    readonly artifactId: string
    readonly verdict: 'accepted' | 'rejected'
    readonly actorRoleRef: string
    readonly recordedAt: string
  }[]
}

export interface SageViewStateContext {
  readonly projectionSource: SageProjectionSource
  readonly compatibilityOutcome: CompatibilityOutcome
  readonly authorizationState: SageAuthorizationState
  readonly availabilityState: SageAvailabilityState
  readonly actionability: SageActionability
  readonly denialReason: SageDenialReasonCode | undefined
  readonly actions: readonly SageActionProjection[]
}

const ACTION_TYPES = new Set<string>(SAGE_ACTION_TYPES)
const STAGES = new Set<BusinessMatterStage>(SAGE_FIXTURE_STAGES)
const FIXTURE_STAGES = new Set<unknown>(SAGE_FIXTURE_STAGES)
const COMPATIBILITY_OUTCOMES = new Set<CompatibilityOutcome>([
  'equivalent',
  'requires-new-revision',
  'unknown',
])
const PROJECTION_SOURCES = new Set<SageProjectionSource>(['fixture', 'live'])
const AUTHORIZATION_STATES = new Set<SageAuthorizationState>([
  'authorized',
  'denied',
  'requires-confirmation',
  'unknown',
])
const AVAILABILITY_STATES = new Set<SageAvailabilityState>([
  'available',
  'unavailable',
  'recovering',
  'unknown',
])
const ACTIONABILITIES = new Set<SageActionability>([
  'allowed',
  'blocked',
  'requires-confirmation',
])
const DENIAL_REASONS = new Set<SageDenialReasonCode>([
  'fixture-only',
  'runtime-unavailable',
  'compatibility-unknown',
  'authorization-required',
  'decision-required',
  'stale-revision',
  'external-capability-unavailable',
])

function freezeDeep<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value)) {
    freezeDeep((value as Record<PropertyKey, unknown>)[key])
  }
  return Object.freeze(value)
}

function assertString(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Sage ViewState ${field} must be a non-empty string.`)
  }
}

function assertContext(context: SageViewStateContext): void {
  if (!PROJECTION_SOURCES.has(context.projectionSource)) throw new Error('Sage ViewState projection source is invalid.')
  if (!COMPATIBILITY_OUTCOMES.has(context.compatibilityOutcome)) throw new Error('Sage ViewState compatibility outcome is invalid.')
  if (!AUTHORIZATION_STATES.has(context.authorizationState)) throw new Error('Sage ViewState authorization state is invalid.')
  if (!AVAILABILITY_STATES.has(context.availabilityState)) throw new Error('Sage ViewState availability state is invalid.')
  if (!ACTIONABILITIES.has(context.actionability)) throw new Error('Sage ViewState actionability is invalid.')
  if (context.denialReason !== undefined && !DENIAL_REASONS.has(context.denialReason)) {
    throw new Error('Sage ViewState denial reason is invalid.')
  }
  if (context.actionability === 'blocked' && context.denialReason === undefined) {
    throw new Error('A blocked Sage ViewState requires a denial reason.')
  }
  if (!Array.isArray(context.actions)) throw new Error('Sage ViewState actions must be an array.')
  for (const action of context.actions) {
    if (!ACTION_TYPES.has(action.type)) throw new Error('Sage ViewState action type is invalid.')
    if (action.revisionId !== undefined) assertString(action.revisionId, 'action.revisionId')
    if (action.actionScope !== undefined) assertString(action.actionScope, 'action.actionScope')
    if (!ACTIONABILITIES.has(action.actionability)) throw new Error('Sage ViewState actionability is invalid.')
    if (action.actionability === 'blocked' && action.denialReason === undefined) {
      throw new Error('A blocked Sage action requires a denial reason.')
    }
    if (action.denialReason !== undefined && !DENIAL_REASONS.has(action.denialReason)) {
      throw new Error('Sage ViewState action denial reason is invalid.')
    }
  }
}

function projectActions(actions: readonly SageActionProjection[]): readonly SageActionProjection[] {
  return actions.map((action) => ({
    type: action.type,
    revisionId: action.revisionId,
    actionScope: action.actionScope,
    actionability: action.actionability,
    denialReason: action.denialReason,
  }))
}

/** Exact, non-coercing fixture token parser. URL and renderer state never enter this seam. */
export function parseSageFixtureStage(value: unknown): SageFixtureStage | undefined {
  return FIXTURE_STAGES.has(value) ? value as SageFixtureStage : undefined
}

/**
 * Convert a trusted domain projection into the renderer-facing shape without exposing events,
 * digests, locators, execution snapshots, resolver inputs, or authority records.
 */
export function projectSageMatterViewState(
  projection: BusinessMatterProjection,
  context: SageViewStateContext,
): SageMatterViewState {
  assertString(projection.matterId, 'matterId')
  assertString(projection.goal, 'goal')
  assertString(projection.responsibleParty.roleRef, 'responsibleParty.roleRef')
  if (!STAGES.has(projection.stage)) throw new Error('Sage ViewState matter stage is invalid.')
  assertContext(context)

  const currentRevision = projection.currentRevisionId === undefined
    ? undefined
    : projection.revisions.find((revision) => revision.revisionId === projection.currentRevisionId)

  const viewState: SageMatterViewState = {
    schemaVersion: SAGE_MATTER_VIEW_STATE_SCHEMA,
    projectionSource: context.projectionSource,
    matter: {
      matterId: projection.matterId,
      goal: projection.goal,
      responsiblePartyRoleRef: projection.responsibleParty.roleRef,
      stage: projection.stage,
      conclusion: projection.conclusion,
      currentRevisionId: projection.currentRevisionId,
      revisionCount: projection.revisions.length,
      evidenceCount: currentRevision?.evidence.length ?? 0,
      unknownCount: currentRevision?.unknowns.length ?? 0,
      dependencyCount: currentRevision?.dependencies.length ?? 0,
      pendingClarification: projection.pendingClarification === undefined
        ? undefined
        : {
          eventId: projection.pendingClarification.eventId,
          revisionId: projection.pendingClarification.revisionId,
          actionScope: projection.pendingClarification.actionScope,
          reason: projection.pendingClarification.reason,
          requestedAt: projection.pendingClarification.requestedAt,
        },
    },
    compatibilityOutcome: context.compatibilityOutcome,
    authorizationState: context.authorizationState,
    availabilityState: context.availabilityState,
    actionability: context.actionability,
    denialReason: context.denialReason,
    actions: projectActions(context.actions),
    decisions: projection.decisions.map((decision) => ({
      decisionId: decision.decisionId,
      revisionId: decision.revisionId,
      actionScope: decision.actionScope,
      status: decision.status,
      expiresAt: decision.expiresAt,
    })),
    attempts: projection.attempts.map((attempt) => ({
      attemptId: attempt.attemptId,
      revisionId: attempt.revisionId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
    })),
    artifacts: projection.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      revisionId: artifact.revisionId,
      attemptId: artifact.attemptId,
      kind: artifact.kind,
      recordedAt: artifact.recordedAt,
    })),
    receipts: projection.receipts.map((receipt) => ({
      receiptId: receipt.receiptId,
      revisionId: receipt.revisionId,
      artifactId: receipt.artifactId,
      verdict: receipt.verdict,
      actorRoleRef: receipt.actor.roleRef,
      recordedAt: receipt.recordedAt,
    })),
  }

  return freezeDeep(viewState)
}

const FIXTURE_MATTER_ID = 'matter:sage.shopify-abi.fixture'
const FIXTURE_CREATED_EVENT_ID = 'event:sage.shopify-abi.fixture.created'
const FIXTURE_REVISION_ID = 'revision:sage.shopify-abi.fixture.1'
const FIXTURE_ACTION_SCOPE = 'shopify.orders.read'
const FIXTURE_DECISION_ID = 'decision:sage.shopify-abi.fixture.approved'

function fixtureRevision(stage: SageFixtureStage): BusinessMatterProjection['revisions'][number] {
  const awaitingEvidence = stage === 'evidence' || stage === 'clarification'
  return {
    revisionId: FIXTURE_REVISION_ID,
    predecessorRevisionId: undefined,
    createdByEventId: 'event:sage.shopify-abi.fixture.revision',
    matterCreatedByEventId: FIXTURE_CREATED_EVENT_ID,
    changeReason: 'fixture projection',
    scope: FIXTURE_ACTION_SCOPE,
    permissionBoundary: 'fixture-only',
    dataDestination: 'fixture-only',
    evidence: [{
      evidenceId: 'evidence:sage.shopify-abi.fixture.market',
      source: 'fixture',
      observedAt: '2026-09-30T00:00:00.000Z',
      status: awaitingEvidence ? 'insufficient' : 'supported',
    }],
    unknowns: awaitingEvidence
      ? [{
          unknownId: 'unknown:sage.shopify-abi.fixture.cash',
          description: '现金约束数据尚未接入。',
        }]
      : [],
    options: awaitingEvidence ? ['补充证据'] : ['保持只读核对'],
    dependencies: [{
      dependencyId: 'dependency:shopify-abi',
      status: awaitingEvidence ? 'unknown' : 'ready',
    }],
    experienceRefs: [],
    actionPolicies: [{
      actionScope: FIXTURE_ACTION_SCOPE,
      effectClass: 'external-read',
      requiresDecision: true,
    }],
  }
}

function fixtureDecision(): BusinessMatterProjection['decisions'][number] {
  return {
    decisionId: FIXTURE_DECISION_ID,
    revisionId: FIXTURE_REVISION_ID,
    actionScope: FIXTURE_ACTION_SCOPE,
    status: 'approved',
    actor: { kind: 'human', roleRef: 'fixture:approver' },
    reason: 'Fixture-only approval fact.',
    expiresAt: undefined,
    recordedAt: '2026-09-30T00:02:00.000Z',
    revokedAt: undefined,
    revocationReason: undefined,
  }
}

function fixtureAttempt(
  attemptId: string,
  status: 'running' | 'failed' | 'succeeded',
  startedAt: string,
  endedAt: string | undefined,
): BusinessMatterProjection['attempts'][number] {
  return {
    attemptId,
    revisionId: FIXTURE_REVISION_ID,
    actionScopes: [FIXTURE_ACTION_SCOPE],
    actionPolicies: [{
      actionScope: FIXTURE_ACTION_SCOPE,
      effectClass: 'external-read',
      requiresDecision: true,
    }],
    decisionIds: [FIXTURE_DECISION_ID],
    executionSnapshot: {
      provider: { identity: 'fixture:provider', version: '1', digest: 'fixture:provider-digest' },
      model: { identity: 'fixture:model', version: '1', digest: 'fixture:model-digest' },
      agent: { identity: 'fixture:agent', version: '1', digest: 'fixture:agent-digest' },
      preset: { identity: 'fixture:preset', version: '1', digest: 'fixture:preset-digest' },
      capabilities: [],
    },
    compatibility: {
      outcome: 'equivalent',
      matrixId: 'fixture:matrix',
      reason: 'Fixture-only compatibility fact.',
    },
    status,
    startedAt,
    endedAt,
    terminationReason: status === 'failed' ? 'Fixture failure retained for review.' : undefined,
  }
}

function fixtureProjection(stage: SageFixtureStage): BusinessMatterProjection {
  const hasRevision = stage !== 'created'
  const hasDecision = stage === 'running' || stage === 'artifact-receipt' || stage === 'failed-retry'
  const attempts = stage === 'running'
    ? [fixtureAttempt(
        'attempt:sage.shopify-abi.fixture.running',
        'running',
        '2026-09-30T00:03:00.000Z',
        undefined,
      )]
    : stage === 'artifact-receipt'
      ? [fixtureAttempt(
          'attempt:sage.shopify-abi.fixture.artifact',
          'succeeded',
          '2026-09-30T00:03:00.000Z',
          '2026-09-30T00:04:00.000Z',
        )]
      : stage === 'failed-retry'
        ? [
            fixtureAttempt(
              'attempt:sage.shopify-abi.fixture.failed',
              'failed',
              '2026-09-30T00:03:00.000Z',
              '2026-09-30T00:04:00.000Z',
            ),
            fixtureAttempt(
              'attempt:sage.shopify-abi.fixture.retry',
              'failed',
              '2026-09-30T00:05:00.000Z',
              '2026-09-30T00:06:00.000Z',
            ),
          ]
        : []

  return {
    matterId: FIXTURE_MATTER_ID,
    creationEventId: FIXTURE_CREATED_EVENT_ID,
    goal: '在现金约束下稳定订单增长',
    responsibleParty: { kind: 'human', roleRef: 'fixture:operator' },
    stage,
    conclusion: undefined,
    currentRevisionId: hasRevision ? FIXTURE_REVISION_ID : undefined,
    activeAttemptId: stage === 'running' ? 'attempt:sage.shopify-abi.fixture.running' : undefined,
    pendingClarification: stage === 'clarification'
      ? {
          eventId: 'event:sage.shopify-abi.fixture.clarification',
          revisionId: FIXTURE_REVISION_ID,
          attemptId: undefined,
          actionScope: FIXTURE_ACTION_SCOPE,
          reason: '需要补充市场信号与现金约束证据。',
          requestedAt: '2026-09-30T00:01:00.000Z',
        }
      : undefined,
    revisions: hasRevision ? [fixtureRevision(stage)] : [],
    decisions: hasDecision ? [fixtureDecision()] : [],
    attempts,
    artifacts: stage === 'artifact-receipt'
      ? [{
          artifactId: 'artifact:sage.shopify-abi.fixture.report',
          revisionId: FIXTURE_REVISION_ID,
          attemptId: 'attempt:sage.shopify-abi.fixture.artifact',
          kind: 'report',
          locator: 'fixture:artifact-report',
          digest: 'fixture:artifact-digest',
          recordedAt: '2026-09-30T00:05:00.000Z',
        }]
      : [],
    receipts: [],
  }
}

function blockedFixtureAction(
  type: SageActionType,
  boundToRevision: boolean,
): SageActionProjection {
  return {
    type,
    revisionId: boundToRevision ? FIXTURE_REVISION_ID : undefined,
    actionScope: boundToRevision ? FIXTURE_ACTION_SCOPE : undefined,
    actionability: 'blocked',
    denialReason: 'fixture-only',
  }
}

function fixtureActions(stage: SageFixtureStage): readonly SageActionProjection[] {
  const stageActions: readonly SageActionProjection[] = stage === 'created'
    ? [blockedFixtureAction('enter-evidence', false)]
    : stage === 'evidence'
      ? [
          blockedFixtureAction('enter-evidence', true),
          blockedFixtureAction('start-attempt', true),
        ]
      : stage === 'clarification'
        ? [
            blockedFixtureAction('answer-clarification', true),
            blockedFixtureAction('start-attempt', true),
          ]
        : stage === 'running'
          ? [blockedFixtureAction('stop-attempt', true)]
          : stage === 'artifact-receipt'
            ? [
                blockedFixtureAction('open-artifact', true),
                blockedFixtureAction('accept-receipt', true),
                blockedFixtureAction('reject-receipt', true),
              ]
            : [blockedFixtureAction('retry-attempt', true)]
  return [...stageActions, blockedFixtureAction('retry-capability', false)]
}

/** Explicitly local UI fixture; it can never advertise a writable action. */
export function createSageFixtureViewState(
  stage: SageFixtureStage = 'clarification',
): SageMatterViewState {
  return projectSageMatterViewState(fixtureProjection(stage), {
    projectionSource: 'fixture',
    compatibilityOutcome: 'unknown',
    authorizationState: 'unknown',
    availabilityState: 'unknown',
    actionability: 'blocked',
    denialReason: 'fixture-only',
    actions: fixtureActions(stage),
  })
}
