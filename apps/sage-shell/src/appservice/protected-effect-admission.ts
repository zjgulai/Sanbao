/**
 * AUTH-02A: fail-closed admission for session-core protected effects.
 *
 * The kernel is deliberately independent from transport and composition. It only admits a
 * dispatch after fresh, request-scoped facts have passed in a fixed order. Provider failures are
 * collapsed to stable product states; provider errors and authority objects never reach callers.
 */

import type { CompatibilityEvaluationEvidenceV1 } from '../security/compatibility-evaluation-evidence.js'

export interface SessionCoreProtectedEffectIntent {
  readonly family: 'session-core'
  readonly requestId: string
  readonly operation: string
  /** Never carries a revision. Revision freshness comes only from main-owned active context. */
  readonly candidate: SessionCoreProtectedEffectCandidate
  readonly payload: Readonly<Record<string, unknown>>
}

export type SessionCoreProtectedEffectCandidate =
  | { readonly kind: 'active-session' }
  | { readonly kind: 'matter'; readonly matterRef: string }

export interface RequestScopedActiveContext {
  readonly scope: 'request'
  readonly callerBindingRef: string
  readonly sessionRef: string
  readonly matterRef: string
  readonly revisionRef: string
  readonly generation: string
}

export interface CallerAdmissionFact {
  readonly bindingRef: string
}

export interface FreshIdentityPolicyFact {
  readonly decisionRef: string
  readonly actorScopeRef: string
}

export interface MatchedCandidateFact {
  readonly candidateRef: string
}

export interface TrustedTargetFact {
  readonly targetRef: string
}

export interface EquivalentCompatibilityFact {
  readonly evaluationRef: string
  readonly outcome: 'equivalent'
  /** The sealed evaluation evidence this admission actually used (ADR-0288). Optional in the
   *  admission contract — probes and pre-evidence ports may omit it — but the persist step
   *  refuses to write without it. The shape guard stays lenient; validation is the codec's job. */
  readonly evidence?: CompatibilityEvaluationEvidenceV1
}

export interface ApprovedRegistryFact {
  readonly mappingRef: string
}

export interface FreshPreflightFact {
  readonly preflightRef: string
}

export interface ProtectedEffectPersistenceFact {
  readonly operationRef: string
  readonly dispatchRef: string
}

export type ProtectedEffectStepResult<T> =
  | { readonly state: 'allowed'; readonly value: T }
  | { readonly state: 'unavailable' | 'denied' | 'stale' }

interface AdmissionRequestBase {
  readonly intent: SessionCoreProtectedEffectIntent
  readonly correlation: string
}

interface CallerBoundRequest extends AdmissionRequestBase {
  readonly caller: CallerAdmissionFact
}

interface ContextBoundRequest extends CallerBoundRequest {
  readonly context: RequestScopedActiveContext
}

interface CandidateBoundRequest extends ContextBoundRequest {
  readonly candidateMatch: MatchedCandidateFact
}

interface IdentityBoundRequest extends CandidateBoundRequest {
  readonly identityPolicy: FreshIdentityPolicyFact
}

interface TargetBoundRequest extends IdentityBoundRequest {
  readonly target: TrustedTargetFact
}

interface CompatibilityBoundRequest extends TargetBoundRequest {
  readonly compatibility: EquivalentCompatibilityFact
}

interface RegistryBoundRequest extends CompatibilityBoundRequest {
  readonly registry: ApprovedRegistryFact
}

interface PreflightBoundRequest extends RegistryBoundRequest {
  readonly preflight: FreshPreflightFact
}

export interface ProtectedEffectDispatchRequest extends AdmissionRequestBase {
  readonly context: RequestScopedActiveContext
  readonly target: TrustedTargetFact
  readonly compatibility: EquivalentCompatibilityFact
  readonly registry: ApprovedRegistryFact
  readonly preflight: FreshPreflightFact
  readonly operationRef: string
  readonly dispatchRef: string
}

export type SessionCoreDispatchDetail =
  | {
      /** The session channel accepted the prompt (ADR-0289). */
      readonly kind: 'session-send-accepted'
      readonly sessionId: string
      readonly requestId: string
      readonly mode: 'queue' | 'steer'
    }
  | {
      /** The channel held the text as a 待继续 item; the send did not reach the inbox. */
      readonly kind: 'session-send-deferred'
      readonly itemId: string
    }

export type ProtectedEffectDispatchResult =
  | { readonly state: 'receipt'; readonly receiptRef: string; readonly detail?: SessionCoreDispatchDetail }
  | {
      /** A determinate refusal from the adapter itself — the effect did not run. */
      readonly state: 'refused'
      readonly code: string
    }
  | {
      /** A pre-call guard refused: the effect provably did not run and the caller may retry
       *  through a fresh admission (ADR-0289). */
      readonly state: 'not-dispatched'
    }
  | { readonly state: 'outcome-unknown' }

/** Every optional port is a runtime dependency: absence always fails closed. */
export interface ProtectedEffectAdmissionPorts {
  readonly verifyCaller?: (
    request: AdmissionRequestBase,
  ) => Promise<ProtectedEffectStepResult<CallerAdmissionFact>>
  readonly resolveActiveContext?: (
    request: CallerBoundRequest,
  ) => Promise<ProtectedEffectStepResult<RequestScopedActiveContext>>
  readonly matchCandidate?: (
    request: ContextBoundRequest,
  ) => Promise<ProtectedEffectStepResult<MatchedCandidateFact>>
  readonly resolveIdentityPolicy?: (
    request: CandidateBoundRequest,
  ) => Promise<ProtectedEffectStepResult<FreshIdentityPolicyFact>>
  readonly resolveTarget?: (
    request: IdentityBoundRequest,
  ) => Promise<ProtectedEffectStepResult<TrustedTargetFact>>
  readonly resolveCompatibility?: (
    request: TargetBoundRequest,
  ) => Promise<ProtectedEffectStepResult<EquivalentCompatibilityFact>>
  readonly resolveRegistry?: (
    request: CompatibilityBoundRequest,
  ) => Promise<ProtectedEffectStepResult<ApprovedRegistryFact>>
  readonly preflight?: (
    request: RegistryBoundRequest,
  ) => Promise<ProtectedEffectStepResult<FreshPreflightFact>>
  readonly persist?: (
    request: PreflightBoundRequest,
  ) => Promise<ProtectedEffectStepResult<ProtectedEffectPersistenceFact>>
  readonly dispatch?: (request: ProtectedEffectDispatchRequest) => Promise<ProtectedEffectDispatchResult>
}

export type ProtectedEffectAdmissionStep =
  | 'caller'
  | 'context'
  | 'candidate-match'
  | 'identity-policy'
  | 'target'
  | 'compatibility'
  | 'registry'
  | 'preflight'
  | 'persistence'
  | 'dispatch'

export type ProtectedEffectAdmissionFailure =
  | {
      readonly state: 'unavailable'
      readonly code: 'protected-effect-unavailable'
      readonly stage: ProtectedEffectAdmissionStep
      readonly retryable: true
      readonly correlation: string
    }
  | {
      readonly state: 'denied'
      readonly code: 'protected-effect-denied'
      readonly stage: ProtectedEffectAdmissionStep
      readonly retryable: false
      readonly correlation: string
    }
  | {
      readonly state: 'stale'
      readonly code: 'protected-effect-stale'
      readonly stage: ProtectedEffectAdmissionStep
      readonly retryable: false
      readonly correlation: string
    }
  | {
      readonly state: 'outcome-unknown'
      readonly code: 'protected-effect-outcome-unknown'
      readonly stage: 'dispatch'
      readonly retryable: false
      readonly correlation: string
    }

export interface ProtectedEffectAdmissionAccepted {
  readonly state: 'dispatched'
  readonly correlation: string
  readonly operationRef: string
  readonly receiptRef: string
  /** Family-declared receipt detail for the caller-facing outcome (ADR-0289); absent means the
   *  receipt carries no further caller detail (conservative mapping at the route). */
  readonly detail?: SessionCoreDispatchDetail
}

export interface ProtectedEffectAdmissionRefusedAfterDispatch {
  readonly state: 'refused'
  readonly correlation: string
  readonly code: string
}

export type ProtectedEffectAdmissionResult =
  | ProtectedEffectAdmissionAccepted
  | ProtectedEffectAdmissionRefusedAfterDispatch
  | ProtectedEffectAdmissionFailure

type PreDispatchFailureState = 'unavailable' | 'denied' | 'stale'

type CheckedStep<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly state: PreDispatchFailureState }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function hasRefs(value: unknown, ...keys: readonly string[]): value is Readonly<Record<string, string>> {
  return isRecord(value) && keys.every((key) => isRef(value[key]))
}

function isCallerFact(value: unknown): value is CallerAdmissionFact {
  return hasRefs(value, 'bindingRef')
}

function isActiveContext(value: unknown): value is RequestScopedActiveContext {
  return hasRefs(
    value,
    'callerBindingRef',
    'sessionRef',
    'matterRef',
    'revisionRef',
    'generation',
  ) && value.scope === 'request'
}

function isIdentityPolicyFact(value: unknown): value is FreshIdentityPolicyFact {
  return hasRefs(value, 'decisionRef', 'actorScopeRef')
}

function isMatchedCandidateFact(value: unknown): value is MatchedCandidateFact {
  return hasRefs(value, 'candidateRef')
}

function isTargetFact(value: unknown): value is TrustedTargetFact {
  return hasRefs(value, 'targetRef')
}

function isCompatibilityFact(value: unknown): value is EquivalentCompatibilityFact {
  return hasRefs(value, 'evaluationRef') && value.outcome === 'equivalent'
}

function isRegistryFact(value: unknown): value is ApprovedRegistryFact {
  return hasRefs(value, 'mappingRef')
}

function isPreflightFact(value: unknown): value is FreshPreflightFact {
  return hasRefs(value, 'preflightRef')
}

function isPersistenceFact(value: unknown): value is ProtectedEffectPersistenceFact {
  return hasRefs(value, 'operationRef', 'dispatchRef')
}

function isSessionCoreDispatchDetail(value: unknown): value is SessionCoreDispatchDetail {
  if (!isRecord(value)) return false
  if (value.kind === 'session-send-accepted') {
    return isRef(value.sessionId) && isRef(value.requestId)
      && (value.mode === 'queue' || value.mode === 'steer')
  }
  if (value.kind === 'session-send-deferred') return isRef(value.itemId)
  return false
}

async function checkStep<Request, Fact>(
  provider: ((request: Request) => Promise<ProtectedEffectStepResult<Fact>>) | undefined,
  request: Request,
  validates: (value: unknown) => value is Fact,
): Promise<CheckedStep<Fact>> {
  if (provider === undefined) return { ok: false, state: 'unavailable' }
  try {
    const result: unknown = await provider(request)
    if (!isRecord(result)) return { ok: false, state: 'unavailable' }
    if (result.state === 'unavailable' || result.state === 'denied' || result.state === 'stale') {
      return { ok: false, state: result.state }
    }
    if (result.state !== 'allowed' || !validates(result.value)) {
      return { ok: false, state: 'unavailable' }
    }
    return { ok: true, value: result.value }
  } catch {
    return { ok: false, state: 'unavailable' }
  }
}

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

function outcomeUnknown(correlation: string): ProtectedEffectAdmissionFailure {
  return {
    state: 'outcome-unknown',
    code: 'protected-effect-outcome-unknown',
    stage: 'dispatch',
    retryable: false,
    correlation,
  }
}

/**
 * Evaluate exactly one protected-effect attempt. This function never retries dispatch, including
 * when the provider throws or returns a malformed result after invocation.
 */
export async function admitProtectedEffect(input: {
  readonly intent: SessionCoreProtectedEffectIntent
  readonly correlation: string
  readonly ports: ProtectedEffectAdmissionPorts
}): Promise<ProtectedEffectAdmissionResult> {
  const { intent, correlation, ports } = input
  const base: AdmissionRequestBase = { intent, correlation }

  const callerStep = await checkStep(ports.verifyCaller, base, isCallerFact)
  if (!callerStep.ok) return failure(callerStep.state, 'caller', correlation)
  const caller: CallerAdmissionFact = { bindingRef: callerStep.value.bindingRef }

  const contextStep = await checkStep(
    ports.resolveActiveContext,
    { ...base, caller },
    isActiveContext,
  )
  if (!contextStep.ok) return failure(contextStep.state, 'context', correlation)
  const context: RequestScopedActiveContext = {
    scope: 'request',
    callerBindingRef: contextStep.value.callerBindingRef,
    sessionRef: contextStep.value.sessionRef,
    matterRef: contextStep.value.matterRef,
    revisionRef: contextStep.value.revisionRef,
    generation: contextStep.value.generation,
  }
  if (context.callerBindingRef !== caller.bindingRef) return failure('denied', 'context', correlation)

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

  const contextRequest: ContextBoundRequest = { ...base, caller, context }
  const candidateStep = await checkStep(
    ports.matchCandidate,
    contextRequest,
    isMatchedCandidateFact,
  )
  if (!candidateStep.ok) return failure(candidateStep.state, 'candidate-match', correlation)
  const candidateMatch: MatchedCandidateFact = { candidateRef: candidateStep.value.candidateRef }

  const candidateRequest: CandidateBoundRequest = { ...contextRequest, candidateMatch }
  const identityStep = await checkStep(
    ports.resolveIdentityPolicy,
    candidateRequest,
    isIdentityPolicyFact,
  )
  if (!identityStep.ok) return failure(identityStep.state, 'identity-policy', correlation)
  const identityPolicy: FreshIdentityPolicyFact = {
    decisionRef: identityStep.value.decisionRef,
    actorScopeRef: identityStep.value.actorScopeRef,
  }

  const identityRequest: IdentityBoundRequest = { ...candidateRequest, identityPolicy }
  const targetStep = await checkStep(ports.resolveTarget, identityRequest, isTargetFact)
  if (!targetStep.ok) return failure(targetStep.state, 'target', correlation)
  const target: TrustedTargetFact = { targetRef: targetStep.value.targetRef }

  const targetRequest: TargetBoundRequest = { ...identityRequest, target }
  const compatibilityStep = await checkStep(
    ports.resolveCompatibility,
    targetRequest,
    isCompatibilityFact,
  )
  if (!compatibilityStep.ok) {
    return failure(compatibilityStep.state, 'compatibility', correlation)
  }
  const compatibility: EquivalentCompatibilityFact = {
    evaluationRef: compatibilityStep.value.evaluationRef,
    outcome: 'equivalent',
    // The sealed evidence must survive this seam: the persist step writes exactly these bytes
    // (ADR-0288). Dropping it here made every real send fail closed at persistence — caught by
    // the step-10 end-to-end spec.
    ...(compatibilityStep.value.evidence === undefined ? {} : { evidence: compatibilityStep.value.evidence }),
  }

  const compatibilityRequest: CompatibilityBoundRequest = {
    ...targetRequest,
    compatibility,
  }
  const registryStep = await checkStep(
    ports.resolveRegistry,
    compatibilityRequest,
    isRegistryFact,
  )
  if (!registryStep.ok) return failure(registryStep.state, 'registry', correlation)
  const registry: ApprovedRegistryFact = { mappingRef: registryStep.value.mappingRef }

  const registryRequest: RegistryBoundRequest = { ...compatibilityRequest, registry }
  const preflightStep = await checkStep(ports.preflight, registryRequest, isPreflightFact)
  if (!preflightStep.ok) return failure(preflightStep.state, 'preflight', correlation)
  const preflight: FreshPreflightFact = { preflightRef: preflightStep.value.preflightRef }

  const preflightRequest: PreflightBoundRequest = { ...registryRequest, preflight }
  const persistenceStep = await checkStep(ports.persist, preflightRequest, isPersistenceFact)
  if (!persistenceStep.ok) return failure(persistenceStep.state, 'persistence', correlation)
  const persistence: ProtectedEffectPersistenceFact = {
    operationRef: persistenceStep.value.operationRef,
    dispatchRef: persistenceStep.value.dispatchRef,
  }

  if (ports.dispatch === undefined) return failure('unavailable', 'dispatch', correlation)
  let dispatchResult: unknown
  try {
    dispatchResult = await ports.dispatch({
      ...base,
      context,
      target,
      compatibility,
      registry,
      preflight,
      operationRef: persistence.operationRef,
      dispatchRef: persistence.dispatchRef,
    })
  } catch {
    return outcomeUnknown(correlation)
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
    || (dispatchResult.detail !== undefined && !isSessionCoreDispatchDetail(dispatchResult.detail))
  ) {
    return outcomeUnknown(correlation)
  }
  return {
    state: 'dispatched',
    correlation,
    operationRef: persistence.operationRef,
    receiptRef: dispatchResult.receiptRef,
    ...(dispatchResult.detail === undefined ? {} : { detail: dispatchResult.detail }),
  }
}
