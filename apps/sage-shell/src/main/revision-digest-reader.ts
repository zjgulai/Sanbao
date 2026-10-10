/** WT-02C.2C.6: expose the store-validated committed digest of one revision to the compatibility
 *  evidence chain (step 6, ADR-0284), as a main-owned read-only reader over the authoritative
 *  BusinessMatter event store. The store already owns the digest semantics (the revision-entered
 *  event's `event_digest`, see `readRevisionDigest` in business-matter-event-store.ts); this
 *  module only adapts it to the frozen port shape and adds no caching, no fallback and no
 *  second digest definition. A missing matter/revision stays `undefined`; store-side errors keep
 *  the store's own thrown semantics.
 */
import type { BusinessMatterEventStore } from '../persistence/business-matter-event-store.js'

export interface RevisionDigestReader {
  readonly revisionDigest: (matterId: string, revisionId: string) => string | undefined
}

export function createRevisionDigestReader({ store }: {
  readonly store: BusinessMatterEventStore
}): RevisionDigestReader {
  return {
    revisionDigest: (matterId: string, revisionId: string): string | undefined =>
      store.readRevisionDigest(matterId, revisionId),
  }
}
