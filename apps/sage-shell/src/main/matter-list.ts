/** Ticket 022 (FW-015, US-090~096): the matter list, partitioned by action need — derived here.
 *
 * FW-015 fixed the derivation inputs and the discipline; this module implements them over the
 * facts Sage actually holds today (all local records — nothing fixture):
 *
 * - **attempt** (ticket 003's open creation attempts): `unknown` → 待我处理 ("核对同一请求"),
 *   `failed` → 待我处理 ("修正后可重试"), `pending` → the item is still forming (进行中);
 * - **待继续输入** (ticket 006): pending items waiting for an explicit resume → 待我处理, with the
 *   count as its own trigger;
 * - **待验收 artifact** (ticket 015's observed candidates): an item whose candidate count is above
 *   zero and that has no pending action lands in 待验收 — **count only**, because D-015/016 has not
 *   closed the acceptance semantics;
 * - everything else that has a local record is 进行中.
 *
 * The partitions are a view over one derivation: nothing is stored, and every read re-derives from
 * the stores, so a fact change moves the item — no UI cache pins it (US-093). With the local record
 * gate unreadable the whole list is `unavailable` (US-096), never a fixture stand-in.
 */
import type { MatterListItem, MatterListState, MatterListTrigger, MatterListPartition } from '../appservice/contracts.js'

/** One converted draft's facts (or a draft still forming its matter). */
export interface MatterListDraftFact {
  readonly draftId: string
  readonly matterRef: string | null
  readonly title: string
  readonly attempt: { readonly correlation: string, readonly state: 'pending' | 'unknown' | 'failed' } | null
  readonly updatedAt: string
}

export interface MatterListDeps {
  /** The local record gate: `ready` with facts, or a named reason the list cannot exist. */
  readonly listDraftFacts: () => { readonly state: 'ready', readonly facts: readonly MatterListDraftFact[] } | { readonly state: 'unavailable', readonly code: string }
  /** Pending 待继续 items for one matter (ticket 006's store). */
  readonly pendingCount: (matterRef: string) => number
  /** Observed artifact candidates for one matter (ticket 015's store); count only. */
  readonly acceptanceCandidateCount: (matterRef: string) => number
  /** Ticket 029: the archive store's fact for this matterRef. Absent keeps every item active —
   *  the archive state is presentation membership, never the pause fact or a hide preference. */
  readonly archivedOf?: (matterRef: string) => boolean
}

export interface MatterList {
  readonly derive: () => MatterListState
}

const MAX_PER_PARTITION = 50

function triggersOf(fact: MatterListDraftFact, pending: number): readonly MatterListTrigger[] {
  const triggers: MatterListTrigger[] = []
  if (fact.attempt !== null && fact.attempt.state === 'unknown') {
    triggers.push({ kind: 'attempt-unknown', ref: fact.attempt.correlation })
  }
  if (fact.attempt !== null && fact.attempt.state === 'failed') {
    triggers.push({ kind: 'attempt-failed', ref: fact.attempt.correlation })
  }
  if (pending > 0) {
    triggers.push({ kind: 'pending-inputs', ref: fact.matterRef ?? fact.draftId, count: pending })
  }
  return triggers
}

/** Partition precedence: a pending action outranks a pending acceptance, which outranks plain activity. */
function partitionOf(triggers: readonly MatterListTrigger[], acceptanceCandidates: number): MatterListPartition {
  if (triggers.length > 0) return 'action'
  if (acceptanceCandidates > 0) return 'acceptance'
  return 'in-progress'
}

export function createMatterList(deps: MatterListDeps): MatterList {
  return {
    derive() {
      const gate = deps.listDraftFacts()
      if (gate.state !== 'ready') {
        // unavailable-first (US-096): no records, no rows — the reason is the answer.
        return {
          state: 'unavailable',
          code: gate.code,
          items: [],
          counts: { action: 0, inProgress: 0, acceptance: 0 },
        }
      }
      // One item per matter: several drafts can carry the same matterRef (re-conversions); the
      // newest record is the item, and an open attempt on any of them still triggers.
      const byKey = new Map<string, { fact: MatterListDraftFact, attempt: MatterListDraftFact['attempt'] }>()
      for (const fact of gate.facts) {
        const key = fact.matterRef ?? `draft:${fact.draftId}`
        const existing = byKey.get(key)
        if (existing === undefined) {
          byKey.set(key, { fact, attempt: fact.attempt })
          continue
        }
        if (fact.updatedAt > existing.fact.updatedAt) {
          byKey.set(key, { fact, attempt: fact.attempt ?? existing.attempt })
        } else if (existing.attempt === null && fact.attempt !== null) {
          existing.attempt = fact.attempt
        }
      }
      const items: MatterListItem[] = []
      for (const { fact, attempt } of byKey.values()) {
        const merged: MatterListDraftFact = { ...fact, attempt }
        const pending = fact.matterRef === null ? 0 : deps.pendingCount(fact.matterRef)
        const candidates = fact.matterRef === null ? 0 : deps.acceptanceCandidateCount(fact.matterRef)
        const triggers = triggersOf(merged, pending)
        items.push({
          itemId: fact.matterRef ?? `draft:${fact.draftId}`,
          matterRef: fact.matterRef,
          title: fact.title === '' ? (fact.matterRef ?? fact.draftId) : fact.title,
          partition: partitionOf(triggers, candidates),
          triggers,
          acceptanceCandidateCount: candidates,
          lifecycle: deps.archivedOf !== undefined && fact.matterRef !== null && deps.archivedOf(fact.matterRef) ? 'archived' : 'active',
          updatedAt: fact.updatedAt,
        })
      }
      // Recent first inside every partition; the partitions themselves are counted, not merged.
      items.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0))
      const capped: MatterListItem[] = []
      const perPartition = new Map<MatterListPartition, number>()
      for (const item of items) {
        const seen = perPartition.get(item.partition) ?? 0
        if (seen >= MAX_PER_PARTITION) continue
        perPartition.set(item.partition, seen + 1)
        capped.push(item)
      }
      return {
        state: 'read',
        code: null,
        items: capped,
        counts: {
          action: capped.filter((item) => item.partition === 'action').length,
          inProgress: capped.filter((item) => item.partition === 'in-progress').length,
          acceptance: capped.filter((item) => item.partition === 'acceptance').length,
        },
      }
    },
  }
}

/** The empty-but-honest default before any provider is wired. */
export function unavailableMatterList(code: string): MatterListState {
  return { state: 'unavailable', code, items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } }
}
