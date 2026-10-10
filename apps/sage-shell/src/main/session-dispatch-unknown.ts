/** ADR-0296 D4: the durable note for a dispatch whose outcome is unknown.
 *
 *  The dispatch step catches a thrown channel call and answers `outcome-unknown` — the effect
 *  may or may not have run, and the renderer's no-retry rule stands (ADR-0289). This recorder
 *  appends the domain marker `attempt-dispatch-unknown` so the matter record itself carries the
 *  fact (distinguishable from a normal in-flight attempt at reconciliation time). It is a note
 *  only: no status change, no closure, no ceremony.
 *
 *  Best-effort by design, mirroring the turn-close observer: a failed marker write leaves the
 *  unknown outcome exactly as honest as before (an unmarked active attempt), which the next
 *  reconciliation still treats conservatively. It never throws to its caller.
 *
 *  The marker append is idempotent per attempt (`attempt-unknown:<attemptId>`); the domain
 *  kernel authors the payload and refuses any attempt that is not the active running one.
 */
import { markDispatchUnknown } from '../domain/business-matter.js'
import { encodeBusinessMatterEvents } from '../domain/business-matter-codec.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'

export type SessionDispatchUnknownRecorder = (request: {
  readonly matterRef: string
  readonly attemptId: string
}) => Promise<void>

export interface SessionDispatchUnknownRecorderOptions {
  readonly attempts: SessionPromptAttemptStorePort
  readonly now: () => string
}

export function createSessionDispatchUnknownRecorder(
  options: SessionDispatchUnknownRecorderOptions,
): SessionDispatchUnknownRecorder {
  return async ({ matterRef, attemptId }) => {
    try {
      const readMatter = options.attempts.readMatter(matterRef)
      if (readMatter === undefined || 'denied' in readMatter) return
      const next = markDispatchUnknown(readMatter.matter, {
        eventId: `attempt-dispatch-unknown:${attemptId}`,
        occurredAt: options.now(),
        attemptId,
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
        appendId: `attempt-unknown:${attemptId}`,
        events,
      })
    } catch {
      // Best-effort: the unknown outcome is unchanged; the unmarked attempt stays conservative.
    }
  }
}
