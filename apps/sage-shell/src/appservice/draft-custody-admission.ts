/** L1-C (ADR-0323): the draft-custody admission family — the third protected-effect family.
 *
 *  Drafts live in the Sage-owned custody store; the four commands (create / update / cancel /
 *  reconcile) are local writes with no capability steps, so the family runs the same five-step
 *  profile as matter governance (caller -> context -> candidate -> identity -> dispatch), sharing
 *  the kernel's checker, guards and fact validators. The reconcile answer is itself a determinate
 *  receipt: settled / failed / unknown are the custodian's own verdicts, carried in the detail.
 */
import type { DraftReconcileOutcome, DraftStatus } from './contracts.js'
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

export type DraftCustodyOperation =
  | 'draft.create'
  | 'draft.update'
  | 'draft.cancel'
  | 'draft.reconcile'

export interface DraftCustodyIntent {
  readonly family: 'draft-custody'
  readonly requestId: string
  readonly operation: DraftCustodyOperation
  readonly candidate: { readonly kind: 'active-session' }
  readonly payload: Readonly<Record<string, unknown>>
}

export type DraftCustodyDispatchDetail =
  | { readonly kind: 'draft-created', readonly status: DraftStatus }
  | { readonly kind: 'draft-updated', readonly draftId: string, readonly status: DraftStatus }
  | { readonly kind: 'draft-canceled', readonly draftId: string, readonly status: DraftStatus }
  | { readonly kind: 'draft-reconciled', readonly draftId: string, readonly outcome: DraftReconcileOutcome }

export type DraftCustodyDispatchResult =
  | { readonly state: 'receipt', readonly receiptRef: string, readonly detail: DraftCustodyDispatchDetail }
  | { readonly state: 'refused', readonly code: string }
  | { readonly state: 'not-dispatched' }
  | { readonly state: 'outcome-unknown' }

export interface DraftCustodyAdmissionPorts {
  readonly verifyCaller?: (
    request: { readonly intent: DraftCustodyIntent, readonly correlation: string },
  ) => Promise<ProtectedEffectStepResult<CallerAdmissionFact>>
  readonly resolveActiveContext?: (
    request: { readonly intent: DraftCustodyIntent, readonly correlation: string, readonly caller: CallerAdmissionFact },
  ) => Promise<ProtectedEffectStepResult<RequestScopedActiveContext>>
  readonly matchCandidate?: (
    request: {
      readonly intent: DraftCustodyIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
    },
  ) => Promise<ProtectedEffectStepResult<MatchedCandidateFact>>
  readonly resolveIdentityPolicy?: (
    request: {
      readonly intent: DraftCustodyIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
      readonly candidate: MatchedCandidateFact
    },
  ) => Promise<ProtectedEffectStepResult<FreshIdentityPolicyFact>>
  readonly dispatch?: (
    request: {
      readonly intent: DraftCustodyIntent
      readonly correlation: string
      readonly caller: CallerAdmissionFact
      readonly context: RequestScopedActiveContext
      readonly candidate: MatchedCandidateFact
      readonly identityPolicy: FreshIdentityPolicyFact
    },
  ) => Promise<DraftCustodyDispatchResult>
}

export type DraftCustodyAdmissionResult =
  | {
      readonly state: 'dispatched'
      readonly correlation: string
      readonly receiptRef: string
      readonly detail: DraftCustodyDispatchDetail
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

function isDraftStatus(value: unknown): value is DraftStatus {
  if (!isRecord(value)) return false
  if (value.state !== 'unlocked' && value.state !== 'locked' && value.state !== 'unavailable') return false
  return Array.isArray(value.drafts)
}

function isDraftReconcileOutcome(value: unknown): value is DraftReconcileOutcome {
  if (!isRecord(value)) return false
  if (!isRef(value.draftId)) return false
  if (value.state === 'settled') return isRef(value.matterRef)
  if (value.state === 'unknown' || value.state === 'failed') return isRef(value.code)
  return false
}

export function isDraftCustodyDispatchDetail(value: unknown): value is DraftCustodyDispatchDetail {
  if (!isRecord(value)) return false
  if (value.kind === 'draft-created') return isDraftStatus(value.status)
  if (value.kind === 'draft-updated' || value.kind === 'draft-canceled') {
    return isRef(value.draftId) && isDraftStatus(value.status)
  }
  if (value.kind === 'draft-reconciled') {
    return isRef(value.draftId) && isDraftReconcileOutcome(value.outcome) && value.outcome.draftId === value.draftId
  }
  return false
}

/** Evaluate exactly one draft-custody attempt. Never retries; a dispatch throw is the
 *  conservative unknown. Absent ports always fail closed. */
export async function admitDraftCustodyEffect(input: {
  readonly intent: DraftCustodyIntent
  readonly correlation: string
  readonly ports: DraftCustodyAdmissionPorts
}): Promise<DraftCustodyAdmissionResult> {
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

  const intentCandidate: unknown = intent.candidate
  if (!isRecord(intentCandidate) || intentCandidate.kind !== 'active-session') {
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
    dispatchResult = await ports.dispatch({ intent, correlation, caller, context, candidate, identityPolicy })
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
    || !isDraftCustodyDispatchDetail(dispatchResult.detail)
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
