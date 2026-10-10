/**
 * Fail-closed admission for main-owned projection reads.
 *
 * A read is evaluated in one fixed order. No raw read may run until caller binding, the initial
 * context, an independent read-policy decision, a freshly resolved scope, candidate matching and
 * pre-read freshness have all passed. The returned value stays private until a second freshness
 * check succeeds, so a context change during I/O cannot escape as a stale projection.
 */

export const PROJECTION_READ_OPERATIONS = [
  'state.read',
  'workspace.files.list-candidates',
  'workspace.files.create-reference',
  'workspace.files.use-reference',
  'session.history.list',
  'session.history.detail',
  'session.anchors.read',
  'session.anchors.locate',
  'session.terminal.read',
  'session.attempt.status',
  'search.query',
  'artifacts.observe',
  'artifacts.open',
  'artifacts.retry',
  'edit-drafts.create',
  'edit-drafts.diff',
  'run-log.read',
] as const

export type ProjectionReadOperation = (typeof PROJECTION_READ_OPERATIONS)[number]

export interface ProjectionReadIntent<TCandidate> {
  readonly operation: ProjectionReadOperation
  /** Candidate only. It is never authority and must be matched after a fresh scope is resolved. */
  readonly candidate: TCandidate
}

export interface ProjectionReadCallerFact {
  readonly bindingRef: string
}

/** Initial request context captured before policy evaluation. */
export interface ProjectionReadInitialContext {
  readonly scope: 'request'
  readonly callerBindingRef: string
  readonly sessionRef: string
  readonly matterRef: string
  readonly contextGeneration: number
  readonly frameGeneration: number
}

/** A read decision is independent from authentication and list visibility. */
export interface ProjectionReadPolicyFact {
  readonly decisionRef: string
  readonly actorScopeRef: string
}

/**
 * Fresh, main-owned scope resolved after read policy. `trustedWorkspaceRoot` must never be sourced
 * from renderer input. The kernel verifies that all repeated context and policy bindings agree.
 */
export interface ProjectionReadScope {
  readonly matterRef: string
  readonly revisionRef: string
  readonly workspaceRef: string
  readonly trustedWorkspaceRoot: string
  readonly sessionRef: string
  readonly actorScopeRef: string
  readonly contextGeneration: number
  readonly frameGeneration: number
}

export interface ProjectionReadCandidateFact {
  readonly candidateRef: string
}

export interface ProjectionReadFreshnessFact {
  readonly freshnessRef: string
}

export type ProjectionReadStepResult<T> =
  | { readonly state: 'allowed'; readonly value: T }
  | { readonly state: 'unavailable' | 'denied' | 'stale' }

export interface ProjectionReadRequestBase {
  readonly operation: ProjectionReadOperation
  readonly correlation: string
}

export interface ProjectionReadCallerBoundRequest extends ProjectionReadRequestBase {
  readonly caller: ProjectionReadCallerFact
}

export interface ProjectionReadContextBoundRequest extends ProjectionReadCallerBoundRequest {
  readonly initialContext: ProjectionReadInitialContext
}

export interface ProjectionReadPolicyBoundRequest extends ProjectionReadContextBoundRequest {
  readonly readPolicy: ProjectionReadPolicyFact
}

export interface ProjectionReadScopeBoundRequest extends ProjectionReadPolicyBoundRequest {
  readonly scope: ProjectionReadScope
}

export interface ProjectionReadCandidateRequest<TCandidate>
  extends ProjectionReadScopeBoundRequest {
  /** Withheld from caller, context, policy and scope providers to keep authorization independent. */
  readonly candidate: TCandidate
}

export interface ProjectionReadCandidateBoundRequest<TCandidate>
  extends ProjectionReadCandidateRequest<TCandidate> {
  readonly candidateMatch: ProjectionReadCandidateFact
}

export interface ProjectionReadReadyRequest<TCandidate>
  extends ProjectionReadCandidateBoundRequest<TCandidate> {
  readonly preReadFreshness: ProjectionReadFreshnessFact
}

/** Every optional port is a runtime dependency: absence always fails closed. */
export interface ProjectionReadAdmissionPorts<TCandidate, TValue> {
  readonly verifyCaller?: (
    request: ProjectionReadRequestBase,
  ) => Promise<ProjectionReadStepResult<ProjectionReadCallerFact>>
  readonly resolveInitialContext?: (
    request: ProjectionReadCallerBoundRequest,
  ) => Promise<ProjectionReadStepResult<ProjectionReadInitialContext>>
  readonly authorizeRead?: (
    request: ProjectionReadContextBoundRequest,
  ) => Promise<ProjectionReadStepResult<ProjectionReadPolicyFact>>
  readonly resolveFreshScope?: (
    request: ProjectionReadPolicyBoundRequest,
  ) => Promise<ProjectionReadStepResult<ProjectionReadScope>>
  readonly matchCandidate?: (
    request: ProjectionReadCandidateRequest<TCandidate>,
  ) => Promise<ProjectionReadStepResult<ProjectionReadCandidateFact>>
  readonly checkPreReadFreshness?: (
    request: ProjectionReadCandidateBoundRequest<TCandidate>,
  ) => Promise<ProjectionReadStepResult<ProjectionReadFreshnessFact>>
  readonly read?: (
    request: ProjectionReadReadyRequest<TCandidate>,
  ) => Promise<ProjectionReadStepResult<TValue>>
  /** Runtime decoding is mandatory because a generic TypeScript return type is not evidence. */
  readonly validatesReadValue?: (value: unknown) => value is TValue
  readonly checkPostReadFreshness?: (
    request: ProjectionReadReadyRequest<TCandidate>,
  ) => Promise<ProjectionReadStepResult<ProjectionReadFreshnessFact>>
}

export type ProjectionReadAdmissionStage =
  | 'caller'
  | 'initial-context'
  | 'read-policy'
  | 'fresh-scope'
  | 'candidate-match'
  | 'pre-read-freshness'
  | 'read'
  | 'post-read-freshness'

export type ProjectionReadAdmissionFailure =
  | {
      readonly state: 'unavailable'
      readonly code: 'projection-read-unavailable'
      readonly stage: ProjectionReadAdmissionStage
      readonly retryable: true
      readonly correlation: string
    }
  | {
      readonly state: 'denied'
      readonly code: 'projection-read-denied'
      readonly stage: ProjectionReadAdmissionStage
      readonly retryable: false
      readonly correlation: string
    }
  | {
      readonly state: 'stale'
      readonly code: 'projection-read-stale'
      readonly stage: ProjectionReadAdmissionStage
      readonly retryable: false
      readonly correlation: string
    }

export interface ProjectionReadAdmissionAccepted<TValue> {
  readonly state: 'read'
  readonly correlation: string
  readonly value: TValue
}

export type ProjectionReadAdmissionResult<TValue> =
  | ProjectionReadAdmissionAccepted<TValue>
  | ProjectionReadAdmissionFailure

type ProjectionReadFailureState = 'unavailable' | 'denied' | 'stale'

type CheckedStep<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly state: ProjectionReadFailureState }

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isRef(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

function hasRefs(value: unknown, ...keys: readonly string[]): value is Readonly<Record<string, string>> {
  return isRecord(value) && keys.every((key) => isRef(value[key]))
}

function isCallerFact(value: unknown): value is ProjectionReadCallerFact {
  return hasRefs(value, 'bindingRef')
}

function isInitialContext(value: unknown): value is ProjectionReadInitialContext {
  return hasRefs(value, 'callerBindingRef', 'sessionRef', 'matterRef')
    && value.scope === 'request'
    && isGeneration(value.contextGeneration)
    && isGeneration(value.frameGeneration)
}

function isPolicyFact(value: unknown): value is ProjectionReadPolicyFact {
  return hasRefs(value, 'decisionRef', 'actorScopeRef')
}

function isProjectionReadScope(value: unknown): value is ProjectionReadScope {
  return hasRefs(
    value,
    'matterRef',
    'revisionRef',
    'workspaceRef',
    'trustedWorkspaceRoot',
    'sessionRef',
    'actorScopeRef',
  )
    && isGeneration(value.contextGeneration)
    && isGeneration(value.frameGeneration)
}

function isCandidateFact(value: unknown): value is ProjectionReadCandidateFact {
  return hasRefs(value, 'candidateRef')
}

function isFreshnessFact(value: unknown): value is ProjectionReadFreshnessFact {
  return hasRefs(value, 'freshnessRef')
}

export function isProjectionReadOperation(value: unknown): value is ProjectionReadOperation {
  return typeof value === 'string'
    && (PROJECTION_READ_OPERATIONS as readonly string[]).includes(value)
}

async function checkStep<Request, Fact>(
  provider: ((request: Request) => Promise<ProjectionReadStepResult<Fact>>) | undefined,
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
  state: ProjectionReadFailureState,
  stage: ProjectionReadAdmissionStage,
  correlation: string,
): ProjectionReadAdmissionFailure {
  if (state === 'unavailable') {
    return { state, code: 'projection-read-unavailable', stage, retryable: true, correlation }
  }
  if (state === 'stale') {
    return { state, code: 'projection-read-stale', stage, retryable: false, correlation }
  }
  return { state, code: 'projection-read-denied', stage, retryable: false, correlation }
}

/** Evaluate exactly one projection read. The kernel never retries or exposes provider errors. */
export async function admitProjectionRead<TCandidate, TValue>(input: {
  readonly intent: ProjectionReadIntent<TCandidate>
  readonly correlation: string
  readonly ports: ProjectionReadAdmissionPorts<TCandidate, TValue>
}): Promise<ProjectionReadAdmissionResult<TValue>> {
  const { intent, correlation, ports } = input

  if (!isProjectionReadOperation(intent.operation)) {
    return failure('unavailable', 'caller', correlation)
  }
  const base: ProjectionReadRequestBase = { operation: intent.operation, correlation }

  const callerStep = await checkStep(ports.verifyCaller, base, isCallerFact)
  if (!callerStep.ok) return failure(callerStep.state, 'caller', correlation)
  const caller: ProjectionReadCallerFact = { bindingRef: callerStep.value.bindingRef }

  const callerRequest: ProjectionReadCallerBoundRequest = { ...base, caller }
  const contextStep = await checkStep(
    ports.resolveInitialContext,
    callerRequest,
    isInitialContext,
  )
  if (!contextStep.ok) return failure(contextStep.state, 'initial-context', correlation)
  const initialContext: ProjectionReadInitialContext = {
    scope: 'request',
    callerBindingRef: contextStep.value.callerBindingRef,
    sessionRef: contextStep.value.sessionRef,
    matterRef: contextStep.value.matterRef,
    contextGeneration: contextStep.value.contextGeneration,
    frameGeneration: contextStep.value.frameGeneration,
  }
  if (initialContext.callerBindingRef !== caller.bindingRef) {
    return failure('denied', 'initial-context', correlation)
  }

  const contextRequest: ProjectionReadContextBoundRequest = {
    ...callerRequest,
    initialContext,
  }
  const policyStep = await checkStep(ports.authorizeRead, contextRequest, isPolicyFact)
  if (!policyStep.ok) return failure(policyStep.state, 'read-policy', correlation)
  const readPolicy: ProjectionReadPolicyFact = {
    decisionRef: policyStep.value.decisionRef,
    actorScopeRef: policyStep.value.actorScopeRef,
  }

  const policyRequest: ProjectionReadPolicyBoundRequest = {
    ...contextRequest,
    readPolicy,
  }
  const scopeStep = await checkStep(
    ports.resolveFreshScope,
    policyRequest,
    isProjectionReadScope,
  )
  if (!scopeStep.ok) return failure(scopeStep.state, 'fresh-scope', correlation)
  const scope: ProjectionReadScope = {
    matterRef: scopeStep.value.matterRef,
    revisionRef: scopeStep.value.revisionRef,
    workspaceRef: scopeStep.value.workspaceRef,
    trustedWorkspaceRoot: scopeStep.value.trustedWorkspaceRoot,
    sessionRef: scopeStep.value.sessionRef,
    actorScopeRef: scopeStep.value.actorScopeRef,
    contextGeneration: scopeStep.value.contextGeneration,
    frameGeneration: scopeStep.value.frameGeneration,
  }
  if (
    scope.matterRef !== initialContext.matterRef
    || scope.sessionRef !== initialContext.sessionRef
    || scope.contextGeneration !== initialContext.contextGeneration
    || scope.frameGeneration !== initialContext.frameGeneration
    || scope.actorScopeRef !== readPolicy.actorScopeRef
  ) {
    return failure('stale', 'fresh-scope', correlation)
  }

  const scopeRequest: ProjectionReadScopeBoundRequest = {
    ...policyRequest,
    scope,
  }
  const candidateToMatch: ProjectionReadCandidateRequest<TCandidate> = {
    ...scopeRequest,
    candidate: intent.candidate,
  }
  const candidateStep = await checkStep(
    ports.matchCandidate,
    candidateToMatch,
    isCandidateFact,
  )
  if (!candidateStep.ok) return failure(candidateStep.state, 'candidate-match', correlation)
  const candidateMatch: ProjectionReadCandidateFact = {
    candidateRef: candidateStep.value.candidateRef,
  }

  const candidateRequest: ProjectionReadCandidateBoundRequest<TCandidate> = {
    ...candidateToMatch,
    candidateMatch,
  }
  const preReadStep = await checkStep(
    ports.checkPreReadFreshness,
    candidateRequest,
    isFreshnessFact,
  )
  if (!preReadStep.ok) {
    return failure(preReadStep.state, 'pre-read-freshness', correlation)
  }
  const preReadFreshness: ProjectionReadFreshnessFact = {
    freshnessRef: preReadStep.value.freshnessRef,
  }
  const readyRequest: ProjectionReadReadyRequest<TCandidate> = {
    ...candidateRequest,
    preReadFreshness,
  }

  if (ports.validatesReadValue === undefined) {
    return failure('unavailable', 'read', correlation)
  }
  const readStep = await checkStep(ports.read, readyRequest, ports.validatesReadValue)
  if (!readStep.ok) return failure(readStep.state, 'read', correlation)
  const value = readStep.value

  const postReadStep = await checkStep(
    ports.checkPostReadFreshness,
    readyRequest,
    isFreshnessFact,
  )
  if (!postReadStep.ok) {
    return failure(postReadStep.state, 'post-read-freshness', correlation)
  }
  if (postReadStep.value.freshnessRef !== preReadFreshness.freshnessRef) {
    return failure('stale', 'post-read-freshness', correlation)
  }

  return { state: 'read', correlation, value }
}
