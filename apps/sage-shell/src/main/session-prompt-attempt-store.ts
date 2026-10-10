/** ADR-0288: the persist step's store handle over the Sage-owned matter event store.
 *
 *  Mirrors the matter-rehydrate port's shape: it opens lazily, fails closed on every uncertain
 *  load (an unopenable store is a missing provider, never an empty history), and exposes only
 *  what the persist step needs — the strict rehydrate (domain matter + current-ness + stream
 *  version), the store-validated revision digest, and the atomic append that carries the
 *  compatibility evaluation evidence in the same transaction as the attempt event.
 */
import type { SagePaths } from '../profile/paths.js'
import { projectBusinessMatter, type BusinessMatter } from '../domain/business-matter.js'
import {
  openBusinessMatterEventStore,
  type BusinessMatterAppendResult,
  type BusinessMatterEventStore,
  type EncodedNewBusinessMatterEvent,
  type ExpectedVersion,
} from '../persistence/business-matter-event-store.js'
import type { CompatibilityEvaluationEvidencePersistenceInputV1 } from '../persistence/compatibility-evaluation-evidence-store.js'
import {
  MATTER_STORE_BUSY_TIMEOUT_MS,
  MATTER_STORE_MAX_PAYLOAD_BYTES,
  MATTER_STORE_MAX_STREAM_EVENTS,
} from './matter-rehydrate-port.js'

export type SessionPromptAttemptRehydrate =
  | { readonly matter: BusinessMatter; readonly current: boolean; readonly version: number }
  | { readonly denied: 'not-found' | 'stale-revision' }
  | undefined

export interface SessionPromptAttemptStorePort {
  readonly strictRehydrate: (request: {
    readonly matterId: string
    readonly revisionId: string
  }) => SessionPromptAttemptRehydrate
  readonly revisionDigest: (matterId: string, revisionId: string) => string | undefined
  readonly appendAttempt: (request: {
    readonly matterId: string
    readonly expectedVersion: ExpectedVersion
    readonly appendId: string
    readonly events: readonly EncodedNewBusinessMatterEvent[]
    readonly evidence: CompatibilityEvaluationEvidencePersistenceInputV1
  }) => BusinessMatterAppendResult
  close(): void
}

export interface SessionPromptAttemptStoreOptions {
  readonly sagePaths: SagePaths
  readonly clock?: () => string
}

export function createSessionPromptAttemptStore(
  options: SessionPromptAttemptStoreOptions,
): SessionPromptAttemptStorePort {
  let store: BusinessMatterEventStore | undefined
  let closed = false

  const opened = (): BusinessMatterEventStore | undefined => {
    if (closed) return undefined
    if (store !== undefined) return store
    try {
      store = openBusinessMatterEventStore({
        sagePaths: options.sagePaths,
        maxStreamEvents: MATTER_STORE_MAX_STREAM_EVENTS,
        maxPayloadBytes: MATTER_STORE_MAX_PAYLOAD_BYTES,
        busyTimeoutMs: MATTER_STORE_BUSY_TIMEOUT_MS,
        clock: options.clock ?? (() => new Date().toISOString()),
      })
      return store
    } catch {
      return undefined
    }
  }

  return {
    strictRehydrate: (request) => {
      const database = opened()
      if (database === undefined) return undefined
      let loaded
      try {
        loaded = database.load(request.matterId)
      } catch {
        return undefined
      }
      if (loaded.kind === 'not-found') return { denied: 'not-found' }
      if (loaded.kind === 'blocked') return undefined
      try {
        const currentRevisionId = projectBusinessMatter(loaded.matter).currentRevisionId
        return {
          matter: loaded.matter,
          current: currentRevisionId === request.revisionId,
          version: loaded.version,
        }
      } catch {
        return undefined
      }
    },
    revisionDigest: (matterId, revisionId) => {
      const database = opened()
      if (database === undefined) return undefined
      try {
        return database.readRevisionDigest(matterId, revisionId)
      } catch {
        return undefined
      }
    },
    appendAttempt: (request) => {
      const database = opened()
      if (database === undefined) {
        return { kind: 'blocked', reason: 'io-unavailable' }
      }
      return database.appendWithCompatibilityEvidence({
        matterId: request.matterId,
        expectedVersion: request.expectedVersion,
        appendId: request.appendId,
        events: request.events,
      }, request.evidence)
    },
    close: () => {
      closed = true
      store?.close()
      store = undefined
    },
  }
}
