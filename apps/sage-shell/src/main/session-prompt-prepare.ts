/** T05 prepare (ADR-0290/0291): enter the working revision before the first send.
 *
 *  Two governed entry points share one write core (`ensureRunRevision`):
 *  - the send-time runner (ADR-0290): the four front ports in chain order, then the core;
 *  - the selection-time ensure (ADR-0291): the selection kernel already proved the identity
 *    session and the read authorization, so only the `session.prepare` grant is re-checked here
 *    before the core — and the kernel's CAS then binds the ensured revision.
 *
 *  Core semantics (adjudicated 2026-10-11): "not-needed" = the CURRENT revision already declares
 *  the send scope. Custody births every matter with a policy-less `revision:1` ("a later
 *  revision declares what may run"), so a policy-less current revision is exactly the case this
 *  module exists for. The write is a governed local audit: the user's explicit input witnesses
 *  (the selection-time variant witnesses the user's explicit selection), the domain kernel
 *  authors `revision-entered`, the run policies project the shipped requirement declaration, and
 *  a plain idempotent append lands it — no compatibility evidence rides a preparation write.
 */
import { randomUUID } from 'node:crypto'

import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { enterEvidence, projectBusinessMatter, type BusinessMatter } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { CompatibilityTargetRequirementSnapshotV1 } from '../security/compatibility-target-requirement.js'
import type { RequirementBundleLoad } from './publication-bundle.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'

export type SessionPrepareResult =
  | { readonly state: 'prepared' }
  | { readonly state: 'not-needed' }
  | { readonly state: 'refused'; readonly code: string }

export type SessionPrepareRunner = (request: {
  readonly matterRef: string
  readonly text: string
}) => Promise<SessionPrepareResult>

export type SessionPrepareEnsureResult =
  | { readonly state: 'ready' }
  | { readonly state: 'not-needed' }
  | { readonly state: 'refused'; readonly code: string }

export interface SessionPromptPrepareOptions {
  readonly ports: Pick<
    ProtectedEffectAdmissionPorts,
    'verifyCaller' | 'resolveActiveContext' | 'matchCandidate' | 'resolveIdentityPolicy'
  >
  readonly attempts: SessionPromptAttemptStorePort
  readonly requirementBundle: RequirementBundleLoad
  readonly callerCorrelation: string
  readonly now: () => string
}

interface PrepareCoreOptions {
  readonly attempts: SessionPromptAttemptStorePort
  readonly requirementBundle: RequirementBundleLoad
  readonly now: () => string
}

export interface SessionPromptPrepareEnsureOptions extends PrepareCoreOptions {
  /** The identity / policy port (only `intent` is consumed): the selection-time grant check for
   *  `session.prepare`. Read authorization and the identity session were already proven by the
   *  selection kernel before this ensure runs (ADR-0291). */
  readonly identityPolicy: NonNullable<ProtectedEffectAdmissionPorts['resolveIdentityPolicy']>
  readonly correlation: string
}

const FAILURE_CODES = {
  unavailable: 'protected-effect-unavailable',
  denied: 'protected-effect-denied',
  stale: 'protected-effect-stale',
} as const

type RunRevisionDecision =
  | { readonly state: 'not-needed' }
  | { readonly state: 'refused'; readonly code: string }
  | {
      readonly state: 'needed'
      readonly readMatter: { readonly matter: BusinessMatter; readonly version: number }
      readonly requirement: RequirementEntry
    }

type RequirementEntry = CompatibilityTargetRequirementSnapshotV1['entries'][number]

/** Read-only decision: does the CURRENT revision already declare the send scope? The decision
 *  runs BEFORE any authority check by design — an already-prepared matter must not demand the
 *  prepare grant just to be selected or sent to (the same read-before-policy precedent as the
 *  context step). "needed" carries the store read the write half will use. */
function decideRunRevision(
  options: PrepareCoreOptions,
  matterRef: string,
): RunRevisionDecision {
  const bundle = options.requirementBundle
  if (!bundle.ok) return { state: 'refused', code: FAILURE_CODES.unavailable }

  const readMatter = options.attempts.readMatter(matterRef)
  if (readMatter === undefined) return { state: 'refused', code: FAILURE_CODES.unavailable }
  if ('denied' in readMatter) {
    // An unknown matter is not this core's refusal: the caller fails closed on its own terms.
    return { state: 'not-needed' }
  }
  const sendTable = ACTION_AUTHORITY_TABLE['session.send']
  let currentRevision: { readonly actionPolicies: readonly { readonly actionScope: string }[] } | undefined
  try {
    const projection = projectBusinessMatter(readMatter.matter)
    const currentRevisionId: string | undefined = projection.currentRevisionId
    currentRevision = projection.revisions.find((revision) => revision.revisionId === currentRevisionId)
  } catch {
    return { state: 'refused', code: FAILURE_CODES.unavailable }
  }
  if (currentRevision !== undefined && currentRevision.actionPolicies
    .some((policy) => policy.actionScope === sendTable?.actionScope)) {
    return { state: 'not-needed' }
  }

  // The revision's run policies come from the shipped requirement declaration (the send
  // scope's action requirements); the prepare grant only authorized this write.
  const declaring = bundle.snapshot.entries.filter((entry) => entry.actionRequirements
    .some((action) => action.actionScope === sendTable?.actionScope))
  const requirement = declaring.length === 1 ? declaring[0] : undefined
  if (requirement === undefined) return { state: 'refused', code: FAILURE_CODES.unavailable }
  return { state: 'needed', readMatter, requirement }
}

/** The shared write half: domain-authored revision-entered -> plain idempotent append. */
async function writeRunRevision(
  options: PrepareCoreOptions,
  matterRef: string,
  decision: Extract<RunRevisionDecision, { state: 'needed' }>,
  witness: { readonly source: string },
): Promise<SessionPrepareResult> {
  const { readMatter, requirement } = decision
  const occurredAt = options.now()
  const revisionId = `revision:sage.${randomUUID()}`
  let next
  try {
    next = enterEvidence(readMatter.matter, {
      eventId: `revision-entered:${revisionId}`,
      occurredAt,
      revisionId,
      changeReason: '首个工作修订：用户显式输入即见证。',
      scope: '一次会话发送的受治理范围。',
      permissionBoundary: '仅会话通道，不产生其他外部变更。',
      dataDestination: 'Sage 会话通道。',
      evidence: [{
        evidenceId: `evidence:sage.${randomUUID()}`,
        source: witness.source,
        observedAt: occurredAt,
        status: 'supported',
      }],
      unknowns: [],
      options: [],
      dependencies: [],
      experienceRefs: [],
      actionPolicies: requirement.actionRequirements.map((action) => ({
        actionScope: action.actionScope,
        effectClass: action.effectClass,
        requiresDecision: action.requiresDecision,
      })),
    })
  } catch {
    // The domain kernel refused (a running attempt, a pending receipt, a malformed history).
    return { state: 'refused', code: 'session-prepare-declined' }
  }

  const events = encodeBusinessMatterEvents(next).slice(readMatter.matter.events.length).map((event) => ({
    matterId: event.matterId,
    eventId: event.eventId,
    eventType: event.eventType,
    eventSchemaVersion: event.eventSchemaVersion,
    occurredAt: event.occurredAt,
    payloadBytes: event.payloadBytes.slice(),
  }))
  if (events.length === 0) return { state: 'refused', code: FAILURE_CODES.unavailable }

  const requestId = randomUUID()
  let appended
  try {
    appended = options.attempts.appendRevision({
      matterId: matterRef,
      expectedVersion: { kind: 'exact', value: readMatter.version },
      appendId: `session-prepare:${requestId}`,
      events,
    })
  } catch {
    return { state: 'refused', code: FAILURE_CODES.unavailable }
  }
  switch (appended.kind) {
    case 'appended':
    case 'replayed':
      return { state: 'prepared' }
    default:
      return { state: 'refused', code: FAILURE_CODES.unavailable }
  }
}

export function createSessionPromptPrepareRunner(
  options: SessionPromptPrepareOptions,
): SessionPrepareRunner {
  const bundleOk = options.requirementBundle.ok
  return async ({ matterRef, text }) => {
    if (!bundleOk || !options.requirementBundle.ok) {
      return { state: 'refused', code: FAILURE_CODES.unavailable }
    }
    if (typeof text !== 'string' || text.length === 0 || text.length > 16_384) {
      return { state: 'refused', code: 'invalid-session-request' }
    }
    // Read-before-policy: an already-prepared matter must not demand the prepare grant.
    const decision = decideRunRevision(options, matterRef)
    if (decision.state !== 'needed') return decision
    // The same four ports the send chain runs, in the same order. Each failure maps to the
    // stable protected-effect refusal family; the kernel's try/catch contract is mirrored here.
    const intent = {
      family: 'session-core' as const,
      requestId: randomUUID(),
      operation: 'session.prepare',
      candidate: { kind: 'matter' as const, matterRef },
      payload: { text } as Readonly<Record<string, unknown>>,
    }
    type CallerBound = Parameters<NonNullable<ProtectedEffectAdmissionPorts['resolveActiveContext']>>[0]
    type ContextBound = Parameters<NonNullable<ProtectedEffectAdmissionPorts['matchCandidate']>>[0]
    type CandidateBound = Parameters<NonNullable<ProtectedEffectAdmissionPorts['resolveIdentityPolicy']>>[0]
    const base = { intent, correlation: options.callerCorrelation } as CallerBound
    const guarded = async <T>(
      call: () => Promise<{ state: 'allowed'; value: T } | { state: 'unavailable' | 'denied' | 'stale' }>,
    ): Promise<{ ok: true; value: T } | { ok: false; code: string }> => {
      let step
      try {
        step = await call()
      } catch {
        return { ok: false, code: FAILURE_CODES.unavailable }
      }
      return step.state === 'allowed' ? { ok: true, value: step.value } : { ok: false, code: FAILURE_CODES[step.state] }
    }

    const callerStep = await guarded(() => options.ports.verifyCaller!(base))
    if (!callerStep.ok) return { state: 'refused', code: callerStep.code }
    const contextStep = await guarded(() => options.ports.resolveActiveContext!({ ...base, caller: callerStep.value } as ContextBound))
    if (!contextStep.ok) return { state: 'refused', code: contextStep.code }
    const candidateStep = await guarded(() => options.ports.matchCandidate!({ ...base, context: contextStep.value } as ContextBound))
    if (!candidateStep.ok) return { state: 'refused', code: candidateStep.code }
    const identityStep = await guarded(() => options.ports.resolveIdentityPolicy!({
      ...base,
      context: contextStep.value,
      candidateMatch: candidateStep.value,
    } as CandidateBound))
    if (!identityStep.ok) return { state: 'refused', code: identityStep.code }

    return writeRunRevision(options, matterRef, decision, { source: 'user-input' })
  }
}

export function createSessionPromptPrepareEnsure(
  options: SessionPromptPrepareEnsureOptions,
): (request: { readonly matterId: string }) => Promise<SessionPrepareEnsureResult> {
  const bundleOk = options.requirementBundle.ok
  return async ({ matterId }) => {
    if (!bundleOk || !options.requirementBundle.ok) {
      return { state: 'refused', code: FAILURE_CODES.unavailable }
    }
    const decision = decideRunRevision(options, matterId)
    if (decision.state === 'not-needed') return { state: 'not-needed' }
    if (decision.state === 'refused') return decision
    const intent = {
      family: 'session-core' as const,
      requestId: randomUUID(),
      operation: 'session.prepare',
      candidate: { kind: 'matter' as const, matterRef: matterId },
      payload: {} as Readonly<Record<string, unknown>>,
    }
    let step
    try {
      step = await options.identityPolicy({ intent, correlation: options.correlation } as never)
    } catch {
      return { state: 'refused', code: FAILURE_CODES.unavailable }
    }
    if (step.state !== 'allowed') return { state: 'refused', code: FAILURE_CODES[step.state] }
    // The witness is the user's explicit selection of this matter (adjudicated 2026-10-11).
    const outcome = await writeRunRevision(options, matterId, decision, { source: 'user-selection' })
    return outcome.state === 'prepared'
      ? { state: 'ready' }
      : outcome.state === 'not-needed'
        ? { state: 'not-needed' }
        : { state: 'refused', code: outcome.code }
  }
}
