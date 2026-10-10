/** ADR-0293: turn-end closure of the session-family attempt.
 *
 *  A real send leaves the attempt active (persist starts it; dispatch v1 writes no closure).
 *  Without closure the matter is single-shot: the next send fails closed on `active-attempt`.
 *  This main-owned runner closes the attempt when the SESSION fold reports a terminal turn end —
 *  the observable fact the fold already produces.
 *
 *  Closure styles are deliberately split by governance weight:
 *  - `completed` -> `attempt-succeeded`: the light terminal event (this ADR). No artifact and no
 *    receipt ride a normal turn; the matter returns to `evidence`, ready for the next attempt in
 *    the same revision. The artifact/receipt review path stays available for matters that need
 *    it (human verdict), untouched.
 *  - `error` / `max-tokens` / `aborted` -> the existing `attempt-failed` (source `runtime`); the
 *    matter enters `failed-retry`, whose re-entry ceremony already exists.
 *  - `blocked` and unknown kinds: the attempt stays open (no honest terminal meaning yet;
 *    registered as an adjudication item in ADR-0293).
 *
 *  The runner is observation-driven and idempotent: the appendId binds
 *  `turn-close:<attemptId>:<kind>` and a second observation of the same edge finds no active
 *  attempt and returns. It never throws to its caller — the observer path is fire-and-forget.
 */
import { failAttempt, projectBusinessMatter, succeedAttempt } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'

export type SessionTurnClose = (request: {
  readonly matterRef: string
  readonly endKind: string
}) => Promise<void>

export interface SessionTurnCloseOptions {
  readonly attempts: SessionPromptAttemptStorePort
  readonly now: () => string
}

const SUCCESS_KINDS = new Set(['completed'])
const FAILURE_KINDS = new Set(['error', 'max-tokens', 'aborted'])

export function createSessionTurnClose(options: SessionTurnCloseOptions): SessionTurnClose {
  return async ({ matterRef, endKind }) => {
    if (!SUCCESS_KINDS.has(endKind) && !FAILURE_KINDS.has(endKind)) return

    const readMatter = options.attempts.readMatter(matterRef)
    if (readMatter === undefined || 'denied' in readMatter) return
    let attemptId: string | undefined
    try {
      attemptId = projectBusinessMatter(readMatter.matter).activeAttemptId
    } catch {
      return
    }
    if (attemptId === undefined) return

    const occurredAt = options.now()
    let next
    try {
      next = SUCCESS_KINDS.has(endKind)
        ? succeedAttempt(readMatter.matter, {
            eventId: `attempt-succeeded:${attemptId}`,
            occurredAt,
            attemptId,
          })
        : failAttempt(readMatter.matter, {
            eventId: `attempt-failed:${attemptId}`,
            occurredAt,
            attemptId,
            source: 'runtime',
            reason: `回合终态：${endKind}`,
            impact: '本次回合未完成；同一事项的再次发送需先重新确认修订。',
          })
    } catch {
      return
    }

    const events = encodeBusinessMatterEvents(next).slice(readMatter.matter.events.length).map((event) => ({
      matterId: event.matterId,
      eventId: event.eventId,
      eventType: event.eventType,
      eventSchemaVersion: event.eventSchemaVersion,
      occurredAt: event.occurredAt,
      payloadBytes: event.payloadBytes.slice(),
    }))
    if (events.length === 0) return

    try {
      options.attempts.appendRevision({
        matterId: matterRef,
        expectedVersion: { kind: 'exact', value: readMatter.version },
        appendId: `turn-close:${attemptId}:${endKind}`,
        events,
      })
    } catch {
      // Fire-and-forget observer path: a failed close leaves the attempt active, which the
      // next send surfaces as the honest active-attempt refusal.
    }
  }
}
