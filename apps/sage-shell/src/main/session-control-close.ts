/** B batch stage 4 (ADR-0317 D4): the synchronous closure for a control-scope attempt.
 *
 *  Control operations (approval answer/withdraw, pending edit/remove, queue edit/remove)
 *  conclude inside their own request — no turn runs afterwards, so the turn-end closure
 *  (ADR-0293) can never adjudicate their attempt. Without a closure the attempt would stay
 *  open forever and the one-open-attempt domain invariant would lock the matter for every
 *  later attempt. This recorder appends the closure the dispatch outcome proves:
 *
 *  - a dispatched receipt -> `attempt-succeeded` (the light closure shape turn-close uses);
 *  - a determinate handler refusal -> `attempt-failed` (the effect provably did not run);
 *  - outcome-unknown writes nothing here — it keeps the existing dispatch-unknown marker
 *    (ADR-0296 D4) and the attempt stays open, fail-closed, until the per-op reconcile
 *    (registered follow-up) adjudicates it.
 *
 *  Best-effort by design, mirroring the unknown marker: a failed closure write leaves the
 *  attempt open (fail-closed) — never a fabricated state. Idempotent per attempt: the event
 *  ids are the same `attempt-succeeded:<attemptId>` / `attempt-failed:<attemptId>` the
 *  turn-end closure uses, so a duplicate writer can never double-close.
 */
import { failAttempt, succeedAttempt } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'

export type SessionControlCloseOutcome =
  | { readonly state: 'succeeded' }
  | { readonly state: 'failed', readonly code: string }

export type SessionControlCloseRecorder = (request: {
  readonly matterRef: string
  readonly attemptId: string
  readonly outcome: SessionControlCloseOutcome
}) => Promise<void>

export interface SessionControlCloseRecorderOptions {
  readonly attempts: SessionPromptAttemptStorePort
  readonly now: () => string
}

export function createSessionControlCloseRecorder(
  options: SessionControlCloseRecorderOptions,
): SessionControlCloseRecorder {
  return async ({ matterRef, attemptId, outcome }) => {
    try {
      const readMatter = options.attempts.readMatter(matterRef)
      if (readMatter === undefined || 'denied' in readMatter) return
      const occurredAt = options.now()
      const next = outcome.state === 'succeeded'
        ? succeedAttempt(readMatter.matter, {
            eventId: `attempt-succeeded:${attemptId}`,
            occurredAt,
            attemptId,
          })
        : failAttempt(readMatter.matter, {
            eventId: `attempt-failed:${attemptId}`,
            occurredAt,
            attemptId,
            source: 'other',
            reason: `控制操作被拒：${outcome.code}`,
            impact: '本次控制操作未生效；事项状态未变更。',
          })
      const events = encodeBusinessMatterEvents(next).slice(readMatter.matter.events.length).map((event) => ({
        matterId: event.matterId,
        eventId: event.eventId,
        eventType: event.eventType,
        eventSchemaVersion: event.eventSchemaVersion,
        occurredAt: event.occurredAt,
        payloadBytes: event.payloadBytes.slice(),
      }))
      if (events.length === 0) return
      options.attempts.appendRevision({
        matterId: matterRef,
        expectedVersion: { kind: 'exact', value: readMatter.version },
        appendId: outcome.state === 'succeeded'
          ? `attempt-succeeded:${attemptId}`
          : `attempt-failed:${attemptId}`,
        events,
      })
    } catch {
      // Best-effort: the attempt stays open (fail-closed); nothing is fabricated either way.
    }
  }
}
