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
const STAGES = new Set<BusinessMatterStage>([
  'created',
  'evidence',
  'running',
  'clarification',
  'artifact-receipt',
  'failed-retry',
])
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

function fixtureProjection(): BusinessMatterProjection {
  return {
    matterId: 'matter:sage.shopify-abi.fixture',
    creationEventId: 'event:sage.shopify-abi.fixture.created',
    goal: '在现金约束下稳定订单增长',
    responsibleParty: { kind: 'human', roleRef: 'fixture:operator' },
    stage: 'clarification',
    conclusion: undefined,
    currentRevisionId: 'revision:sage.shopify-abi.fixture.1',
    activeAttemptId: undefined,
    pendingClarification: {
      eventId: 'event:sage.shopify-abi.fixture.clarification',
      revisionId: 'revision:sage.shopify-abi.fixture.1',
      attemptId: undefined,
      actionScope: 'shopify.orders.read',
      reason: '需要补充市场信号与现金约束证据。',
      requestedAt: '2026-09-30T00:00:00.000Z',
    },
    revisions: [{
      revisionId: 'revision:sage.shopify-abi.fixture.1',
      predecessorRevisionId: undefined,
      createdByEventId: 'event:sage.shopify-abi.fixture.revision',
      matterCreatedByEventId: 'event:sage.shopify-abi.fixture.created',
      changeReason: 'fixture projection',
      scope: 'shopify.orders.read',
      permissionBoundary: 'fixture-only',
      dataDestination: 'fixture-only',
      evidence: [{
        evidenceId: 'evidence:sage.shopify-abi.fixture.market',
        source: 'fixture',
        observedAt: '2026-09-30T00:00:00.000Z',
        status: 'insufficient',
      }],
      unknowns: [{
        unknownId: 'unknown:sage.shopify-abi.fixture.cash',
        description: '现金约束数据尚未接入。',
      }],
      options: ['补充证据'],
      dependencies: [{ dependencyId: 'dependency:shopify-abi', status: 'unknown' }],
      experienceRefs: [],
      actionPolicies: [{
        actionScope: 'shopify.orders.read',
        effectClass: 'external-read',
        requiresDecision: true,
      }],
    }],
    decisions: [],
    attempts: [],
    artifacts: [],
    receipts: [],
  }
}

/** Explicitly local UI fixture; it can never advertise a writable action. */
export function createSageFixtureViewState(): SageMatterViewState {
  return projectSageMatterViewState(fixtureProjection(), {
    projectionSource: 'fixture',
    compatibilityOutcome: 'unknown',
    authorizationState: 'unknown',
    availabilityState: 'unknown',
    actionability: 'blocked',
    denialReason: 'fixture-only',
    actions: [
      {
        type: 'answer-clarification',
        revisionId: 'revision:sage.shopify-abi.fixture.1',
        actionScope: 'shopify.orders.read',
        actionability: 'blocked',
        denialReason: 'fixture-only',
      },
      {
        type: 'start-attempt',
        revisionId: 'revision:sage.shopify-abi.fixture.1',
        actionScope: 'shopify.orders.read',
        actionability: 'blocked',
        denialReason: 'compatibility-unknown',
      },
      {
        type: 'retry-capability',
        revisionId: undefined,
        actionScope: undefined,
        actionability: 'blocked',
        denialReason: 'fixture-only',
      },
    ],
  })
}
