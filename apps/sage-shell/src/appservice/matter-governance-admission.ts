/** L1-A (ADR-0320): the matter-governance admission family — the second protected-effect family.
 *
 *  The session-core chain runs ten steps because a session prompt is an external, capability-
 *  governed effect (target / compatibility / registry / preflight / persistence all mean
 *  something). A matter-governance write is a LOCAL write over Sage-owned stores: the four
 *  capability steps have no honest implementation, and fabricating always-allow ports would be
 *  an authority lie. This module is therefore the family's own five-step profile:
 *
 *    verifyCaller -> resolveActiveContext -> matchCandidate -> resolveIdentityPolicy -> dispatch
 *
 *  It shares the kernel's step checker, guards and fact validators (one home, one behavior) and
 *  keeps the kernel's outcome vocabulary: a determinate receipt -> receipt + family detail; a
 *  determinate refusal -> refused with its own code; a pre-call refusal -> not-dispatched (the
 *  route maps it to the retryable protected-effect-unavailable); everything uncertain ->
 *  outcome-unknown. The durable record of a matter write is the domain event the dispatch
 *  itself authors (the matter's own store); this family writes no separate intent ledger yet
 *  (named as the follow-up in the batch record).
 */
import type { MatterAdminStatus, MatterGroupsStatus } from './contracts.js'
import {
  checkStep,
  isActiveContext,
  isCallerFact,
  isIdentityPolicyFact,
  isMatchedCandidateFact,
  isRecord,
  isRef,
  type CallerAdmissionFact,
  type FreshIdentityPolicyFact,
  type MatchedCandidateFact,
  type ProtectedEffectAdmissionFailure,
  type ProtectedEffectAdmissionStep,
  type ProtectedEffectStepResult,
  type RequestScopedActiveContext,
} from './protected-effect-admission.js'

export type MatterGovernanceOperation =
  | 'matter.admin.archive'
  | 'matter.admin.restore'
  | 'matter.admin.batch'
  | 'matter.admin.rename'
  | 'matter.groups.create'
  | 'matter.groups.rename'
  | 'matter.groups.remove'
  | 'matter.groups.membership'

export interface MatterGovernanceIntent {
  readonly family: 'matter-governance'
  readonly requestId: string
  readonly operation: MatterGovernanceOperation
  readonly candidate: { readonly kind: 'matter', readonly matterRef: string } | { readonly kind: 'active-session' }
  readonly payload: Readonly<Record<string, unknown>>
}

/** The family's route-facing receipt detail. The status is the provider's own read-back view —
 *  the route pairs the identity fields and passes the status through untouched. */
export type MatterGovernanceDispatchDetail =
  | { readonly kind: 'matter-archived', readonly matterRef: string, readonly ground: 'completed' | 'stopped', readonly status: MatterAdminStatus }
  | { readonly kind: 'matter-restored', readonly matterRef: string, readonly status: MatterAdminStatus }
  | { readonly kind: 'matter-batch', readonly operation: 'archive' | 'restore', readonly status: MatterAdminStatus }
  | { readonly kind: 'matter-renamed', readonly matterRef: string, readonly title: string, readonly status: MatterAdminStatus }
  | { readonly kind: 'matter-group-created', readonly name: string, readonly status: MatterGroupsStatus }
  | { readonly kind: 'matter-group-renamed', readonly groupId: string, readonly name: string, readonly status: MatterGroupsStatus }
  | { readonly kind: 'matter-group-removed', readonly groupId: string, readonly status: MatterGroupsStatus }
  | { readonly kind: 'matter-group-membership', readonly groupId: string, readonly operation: 'add' | 'remove', readonly status: MatterGroupsStatus }

export type MatterGovernanceDispatchResult =
  | { readonly state: 'receipt', readonly receiptRef: string, readonly detail: MatterGovernanceDispatchDetail }
  | {
      /** A determinate refusal from the store itself — the effect did not run. */
      readonly state: 'refused'
      readonly code: string
    }
  | {
      /** A pre-call guard refused: the effect provably did not run and the caller may retry. */
      readonly state: 'not-dispatched'
    }
  | { readonly state: 'outcome-unknown' }

export interface MatterGovernanceAdmissionPorts {
  readonly verifyCaller?: (
    request: { readonly intent: MatterGovernanceIntent, readonly correlation: string },
  ) => Promise<ProtectedEffectStepResult<CallerAdmissionFact>>
  readonly resolveActiveContext?: (
    request: { readonly intent: MatterGovernanceIntent, readonly correlation: string, readonly caller: CallerAdmissionFact },
  ) => Promise<ProtectedEffectStepResult<RequestScopedActiveContext>>
  readonly matchCandidate?: (
    request: {
      readonly intent: MatterGovernanceIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
    },
  ) => Promise<ProtectedEffectStepResult<MatchedCandidateFact>>
  readonly resolveIdentityPolicy?: (
    request: {
      readonly intent: MatterGovernanceIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
      readonly candidate: MatchedCandidateFact
    },
  ) => Promise<ProtectedEffectStepResult<FreshIdentityPolicyFact>>
  readonly dispatch?: (
    request: {
      readonly intent: MatterGovernanceIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
      readonly candidate: MatchedCandidateFact
      readonly identityPolicy: FreshIdentityPolicyFact
    },
  ) => Promise<MatterGovernanceDispatchResult>
}

export type MatterGovernanceAdmissionResult =
  | {
      readonly state: 'dispatched'
      readonly correlation: string
      readonly receiptRef: string
      readonly detail: MatterGovernanceDispatchDetail
    }
  | { readonly state: 'refused', readonly correlation: string, readonly code: string }
  | ProtectedEffectAdmissionFailure

type PreDispatchFailureState = 'unavailable' | 'denied' | 'stale'

function failure(
  state: PreDispatchFailureState,
  stage: ProtectedEffectAdmissionStep,
  correlation: string,
): ProtectedEffectAdmissionFailure {
  if (state === 'unavailable') {
    return { state, code: 'protected-effect-unavailable', stage, retryable: true, correlation }
  }
  if (state === 'stale') {
    return { state, code: 'protected-effect-stale', stage, retryable: false, correlation }
  }
  return { state, code: 'protected-effect-denied', stage, retryable: false, correlation }
}

/** The detail the seam passes on: every family kind needs its own required fields, and a
 *  receipt-shaped fall-through is the conservative unknown — never a partial receipt. */
export function isMatterGovernanceDispatchDetail(value: unknown): value is MatterGovernanceDispatchDetail {
  if (!isRecord(value)) return false
  if (!isRecord(value.status)) return false
  if (value.status.state !== 'read' && value.status.state !== 'unavailable') return false
  if (value.kind === 'matter-archived') {
    return isRef(value.matterRef) && (value.ground === 'completed' || value.ground === 'stopped')
  }
  if (value.kind === 'matter-restored') return isRef(value.matterRef)
  if (value.kind === 'matter-batch') return value.operation === 'archive' || value.operation === 'restore'
  if (value.kind === 'matter-renamed') return isRef(value.matterRef) && typeof value.title === 'string' && value.title.length > 0
  if (value.kind === 'matter-group-created') return typeof value.name === 'string' && value.name.length > 0
  if (value.kind === 'matter-group-renamed') return isRef(value.groupId) && typeof value.name === 'string' && value.name.length > 0
  if (value.kind === 'matter-group-removed') return isRef(value.groupId)
  if (value.kind === 'matter-group-membership') return isRef(value.groupId) && (value.operation === 'add' || value.operation === 'remove')
  return false
}

/** Evaluate exactly one matter-governance attempt. Never retries; a dispatch throw is the
 *  conservative unknown. Absent ports always fail closed. */
export async function admitMatterGovernanceEffect(input: {
  readonly intent: MatterGovernanceIntent
  readonly correlation: string
  readonly ports: MatterGovernanceAdmissionPorts
}): Promise<MatterGovernanceAdmissionResult> {
  const { intent, correlation, ports } = input

  const callerStep = await checkStep(ports.verifyCaller, { intent, correlation }, isCallerFact)
  if (!callerStep.ok) return failure(callerStep.state, 'caller', correlation)
  const caller: CallerAdmissionFact = { bindingRef: callerStep.value.bindingRef }

  const contextStep = await checkStep(
    ports.resolveActiveContext,
    { intent, correlation, caller },
    isActiveContext,
  )
  if (!contextStep.ok) return failure(contextStep.state, 'context', correlation)
  const context: RequestScopedActiveContext = contextStep.value
  if (context.callerBindingRef !== caller.bindingRef) return failure('denied', 'context', correlation)

  // The same pairing the session kernel enforces: a matter-kind candidate names the ACTIVE
  // matter or the admission is stale — the renderer's matterRef is a candidate, never authority.
  const intentCandidate: unknown = intent.candidate
  if (!isRecord(intentCandidate)) {
    return failure('stale', 'candidate-match', correlation)
  }
  if (intentCandidate.kind === 'matter') {
    if (!isRef(intentCandidate.matterRef) || intentCandidate.matterRef !== context.matterRef) {
      return failure('stale', 'candidate-match', correlation)
    }
  } else if (intentCandidate.kind !== 'active-session') {
    return failure('stale', 'candidate-match', correlation)
  }

  const candidateStep = await checkStep(
    ports.matchCandidate,
    { intent, correlation, caller, context },
    isMatchedCandidateFact,
  )
  if (!candidateStep.ok) return failure(candidateStep.state, 'candidate-match', correlation)
  const candidate: MatchedCandidateFact = { candidateRef: candidateStep.value.candidateRef }

  const identityStep = await checkStep(
    ports.resolveIdentityPolicy,
    { intent, correlation, caller, context, candidate },
    isIdentityPolicyFact,
  )
  if (!identityStep.ok) return failure(identityStep.state, 'identity-policy', correlation)
  const identityPolicy: FreshIdentityPolicyFact = {
    decisionRef: identityStep.value.decisionRef,
    actorScopeRef: identityStep.value.actorScopeRef,
  }

  if (ports.dispatch === undefined) return failure('unavailable', 'dispatch', correlation)
  let dispatchResult: unknown
  try {
    dispatchResult = await ports.dispatch({
      intent,
      correlation,
      caller,
      context,
      candidate,
      identityPolicy,
    })
  } catch {
    return {
      state: 'outcome-unknown',
      code: 'protected-effect-outcome-unknown',
      stage: 'dispatch',
      retryable: false,
      correlation,
    }
  }

  if (isRecord(dispatchResult) && dispatchResult.state === 'refused' && isRef(dispatchResult.code)) {
    return { state: 'refused', correlation, code: dispatchResult.code }
  }
  if (isRecord(dispatchResult) && dispatchResult.state === 'not-dispatched') {
    return failure('unavailable', 'dispatch', correlation)
  }
  if (
    !isRecord(dispatchResult)
    || dispatchResult.state !== 'receipt'
    || !isRef(dispatchResult.receiptRef)
    || !isMatterGovernanceDispatchDetail(dispatchResult.detail)
  ) {
    return {
      state: 'outcome-unknown',
      code: 'protected-effect-outcome-unknown',
      stage: 'dispatch',
      retryable: false,
      correlation,
    }
  }
  return {
    state: 'dispatched',
    correlation,
    receiptRef: dispatchResult.receiptRef,
    detail: dispatchResult.detail,
  }
}
