/** ADR-0293 (alternative C): the send-path reconcile fallback.
 *
 *  The observer runner (`session-turn-close.ts`) only closes an attempt when it observes a
 *  terminal turn end. If it never runs (crash, missed edge), the stuck active attempt keeps
 *  blocking every further send with the honest `active-attempt` refusal. This fallback rides
 *  the next send itself: before that send's admission it re-reads the SESSION fold, and when
 *  the fold says the turn already ended while the channel is idle, it reuses the same
 *  `createSessionTurnClose` runner — so the idempotent appendId and the blocked/unknown-stays-open
 *  semantics are inherited verbatim, never reimplemented.
 *
 *  Guards, in order:
 *  - no active attempt -> no-op (the normal case; not even a channel read);
 *  - fold not `read` or no `lastTurnEnd` -> nothing observed to reconcile on;
 *  - `execution === 'executing'` -> the turn is still running; never interrupt it.
 *
 *  It never throws: this is a best-effort pre-send step on the user-facing send path. A failed
 *  reconcile leaves the attempt as-is, and the downstream active-attempt refusal remains the
 *  truthful answer.
 */
import { projectBusinessMatter } from '../domain/business-matter.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'
import type { SessionTurnClose } from './session-turn-close.js'

export type SessionSendReconcile = (request: { readonly matterRef: string }) => Promise<void>

/** The one fold slice the reconcile consumes. `SessionChannelStatus` satisfies it structurally. */
export interface SessionSendReconcileFold {
  readonly state: 'read' | 'no-session' | 'unavailable'
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
}

export interface SessionSendReconcileOptions {
  readonly attempts: SessionPromptAttemptStorePort
  readonly readChannel: (matterRef: string) => Promise<SessionSendReconcileFold>
  readonly close: SessionTurnClose
}

export function createSessionSendReconcile(options: SessionSendReconcileOptions): SessionSendReconcile {
  return async ({ matterRef }) => {
    try {
      const readMatter = options.attempts.readMatter(matterRef)
      if (readMatter === undefined || 'denied' in readMatter) return
      let attemptActive: boolean
      try {
        attemptActive = projectBusinessMatter(readMatter.matter).activeAttemptId !== undefined
      } catch {
        return
      }
      if (!attemptActive) return

      const fold = await options.readChannel(matterRef)
      if (fold.state !== 'read' || fold.lastTurnEnd === null) return
      // A still-running turn owns the open attempt; closing it here would be an interruption.
      if (fold.execution === 'executing') return
      await options.close({ matterRef, endKind: fold.lastTurnEnd })
    } catch {
      // Best-effort pre-send step: never block or fail the send itself.
    }
  }
}
