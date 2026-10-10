/** T05 prepare (ADR-0290): enter the first working revision before the first send.
 *
 *  The ten-step protected-effect chain requires a current revision (compatibility binds its
 *  store-validated digest). A fresh matter has none. This runner performs the governed local
 *  preparation write that the user's explicit input witnesses (adjudicated 2026-10-11):
 *
 *  - Path A (narrowed): the real front ports run in order — caller -> active context ->
 *    candidate match -> identity / policy — over the SAME instances the send chain uses. Target,
 *    compatibility, registry, preflight and dispatch are skipped: a local audit write never
 *    touches the outside world.
 *  - Witness: the user's explicit text becomes one supported evidence item
 *    (`source: 'user-input'`); the main-owned runner is the promoter, never the UI.
 *  - Policies: the revision's actionPolicies project the shipped requirement's
 *    `actionRequirements`; the identity step independently verifies the caller's grant for
 *    `session.prepare` itself. Mismatches fail closed.
 *  - Write: the domain kernel authors `revision-entered`; a plain idempotent append lands it
 *    (no compatibility evidence rides a preparation write).
 *
 *  "not-needed" is the honest answer when a revision already exists (or the matter is unknown);
 *  the send chain then runs unchanged and fails closed on its own terms.
 */
import { randomUUID } from 'node:crypto'

import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import { enterEvidence, projectBusinessMatter } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
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

const FAILURE_CODES = {
  unavailable: 'protected-effect-unavailable',
  denied: 'protected-effect-denied',
  stale: 'protected-effect-stale',
} as const

export function createSessionPromptPrepareRunner(
  options: SessionPromptPrepareOptions,
): SessionPrepareRunner {
  const bundleOk = options.requirementBundle.ok
  return async ({ matterRef, text }) => {
    const bundle = options.requirementBundle
    if (!bundleOk || !bundle.ok) return { state: 'refused', code: FAILURE_CODES.unavailable }
    if (typeof text !== 'string' || text.length === 0 || text.length > 16_384) {
      return { state: 'refused', code: 'invalid-session-request' }
    }

    const readMatter = options.attempts.readMatter(matterRef)
    if (readMatter === undefined) return { state: 'refused', code: FAILURE_CODES.unavailable }
    if ('denied' in readMatter) {
      // An unknown matter is not this runner's refusal: the send chain fails closed on its own.
      return { state: 'not-needed' }
    }
    // "Not-needed" means the CURRENT revision already declares the send scope. Custody births
    // every matter with a policy-less revision:1 ("a later revision declares what may run"), so
    // a policy-less current revision is exactly the case this runner exists for.
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

    // The revision's run policies come from the shipped requirement declaration (the send
    // scope's action requirements); the prepare grant above only authorized this write.
    const declaring = bundle.snapshot.entries.filter((entry) => entry.actionRequirements
      .some((action) => action.actionScope === sendTable?.actionScope))
    const requirement = declaring.length === 1 ? declaring[0] : undefined
    if (requirement === undefined) return { state: 'refused', code: FAILURE_CODES.unavailable }

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
          source: 'user-input',
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
      // The domain kernel refused (a pending receipt, a running attempt, a malformed history).
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

    let appended
    try {
      appended = options.attempts.appendRevision({
        matterId: matterRef,
        expectedVersion: { kind: 'exact', value: readMatter.version },
        appendId: `session-prepare:${intent.requestId}`,
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
}
