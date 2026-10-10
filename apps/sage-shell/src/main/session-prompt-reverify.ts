/** T05-mid steps 9/10 (ADR-0288/0289): the shared pre-write / pre-dispatch re-verification.
 *
 *  Boundary items 9 and 10 demand the same class of check at two instants: the admitted chain
 *  facts must still hold right before the durable write, and again right before the adapter
 *  call. This module is the one home for the cheap, real subset:
 *  context equality, identity session, frame readiness and generation, the store-validated
 *  revision digest, the current revision, and the live runtime-effective observation.
 *  Missing providers answer `unavailable`; moved facts answer `stale`.
 *
 *  Re-running the full resolver against a fresh observation (50–200s) stays with the registered
 *  host-lifecycle invalidation ticket (ADR-0284/0286); step 10 re-invokes the cheap real ports
 *  (target / registry / preflight) separately in the dispatch port.
 */
import { isRuntimeEffectiveObservation, type RuntimeEffectiveObservation } from '../protocol.js'
import type { BusinessMatter } from '../domain/business-matter.js'
import type { SessionPromptAttemptStorePort } from './session-prompt-attempt-store.js'

export interface SessionPromptReverifyReads {
  /** Live context snapshot (sessionRef + matter/revision/generation), or null while absent. */
  readonly readContext: () => {
    readonly sessionRef: string
    readonly matterRef: string
    readonly revisionRef: string
    readonly contextGeneration: number
    readonly frameGeneration: number
  } | null
  readonly readIdentitySession: () => { readonly sessionRef: string } | null
  readonly readFrame: () => { readonly generation: number, readonly ready: boolean, readonly contaminated: boolean } | undefined
  readonly runtimeEffective: () => RuntimeEffectiveObservation | undefined
  readonly attempts: Pick<SessionPromptAttemptStorePort, 'strictRehydrate' | 'revisionDigest'>
}

export type SessionPromptReverifyResult =
  | { readonly ok: true; readonly matter: BusinessMatter; readonly version: number }
  | { readonly ok: false; readonly state: 'unavailable' | 'stale' }

export function verifyAdmittedFactsStillHold(
  reads: SessionPromptReverifyReads,
  admitted: {
    readonly context: {
      readonly sessionRef: string
      readonly matterRef: string
      readonly revisionRef: string
      readonly generation: string
    }
    /** The evidence the chain admitted; its revisionDigest is the store-validated pin. */
    readonly revisionDigest: string
  },
): SessionPromptReverifyResult {
  const liveContext = reads.readContext()
  if (liveContext === null) return { ok: false, state: 'unavailable' }
  if (liveContext.sessionRef !== admitted.context.sessionRef
    || liveContext.matterRef !== admitted.context.matterRef
    || liveContext.revisionRef !== admitted.context.revisionRef
    || liveContext.contextGeneration !== Number(admitted.context.generation)) {
    return { ok: false, state: 'stale' }
  }

  const identitySession = reads.readIdentitySession()
  if (identitySession === null) return { ok: false, state: 'unavailable' }
  if (identitySession.sessionRef !== admitted.context.sessionRef) return { ok: false, state: 'stale' }

  // The same invariant the context step proved: the live snapshot's frame generation and the
  // live frame state must still agree — checked fresh against fresh, not against the admitted
  // context generation (which is a different number, ADR-0289).
  const frame = reads.readFrame()
  if (frame === undefined || !frame.ready || frame.contaminated) return { ok: false, state: 'unavailable' }
  if (frame.generation !== liveContext.frameGeneration) return { ok: false, state: 'stale' }

  let live: unknown
  try {
    live = reads.runtimeEffective()
  } catch {
    return { ok: false, state: 'unavailable' }
  }
  if (live === undefined || !isRuntimeEffectiveObservation(live)) return { ok: false, state: 'unavailable' }
  if (live.kind !== 'observed') return { ok: false, state: 'unavailable' }

  const rehydrated = reads.attempts.strictRehydrate({
    matterId: admitted.context.matterRef,
    revisionId: admitted.context.revisionRef,
  })
  if (rehydrated === undefined) return { ok: false, state: 'unavailable' }
  if ('denied' in rehydrated) return { ok: false, state: 'stale' }
  if (!rehydrated.current) return { ok: false, state: 'stale' }
  const storeRevisionDigest = reads.attempts.revisionDigest(admitted.context.matterRef, admitted.context.revisionRef)
  if (storeRevisionDigest === undefined) return { ok: false, state: 'unavailable' }
  if (storeRevisionDigest !== admitted.revisionDigest) return { ok: false, state: 'stale' }

  return { ok: true, matter: rehydrated.matter, version: rehydrated.version }
}
