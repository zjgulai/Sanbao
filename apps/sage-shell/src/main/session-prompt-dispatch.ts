/** T05-mid step 10 (ADR-0289): the dispatch step — the only place the admitted chain may call
 *  the real session effect. B batch stage 3 (ADR-0317 D4): the step now serves all seven
 *  registered session-control operations, not just `session.send`.
 *
 *  Order of operations (application-service-boundary item 10):
 *  1. the per-operation cheap guards (payload shape, handler presence) — every answer here is
 *     not-dispatched: the effect provably did not run, so the kernel maps it back to the
 *     retryable admission-unavailable;
 *  2. the shared step-9/10 re-verification (context / identity session / frame / store-validated
 *     revision digest / current revision / live runtime-effective observation);
 *  3. the cheap real ports re-run for this instant: target, registry and preflight are invoked
 *     again and their refs must equal the admitted ones — a moved target, mapping or roster
 *     answers stale before anything reaches a handler. Full resolver re-observation stays with
 *     the registered host-lifecycle invalidation ticket (ADR-0284/0286).
 *  4. only then the real handler call. Results normalize to: a determinate success -> receipt
 *     (detail carries the exact route-facing facts), a determinate refusal -> refused with the
 *     handler's own code, and everything uncertain -> outcome-unknown. No retry happens here;
 *     the renderer's no-retry rule for protected-effect-outcome-unknown stays intact.
 *
 *  v1 writes no domain closure events (turn-close flow is the registered follow-up ticket); a
 *  handler failure never replays the append.
 */
import type { ProtectedEffectAdmissionPorts } from '../appservice/protected-effect-admission.js'
import type { ApprovalAnswerOutcome, ApprovalWithdrawOutcome, QueueItemOutcome, SessionSendOutcome } from '../appservice/contracts.js'
import { ACTION_AUTHORITY_TABLE } from './action-authority-table.js'
import type { SessionControlCloseOutcome, SessionControlCloseRecorder } from './session-control-close.js'
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

/** B batch stage 3: the six session-control handlers, each the product's own real implementation.
 *  Every port is optional: a missing handler keeps exactly its own operation not-dispatched. */
export type ApprovalAnswerPort = (request: {
  readonly matterRef: string
  readonly requestId: string
  readonly outcome: 'allowed-once' | 'rejected'
}) => Promise<ApprovalAnswerOutcome>

export type ApprovalWithdrawPort = (request: {
  readonly matterRef: string
  readonly requestId: string
}) => Promise<ApprovalWithdrawOutcome>

export type PendingUpdatePort = (
  request: { readonly action: 'edit', readonly itemId: string, readonly text: string }
  | { readonly action: 'remove', readonly itemId: string },
  matterRef: string,
) => { readonly ok: boolean, readonly code?: string }

export type QueueItemUpdatePort = (
  request: { readonly action: 'edit', readonly itemId: string, readonly text: string }
  | { readonly action: 'remove', readonly itemId: string },
) => QueueItemOutcome | Promise<QueueItemOutcome>

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
  /** B batch (ADR-0317 D4): the six session-control handlers (see the port types above). */
  readonly approvalAnswer?: ApprovalAnswerPort
  readonly approvalWithdraw?: ApprovalWithdrawPort
  readonly pendingUpdate?: PendingUpdatePort
  readonly queueItemUpdate?: QueueItemUpdatePort
  /** B batch stage 4 (ADR-0317 D4): the synchronous attempt closure for a control outcome. */
  readonly recordControlClosed?: SessionControlCloseRecorder
}

/** The same upper bound every real text handler enforces (session-channel / pending-inputs).
 *  A longer text answers not-dispatched instead of letting a store silently truncate. */
const MAX_TEXT = 16_384

function isRefString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4096
}

/** The per-operation guards, evaluated before any re-verification cost. Returns the validated
 *  facts or undefined: every undefined answer becomes not-dispatched at the call site. */
type PreparedDispatch =
  | { readonly op: 'session.send', readonly text: string, readonly mode: 'queue' | 'steer' | undefined }
  | { readonly op: 'session.approval.answer', readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }
  | { readonly op: 'session.approval.withdraw', readonly requestId: string }
  | { readonly op: 'session.pending.edit', readonly itemId: string, readonly text: string }
  | { readonly op: 'session.pending.remove', readonly itemId: string }
  | { readonly op: 'session.queue.edit', readonly itemId: string, readonly text: string }
  | { readonly op: 'session.queue.remove', readonly itemId: string }

function prepareDispatch(
  operation: string,
  payload: Readonly<Record<string, unknown>>,
): PreparedDispatch | undefined {
  switch (operation) {
    case 'session.send': {
      const text = payload.text
      if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) return undefined
      const mode = payload.mode
      if (mode !== undefined && mode !== 'queue' && mode !== 'steer') return undefined
      return { op: 'session.send', text, mode }
    }
    case 'session.approval.answer': {
      const requestId = payload.requestId
      if (!isRefString(requestId)) return undefined
      const outcome = payload.outcome
      if (outcome !== 'allowed-once' && outcome !== 'rejected') return undefined
      return { op: 'session.approval.answer', requestId, outcome }
    }
    case 'session.approval.withdraw': {
      const requestId = payload.requestId
      if (!isRefString(requestId)) return undefined
      return { op: 'session.approval.withdraw', requestId }
    }
    case 'session.pending.edit':
    case 'session.queue.edit': {
      const itemId = payload.itemId
      if (!isRefString(itemId)) return undefined
      const text = payload.text
      if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TEXT) return undefined
      return operation === 'session.pending.edit'
        ? { op: 'session.pending.edit', itemId, text }
        : { op: 'session.queue.edit', itemId, text }
    }
    case 'session.pending.remove':
    case 'session.queue.remove': {
      const itemId = payload.itemId
      if (!isRefString(itemId)) return undefined
      return operation === 'session.pending.remove'
        ? { op: 'session.pending.remove', itemId }
        : { op: 'session.queue.remove', itemId }
    }
    default:
      return undefined
  }
}

export function createSessionPromptDispatchPort(
  options: SessionPromptDispatchOptions,
): NonNullable<ProtectedEffectAdmissionPorts['dispatch']> {
  return async ({ intent, context, target, compatibility, registry, preflight: admittedPreflight }) => {
    if (ACTION_AUTHORITY_TABLE[intent.operation] === undefined) return { state: 'not-dispatched' }

    const evidence = compatibility.evidence
    if (evidence === undefined || typeof evidence.revisionDigest !== 'string') return { state: 'not-dispatched' }
    // ADR-0296 D5: the attempt identity rides the admitted evidence; without it no request id
    // can be derived and the channel call stays not-dispatched (the effect provably did not run).
    if (typeof evidence.attemptId !== 'string' || evidence.attemptId === '') return { state: 'not-dispatched' }

    const prepared = prepareDispatch(intent.operation, intent.payload)
    if (prepared === undefined) return { state: 'not-dispatched' }

    // Handler presence is a cheap guard too: an unwired operation stays not-dispatched.
    if (prepared.op === 'session.approval.answer' && options.approvalAnswer === undefined) return { state: 'not-dispatched' }
    if (prepared.op === 'session.approval.withdraw' && options.approvalWithdraw === undefined) return { state: 'not-dispatched' }
    if ((prepared.op === 'session.pending.edit' || prepared.op === 'session.pending.remove') && options.pendingUpdate === undefined) {
      return { state: 'not-dispatched' }
    }
    if ((prepared.op === 'session.queue.edit' || prepared.op === 'session.queue.remove') && options.queueItemUpdate === undefined) {
      return { state: 'not-dispatched' }
    }

    // Every remaining guard below still answers not-dispatched: the effect provably did not run,
    // so the kernel maps it back to the retryable admission-unavailable — never outcome-unknown.
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

    // ADR-0296 D4: the unknown is durable before it is answered — best-effort note, then the
    // same outcome the product already speaks. B batch stage 4 (ADR-0317 D4): a control
    // operation completes inside this request — its attempt closes durably with the outcome
    // (receipt -> succeeded, determinate refusal -> failed, unknown -> the existing marker,
    // attempt left open fail-closed). Both recorders are best-effort and never throw.
    const answerUnknown = async (): Promise<{ state: 'outcome-unknown' }> => {
      await options.recordDispatchUnknown({ matterRef: context.matterRef, attemptId: evidence.attemptId })
      return { state: 'outcome-unknown' }
    }
    const closeControl = async (closeOutcome: SessionControlCloseOutcome): Promise<void> => {
      await options.recordControlClosed?.({ matterRef: context.matterRef, attemptId: evidence.attemptId, outcome: closeOutcome })
    }

    if (prepared.op === 'session.send') {
      const workspaceRoot = options.readWorkspaceRoot(context.matterRef)
      if (workspaceRoot === undefined) return { state: 'not-dispatched' }

      let outcome: SessionSendOutcome
      try {
        outcome = await options.sessionSend({
          matterRef: context.matterRef,
          workspaceRoot,
          text: prepared.text,
          ...(prepared.mode === undefined ? {} : { mode: prepared.mode }),
          requestId: sessionRequestIdForAttempt(evidence.attemptId),
        })
      } catch {
        return answerUnknown()
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

    if (prepared.op === 'session.approval.answer') {
      const handler = options.approvalAnswer
      if (handler === undefined) return { state: 'not-dispatched' }
      let outcome: ApprovalAnswerOutcome
      try {
        outcome = await handler({ matterRef: context.matterRef, requestId: prepared.requestId, outcome: prepared.outcome })
      } catch {
        return answerUnknown()
      }
      if (outcome.state === 'recorded') {
        await closeControl({ state: 'succeeded' })
        return {
          state: 'receipt',
          receiptRef: `receipt:session-approval-answer:${prepared.requestId}`,
          detail: { kind: 'approval-answer-recorded', requestId: prepared.requestId, receipt: outcome.receipt },
        }
      }
      await closeControl({ state: 'failed', code: outcome.code })
      return { state: 'refused', code: outcome.code }
    }

    if (prepared.op === 'session.approval.withdraw') {
      const handler = options.approvalWithdraw
      if (handler === undefined) return { state: 'not-dispatched' }
      let outcome: ApprovalWithdrawOutcome
      try {
        outcome = await handler({ matterRef: context.matterRef, requestId: prepared.requestId })
      } catch {
        return answerUnknown()
      }
      if (outcome.state === 'recorded') {
        await closeControl({ state: 'succeeded' })
        return {
          state: 'receipt',
          receiptRef: `receipt:session-approval-withdraw:${prepared.requestId}`,
          detail: { kind: 'approval-withdraw-recorded', requestId: prepared.requestId, receipt: outcome.receipt },
        }
      }
      await closeControl({ state: 'failed', code: outcome.code })
      return { state: 'refused', code: outcome.code }
    }

    if (prepared.op === 'session.pending.edit' || prepared.op === 'session.pending.remove') {
      const handler = options.pendingUpdate
      if (handler === undefined) return { state: 'not-dispatched' }
      let result: { readonly ok: boolean, readonly code?: string }
      try {
        result = handler(
          prepared.op === 'session.pending.edit'
            ? { action: 'edit', itemId: prepared.itemId, text: prepared.text }
            : { action: 'remove', itemId: prepared.itemId },
          context.matterRef,
        )
      } catch {
        return answerUnknown()
      }
      if (result.ok) {
        await closeControl({ state: 'succeeded' })
        return {
          state: 'receipt',
          receiptRef: `receipt:${prepared.op === 'session.pending.edit' ? 'session-pending-edit' : 'session-pending-remove'}:${prepared.itemId}`,
          detail: prepared.op === 'session.pending.edit'
            ? { kind: 'pending-edited', itemId: prepared.itemId }
            : { kind: 'pending-removed', itemId: prepared.itemId },
        }
      }
      // The store answered a determinate refusal; a code-less refusal keeps its own stable name.
      const code = result.code ?? 'session-pending-update-refused'
      await closeControl({ state: 'failed', code })
      return { state: 'refused', code }
    }

    const handler = options.queueItemUpdate
    if (handler === undefined) return { state: 'not-dispatched' }
    let outcome: QueueItemOutcome
    try {
      outcome = await handler(prepared.op === 'session.queue.edit'
        ? { action: 'edit', itemId: prepared.itemId, text: prepared.text }
        : { action: 'remove', itemId: prepared.itemId })
    } catch {
      return answerUnknown()
    }
    if (outcome.state === 'ok') {
      await closeControl({ state: 'succeeded' })
      return {
        state: 'receipt',
        receiptRef: `receipt:${prepared.op === 'session.queue.edit' ? 'session-queue-edit' : 'session-queue-remove'}:${prepared.itemId}`,
        detail: prepared.op === 'session.queue.edit'
          ? { kind: 'queue-edited', itemId: prepared.itemId }
          : { kind: 'queue-removed', itemId: prepared.itemId },
      }
    }
    await closeControl({ state: 'failed', code: outcome.code })
    return { state: 'refused', code: outcome.code }
  }
}
