/** T05-mid step 10 (ADR-0289): the dispatch step — the only place the admitted chain may call
 *  the real session channel.
 *
 *  Order of operations (application-service-boundary item 10):
 *  1. the shared step-9/10 re-verification (context / identity session / frame / store-validated
 *     revision digest / current revision / live runtime-effective observation);
 *  2. the cheap real ports re-run for this instant: target, registry and preflight are invoked
 *     again and their refs must equal the admitted ones — a moved target, mapping or roster
 *     answers stale before anything reaches the channel. Full resolver re-observation stays with
 *     the registered host-lifecycle invalidation ticket (ADR-0284/0286).
 *  3. only then the channel call, through the narrow SessionSendOutcome surface the product
 *     already speaks. Results normalize to: accepted -> receipt (detail carries the channel
 *     identity), deferred -> receipt (detail carries the held item), a determinate channel
 *     refusal -> refused with the channel's own code, and everything uncertain ->
 *     outcome-unknown. No retry happens here; the renderer's no-retry rule for
 *     protected-effect-outcome-unknown stays intact.
 *
 *  v1 writes no domain closure events (turn-close flow is the registered follow-up ticket); a
 *  channel failure never replays the append.
 */
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import type { SessionSendOutcome } from '../appservice/contracts.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import { verifyAdmittedFactsStillHold, type SessionPromptReverifyReads } from './session-prompt-reverify.js'

export type SessionSendPort = (
  request: {
    readonly matterRef: string
    readonly workspaceRoot: string
    readonly text: string
    readonly mode?: 'queue' | 'steer'
    /** ADR-0296 D5: the caller-minted channel request id (the host log's `source.rpcId`). */
    readonly requestId?: string
  },
) => Promise<SessionSendOutcome>

/** ADR-0296 D5: the channel request id is DERIVED from the attempt identity (service-issued,
 *  unique per attempt) — no second identity to mint, persist or reconcile against. The host
 *  session log's `source.rpcId` can be re-derived from the matter record at any time. */
export function sessionRequestIdForAttempt(attemptId: string): string {
  return `req-${attemptId.replace(/^attempt:/u, '')}`
}

export interface SessionPromptDispatchOptions extends SessionPromptReverifyReads {
  /** The real channel adapter — the product's existing session-send port. */
  readonly sessionSend: SessionSendPort
  /** ADR-0296 D4: the durable note for an outcome-unknown dispatch (best-effort, never throws). */
  readonly recordDispatchUnknown: (request: {
    readonly matterRef: string
    readonly attemptId: string
  }) => Promise<void>
  /** The same cheap real ports the admission chain ran; re-invoked at this instant. */
  readonly resolveTarget: NonNullable<ProtectedEffectAdmissionPorts['resolveTarget']>
  readonly resolveRegistry: NonNullable<ProtectedEffectAdmissionPorts['resolveRegistry']>
  readonly preflight: NonNullable<ProtectedEffectAdmissionPorts['preflight']>
  /** The matter's trusted workspace path (default link), or undefined while unresolvable. */
  readonly readWorkspaceRoot: (matterRef: string) => string | undefined
}

export function createSessionPromptDispatchPort(
  options: SessionPromptDispatchOptions,
): NonNullable<ProtectedEffectAdmissionPorts['dispatch']> {
  return async ({ intent, context, target, compatibility, registry, preflight: admittedPreflight }) => {
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'not-dispatched' }
    if (intent.operation !== 'session.send') return { state: 'not-dispatched' }

    const evidence = compatibility.evidence
    if (evidence === undefined || typeof evidence.revisionDigest !== 'string') return { state: 'not-dispatched' }
    // ADR-0296 D5: the attempt identity rides the admitted evidence; without it no request id
    // can be derived and the channel call stays not-dispatched (the effect provably did not run).
    if (typeof evidence.attemptId !== 'string' || evidence.attemptId === '') return { state: 'not-dispatched' }

    const text = intent.payload.text
    if (typeof text !== 'string' || text.length === 0 || text.length > 16_384) return { state: 'not-dispatched' }
    const mode = intent.payload.mode
    if (mode !== undefined && mode !== 'queue' && mode !== 'steer') return { state: 'not-dispatched' }

    // Every pre-call guard answers not-dispatched: the effect provably did not run, so the
    // kernel maps it back to the retryable admission-unavailable — never outcome-unknown.
    const reverified = verifyAdmittedFactsStillHold(options, { context, revisionDigest: evidence.revisionDigest })
    if (!reverified.ok) return { state: 'not-dispatched' }

    // The cheap real ports re-run for this instant; ref equality is the freshness test.
    const reTarget = await options.resolveTarget({ intent } as never)
    if (reTarget.state !== 'allowed' || reTarget.value.targetRef !== target.targetRef) return { state: 'not-dispatched' }
    const reRegistry = await options.resolveRegistry({ intent } as never)
    if (reRegistry.state !== 'allowed' || reRegistry.value.mappingRef !== registry.mappingRef) return { state: 'not-dispatched' }
    const rePreflight = await options.preflight({ intent, target, registry } as never)
    if (rePreflight.state !== 'allowed' || rePreflight.value.preflightRef !== admittedPreflight.preflightRef) {
      return { state: 'not-dispatched' }
    }

    const workspaceRoot = options.readWorkspaceRoot(context.matterRef)
    if (workspaceRoot === undefined) return { state: 'not-dispatched' }

    let outcome: SessionSendOutcome
    try {
      outcome = await options.sessionSend({
        matterRef: context.matterRef,
        workspaceRoot,
        text,
        ...(mode === undefined ? {} : { mode }),
        requestId: sessionRequestIdForAttempt(evidence.attemptId),
      })
    } catch {
      // ADR-0296 D4: the unknown is durable before it is answered — best-effort note, then the
      // same outcome the product already speaks.
      await options.recordDispatchUnknown({ matterRef: context.matterRef, attemptId: evidence.attemptId })
      return { state: 'outcome-unknown' }
    }

    if (outcome.state === 'accepted') {
      return {
        state: 'receipt',
        receiptRef: `receipt:session-send:${outcome.requestId}`,
        detail: {
          kind: 'session-send-accepted',
          sessionId: outcome.sessionId,
          requestId: outcome.requestId,
          mode: outcome.mode,
        },
      }
    }
    if (outcome.state === 'deferred') {
      return {
        state: 'receipt',
        receiptRef: `receipt:session-send-deferred:${outcome.itemId}`,
        detail: { kind: 'session-send-deferred', itemId: outcome.itemId },
      }
    }
    return { state: 'refused', code: outcome.code }
  }
}
