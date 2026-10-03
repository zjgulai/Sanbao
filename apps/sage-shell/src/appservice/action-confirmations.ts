/** Ticket 025 (US-124~128): the action-level pre-execution confirmation.
 *
 * One confirmation = one single card (object / action / resources / scope / time / prerequisites,
 * plus whatever cost estimate is available) and one credential consumed exactly once, at the
 * dispatch it gates. The record binds the exact intent (payload included) and the facts the card
 * asserted; a changed action, revision, or prerequisite fact makes the old confirmation stale for
 * good — restoring the old facts later does not restore it (US-126 forbids riding an old page
 * state through). Records live for this run only: an id this run never minted is
 * `confirmation-required`, never a guess. Nothing here approves anything (US-128): the card is
 * the single necessary condition of the one dispatch it was prepared for.
 */
import { createHash, randomUUID } from 'node:crypto'
import type { SageActionIntentV2 } from './command-contracts.js'

/** The facts a card asserts beyond the intent itself; main re-reads them at consume time. */
export interface ActionConfirmationFacts {
  /** The execution environment main sees for this action now; null = none chosen (not "unknown"). */
  readonly environmentRef: string | null
}

export interface ActionConfirmationResource {
  readonly kind: 'execution-environment'
  readonly ref: string | null
  readonly state: 'selected' | 'not-selected'
}

export interface ActionConfirmationPrerequisite {
  readonly name: 'execution-environment'
  readonly state: 'met' | 'unknown'
  readonly note: 'environment-chosen' | 'no-environment-chosen'
}

export interface ActionConfirmationCard {
  readonly confirmationId: string
  /** 时间：when this card was prepared (main's clock). */
  readonly preparedAt: string
  /** 对象：the exact matter revision this action targets. */
  readonly target: { readonly matterRef: string, readonly revisionRef: string }
  /** 动作与范围：the action type, and whether it covers the matter or only this revision. */
  readonly action: { readonly type: string, readonly scope: 'matter' | 'revision' }
  /** 资源：what the action would use; an absent fact reads as not-selected, never invented. */
  readonly resources: readonly ActionConfirmationResource[]
  /** 前提：what the card checked; a change here after prepare makes the confirmation stale. */
  readonly prerequisites: readonly ActionConfirmationPrerequisite[]
  /** 可得的费用影响预估：no estimator exists in this release — the card says so, it does not guess. */
  readonly costEstimate: { readonly state: 'unavailable', readonly note: 'estimate-unavailable' }
  /** US-127: confirming buys the dispatch its necessary condition, not the external effect. */
  readonly effect: 'not-yet-happened'
}

export type ConfirmationCode = 'confirmation-required' | 'confirmation-stale' | 'confirmation-consumed'

export type ActionConfirmationVerdict =
  | { readonly ok: true, readonly confirmationId: string }
  | { readonly ok: false, readonly code: ConfirmationCode }

export interface ActionConfirmationStore {
  readonly prepare: (intent: SageActionIntentV2, facts: ActionConfirmationFacts) => ActionConfirmationCard
  /** Spend the credential for exactly one dispatch; the fresh facts are re-checked here (US-125). */
  readonly consume: (intent: SageActionIntentV2, confirmationId: string | undefined, facts: ActionConfirmationFacts) => ActionConfirmationVerdict
  /** Retire a confirmation whose preconditions moved on outside its own fingerprint (ticket 027:
   *  the source version changed): it can never be consumed afterwards, even if the old facts come
   *  back (US-126). Unknown ids are a no-op. */
  readonly retire: (confirmationId: string) => void
}

/** The store plus the one facts home main reads for both prepare and the per-dispatch recheck. */
export interface ActionConfirmationsWiring {
  readonly store: ActionConfirmationStore
  readonly facts: (intent: SageActionIntentV2) => ActionConfirmationFacts
}

interface ConfirmationRecord {
  readonly fingerprint: string
  state: 'open' | 'consumed' | 'stale'
}

const MAX_RECORDS = 64

/** Canonical action identity: `origin` is transport metadata, not part of what was confirmed. */
function canonicalIntent(intent: SageActionIntentV2): string {
  const payload = Object.keys(intent.payload).sort().map((key) => [key, intent.payload[key]])
  return JSON.stringify([intent.matterId, intent.revisionId, intent.actionType, intent.actionScope, payload])
}

export function createActionConfirmationStore(deps: { readonly now: () => string, readonly nextId?: () => string }): ActionConfirmationStore {
  const records = new Map<string, ConfirmationRecord>()
  const nextId = deps.nextId ?? randomUUID
  const fingerprintOf = (intent: SageActionIntentV2, facts: ActionConfirmationFacts): string =>
    createHash('sha256').update(`${canonicalIntent(intent)}|${JSON.stringify([facts.environmentRef])}`).digest('hex')
  return {
    prepare(intent, facts) {
      const confirmationId = nextId()
      if (records.size >= MAX_RECORDS) {
        const oldest = records.keys().next().value
        if (oldest !== undefined) records.delete(oldest)
      }
      records.set(confirmationId, { fingerprint: fingerprintOf(intent, facts), state: 'open' })
      return {
        confirmationId,
        preparedAt: deps.now(),
        target: { matterRef: intent.matterId, revisionRef: intent.revisionId },
        action: { type: intent.actionType, scope: intent.actionScope },
        resources: [{ kind: 'execution-environment', ref: facts.environmentRef, state: facts.environmentRef === null ? 'not-selected' : 'selected' }],
        prerequisites: [{
          name: 'execution-environment',
          state: facts.environmentRef === null ? 'unknown' : 'met',
          note: facts.environmentRef === null ? 'no-environment-chosen' : 'environment-chosen',
        }],
        costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
        effect: 'not-yet-happened',
      }
    },
    consume(intent, confirmationId, facts) {
      if (confirmationId === undefined) return { ok: false, code: 'confirmation-required' }
      const record = records.get(confirmationId)
      if (record === undefined) return { ok: false, code: 'confirmation-required' }
      if (record.state === 'consumed') return { ok: false, code: 'confirmation-consumed' }
      if (record.state === 'stale') return { ok: false, code: 'confirmation-stale' }
      if (record.fingerprint !== fingerprintOf(intent, facts)) {
        // US-126: a changed scope, revision or prerequisite invalidates the confirmation for good;
        // restoring the old facts by coincidence does not restore the confirmation.
        record.state = 'stale'
        return { ok: false, code: 'confirmation-stale' }
      }
      record.state = 'consumed'
      return { ok: true, confirmationId }
    },
    retire(confirmationId) {
      const record = records.get(confirmationId)
      if (record !== undefined && record.state === 'open') record.state = 'stale'
    },
  }
}
