/** Step-3 rehydrate port over the Sage-owned matter event store.
 *
 * The store itself (SQLite, append-only, digest-chained) lived in the repo without a production
 * consumer until this wiring: nothing in `src/` imported it (P-04). This adapter is the only
 * place that turns a stored stream into the pipeline's step-3 answer, and it fails closed on
 * every uncertain load: a store that cannot be opened, a blocked stream, or a stream the domain
 * kernel refuses are all reported as "provider unavailable" (`undefined`), which the pipeline
 * already maps to a retryable denial at the rehydrate stage.
 */
import { projectBusinessMatter, type BusinessMatter } from '../domain/business-matter.js'
import {
  openBusinessMatterEventStore,
  type BusinessMatterEventStore,
} from '../persistence/business-matter-event-store.js'
import type { SagePaths } from '../profile/paths.js'

/** Production limits. The store ships no defaults on purpose (see the store's own architecture
 *  note), so these are chosen here and reviewed as part of the wiring:
 *  - `maxStreamEvents` 4096: one matter stream is a bounded work history, not a log sink.
 *  - `maxPayloadBytes` 1 MiB: parity with the host control-payload ceiling, so a stored event can
 *    always be carried across the same boundary the shell already enforces.
 *  - `busyTimeoutMs` 2000: long enough for a concurrent committing process, short enough that a
 *    stalled reader still fails inside one user-visible request. */
export const MATTER_STORE_MAX_STREAM_EVENTS = 4096
export const MATTER_STORE_MAX_PAYLOAD_BYTES = 1024 * 1024
export const MATTER_STORE_BUSY_TIMEOUT_MS = 2000

export type StrictRehydratePort = (req: { readonly matterId: string; readonly revisionId: string }) =>
  | { readonly matter: BusinessMatter; readonly current: boolean }
  | { readonly denied: 'not-found' | 'stale-revision' }
  | undefined

export interface MatterRehydratePortOptions {
  readonly sagePaths: SagePaths
  readonly maxStreamEvents?: number
  readonly maxPayloadBytes?: number
  readonly busyTimeoutMs?: number
  readonly clock?: () => string
}

export interface MatterRehydratePort {
  readonly strictRehydrate: StrictRehydratePort
  /** Stop serving and release the database handle; later calls fail closed. */
  close(): void
}

export function createMatterRehydratePort(options: MatterRehydratePortOptions): MatterRehydratePort {
  let store: BusinessMatterEventStore | undefined
  let closed = false

  const opened = (): BusinessMatterEventStore | undefined => {
    if (closed) return undefined
    if (store !== undefined) return store
    try {
      store = openBusinessMatterEventStore({
        sagePaths: options.sagePaths,
        maxStreamEvents: options.maxStreamEvents ?? MATTER_STORE_MAX_STREAM_EVENTS,
        maxPayloadBytes: options.maxPayloadBytes ?? MATTER_STORE_MAX_PAYLOAD_BYTES,
        busyTimeoutMs: options.busyTimeoutMs ?? MATTER_STORE_BUSY_TIMEOUT_MS,
        clock: options.clock ?? (() => new Date().toISOString()),
      })
      return store
    } catch {
      // An unopenable store is a missing provider, never an empty history.
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
      let currentRevisionId: string | undefined
      try {
        currentRevisionId = projectBusinessMatter(loaded.matter).currentRevisionId
      } catch {
        return undefined
      }
      return { matter: loaded.matter, current: currentRevisionId === request.revisionId }
    },
    close: () => {
      closed = true
      store?.close()
      store = undefined
    },
  }
}
