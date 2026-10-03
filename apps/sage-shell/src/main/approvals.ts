/** Ticket 041 (US-197~199): the external-authorization waits over the host approval relay.
 *
 * The rules the ticket names:
 *
 * - **A pending wait is the live relay registry** (`session/approvals`): a wait exists exactly
 *   while the base's `approval/request` waterfall is blocked on the shell — nothing here invents
 *   a card. The card carries the requested scope (tool) and the asker's source note; it reads as
 *   WAITING — never as failed, never as approved (US-197/198).
 * - **未获授权不派发依赖动作** is the base's own enforcement: the tool call stays blocked until an
 *   answerer returns a closed outcome. This store only submits the user's decision — the two
 *   words `allowed-once` (the base's sole, one-shot grant) and `rejected` — and never manufactures
 *   a grant on any path, including failures (failures stay `unknown`, verify-only).
 * - **Withdrawal is one named request** (US-198): it aborts the asker's own signal; the base then
 *   settles the wait `cancelled` and discards any late answer. A wait without a signal is refused
 *   as not-withdrawable — the surface is told the truth instead of pretending.
 * - **A vanished wait is 失效, and old waits never become execution conditions** (US-199): a
 *   pending card that leaves the list without our decision is preserved as 已失效 (reason:
 *   stopped / gone); a decision receipt turns `effective` ONLY on the durable `approval/decided`
 *   evidence in the session log, `lapsed` when the log shows the wait was withdrawn/aborted —
 *   and `unknown` (verify-only) when the bridge never confirmed — never "approved" without
 *   evidence, and never silently converted.
 */
import { readFileSync } from 'node:fs'

import type {
  ApprovalAnswerOutcome,
  ApprovalCardView,
  ApprovalLapsedView,
  ApprovalReceiptState,
  ApprovalReceiptView,
  ApprovalStatus,
  ApprovalWithdrawOutcome,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const PAGE_MESSAGES = 200
const MAX_CARDS = 8
const MAX_LAPSED = 8
const MAX_RECEIPTS = 32
const MAX_MATTERS = 8
const MAX_ID_CHARS = 128
const MAX_TOOL_CHARS = 256
const MAX_REASON_CHARS = 4096

export interface ApprovalsDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
  /** Ticket 007's pause truth: while paused, an answer cannot be dispatched. */
  readonly pending?: { isPaused(matterRef: string): boolean }
}

export interface ApprovalsStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<ApprovalStatus>
  readonly answer: (input: { readonly matterRef: string, readonly requestId: string, readonly outcome: 'allowed-once' | 'rejected' }) => Promise<ApprovalAnswerOutcome>
  readonly withdraw: (input: { readonly matterRef: string, readonly requestId: string }) => Promise<ApprovalWithdrawOutcome>
}

interface ReceiptRecord {
  readonly requestId: string
  outcome: 'allowed-once' | 'rejected' | 'withdrawn'
  state: ApprovalReceiptState
  readonly submittedAt: string
  code: string | null
}

interface MatterState {
  readonly receipts: ReceiptRecord[]
  readonly lapsed: ApprovalLapsedView[]
  lastPending: readonly ApprovalCardView[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= max && !value.includes('\u0000')
    ? value
    : null
}

const DECIDED_OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable'] as const

/** One durable decision found in the page's records for our request id, if any. */
function decidedOf(records: readonly unknown[], requestId: string): (typeof DECIDED_OUTCOMES)[number] | null {
  for (const raw of records) {
    if (!isRecord(raw)) continue
    const event = isRecord(raw.event) ? raw.event : isRecord(raw) ? raw : null
    const type = event !== null && typeof event.type === 'string' ? event.type : null
    const data = event !== null && isRecord(event.data) ? event.data : null
    if (type !== 'approval/decided' || data === null || data.id !== requestId) continue
    return DECIDED_OUTCOMES.find((candidate) => candidate === data.outcome) ?? null
  }
  return null
}

export function createApprovals(deps: ApprovalsDeps): ApprovalsStore {
  const readBindings = (): Record<string, string> => {
    try {
      const value = JSON.parse(readFileSync(deps.bindingsFile, 'utf8')) as unknown
      if (!isRecord(value)) return {}
      const out: Record<string, string> = {}
      for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string' && entry !== '') out[key] = entry
      return out
    } catch {
      return {}
    }
  }

  const matters = new Map<string, MatterState>()

  const stateOf = (matterRef: string): MatterState => {
    let state = matters.get(matterRef)
    if (state === undefined) {
      state = { receipts: [], lapsed: [], lastPending: [] }
      matters.set(matterRef, state)
      while (matters.size > MAX_MATTERS) {
        const oldest = matters.keys().next().value as string
        matters.delete(oldest)
      }
    }
    return state
  }

  const receiptViewOf = (record: ReceiptRecord): ApprovalReceiptView => ({
    requestId: record.requestId,
    state: record.state,
    // A lapsed wait carries NO readable outcome (its submission is void and needs a fresh
    // request); unknown never confirmed a decision either — only accepted/effective show the word.
    outcome: record.state === 'unknown' || record.state === 'lapsed' ? null : record.outcome,
    submittedAt: record.submittedAt,
    code: record.code,
    // Only an unknown/unconfirmed receipt offers verification — a settled one has its decision.
    verifyOnly: record.state === 'accepted' || record.state === 'unknown',
  })

  const emptyStatus = (state: ApprovalStatus['state'], code: string | null, matterRef: string, at: string | null): ApprovalStatus => {
    const internal = stateOf(matterRef)
    return {
      state,
      pending: [],
      lapsed: [...internal.lapsed],
      receipts: internal.receipts.map(receiptViewOf),
      code,
      at,
    }
  }

  const cardOf = (value: unknown): ApprovalCardView | null => {
    if (!isRecord(value)) return null
    const requestId = bounded(value.requestId, MAX_ID_CHARS)
    const toolName = bounded(value.toolName, MAX_TOOL_CHARS)
    const raisedAt = bounded(value.raisedAt, 64)
    if (requestId === null || toolName === null || raisedAt === null) return null
    const callId = value.callId === undefined || value.callId === null ? null : bounded(value.callId, MAX_ID_CHARS)
    const reason = value.reason === undefined || value.reason === null ? null : bounded(value.reason, MAX_REASON_CHARS)
    return { requestId, toolName, callId, reason, withdrawable: value.withdrawable === true, raisedAt }
  }

  const readPage = async (sessionId: string): Promise<readonly unknown[] | null> => {
    try {
      const answer = await deps.callBridge('session/page', [{ sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }])
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) return null
      const result = record.result
      return isRecord(result) && Array.isArray(result.records) ? result.records : null
    } catch {
      return null
    }
  }

  return {
    async read(input) {
      const state = stateOf(input.matterRef)
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return emptyStatus('no-session', null, input.matterRef, null)

      let answer: unknown
      try {
        answer = await deps.callBridge('session/approvals', [{ sessionId }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return emptyStatus('unavailable', code, input.matterRef, null)
      }
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) {
        const code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'approval-relay-unrecognised'
        return emptyStatus('unavailable', code, input.matterRef, null)
      }
      const result = record.result
      const pendingRaw = isRecord(result) && Array.isArray(result.pending) ? result.pending : null
      if (pendingRaw === null) return emptyStatus('unavailable', 'approval-relay-unrecognised', input.matterRef, null)

      const cards = pendingRaw.slice(0, MAX_CARDS).map(cardOf)
        .filter((card): card is ApprovalCardView => card !== null)
      const pendingIds = new Set(cards.map((card) => card.requestId))
      const paused = deps.pending?.isPaused(input.matterRef) === true

      // US-199: a wait that left the pending list without our decision is preserved as 失效 —
      // never dropped silently, never converted into a grant.
      const known = new Set([
        ...state.lapsed.map((entry) => entry.requestId),
        ...state.receipts.map((entry) => entry.requestId),
      ])
      for (const card of state.lastPending) {
        if (pendingIds.has(card.requestId) || known.has(card.requestId)) continue
        state.lapsed.push({ ...card, lapse: paused ? 'stopped' : 'gone' })
        known.add(card.requestId)
      }
      while (state.lapsed.length > MAX_LAPSED) state.lapsed.shift()
      state.lastPending = cards

      // Receipt settlement: evidence-first. `accepted` becomes `effective`/`lapsed` only on the
      // durable `approval/decided` record; a wait that vanished under the pause is `lapsed`; with
      // no durable evidence yet it stays `accepted` (never a guessed decision). `unknown` (the
      // bridge never confirmed) stays verify-only and can also settle on later evidence.
      const needsEvidence = state.receipts.some((receipt) => (receipt.state === 'accepted' || receipt.state === 'unknown') && !pendingIds.has(receipt.requestId))
      const records = needsEvidence ? await readPage(sessionId) : null
      for (const receipt of state.receipts) {
        if (receipt.state !== 'accepted' && receipt.state !== 'unknown') continue
        if (pendingIds.has(receipt.requestId)) continue
        const decided = records === null ? null : decidedOf(records, receipt.requestId)
        if (decided === 'allowed-once' || decided === 'rejected') {
          receipt.state = 'effective'
          receipt.outcome = decided
          receipt.code = null
        } else if (decided === 'cancelled' || decided === 'unavailable') {
          // The log shows the wait ended without the user's decision (withdrawn elsewhere /
          // no answerer): honest 失效 — it needs a fresh request, and it is NOT an approval.
          receipt.state = 'lapsed'
          receipt.code = decided === 'cancelled' ? 'approval-wait-cancelled' : 'approval-answerer-unavailable'
        } else if (paused) {
          receipt.state = 'lapsed'
          receipt.code = 'approval-session-paused'
        }
      }

      return {
        state: 'read',
        pending: cards,
        lapsed: [...state.lapsed],
        receipts: state.receipts.map(receiptViewOf),
        code: null,
        at: null,
      }
    },

    async answer(input) {
      const state = stateOf(input.matterRef)
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'approval-no-session' }
      const key = `${sessionId}:${input.requestId}`

      // One submission per wait, ever — a repeat click or refresh returns the recorded outcome.
      const recorded = state.receipts.find((receipt) => `${sessionId}:${receipt.requestId}` === key)
      if (recorded !== undefined) return { state: 'recorded', receipt: receiptViewOf(recorded) }

      // While the session is paused the wait has already lapsed at the runtime; nothing recorded,
      // so resume-then-answer stays possible.
      if (deps.pending?.isPaused(input.matterRef) === true) return { state: 'refused', code: 'approval-paused' }

      const card = state.lastPending.find((entry) => entry.requestId === input.requestId)
      if (card === undefined) return { state: 'refused', code: 'approval-not-pending' }

      let accepted = false
      let code: string | null = null
      try {
        const outcome = await deps.callBridge('session/approve', [{ requestId: input.requestId, outcome: input.outcome }])
        if (isRecord(outcome) && outcome.ok === true) accepted = true
        else code = isRecord(outcome) && outcome.ok === false && typeof outcome.code === 'string' ? outcome.code : 'bridge-answer-unrecognised'
      } catch (error) {
        code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
      }

      // An unconfirmed submit is `unknown` — verify only, and it can never read as approved.
      const record2: ReceiptRecord = {
        requestId: input.requestId,
        outcome: input.outcome,
        state: accepted ? 'accepted' : 'unknown',
        submittedAt: deps.now(),
        code,
      }
      state.receipts.push(record2)
      while (state.receipts.length > MAX_RECEIPTS) state.receipts.shift()
      return { state: 'recorded', receipt: receiptViewOf(record2) }
    },

    async withdraw(input) {
      const state = stateOf(input.matterRef)
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'approval-no-session' }
      const key = `${sessionId}:${input.requestId}`
      const recorded = state.receipts.find((receipt) => `${sessionId}:${receipt.requestId}` === key)
      if (recorded !== undefined) return { state: 'recorded', receipt: receiptViewOf(recorded) }
      if (deps.pending?.isPaused(input.matterRef) === true) return { state: 'refused', code: 'approval-paused' }

      const card = state.lastPending.find((entry) => entry.requestId === input.requestId)
      if (card === undefined) return { state: 'refused', code: 'approval-not-pending' }
      if (!card.withdrawable) return { state: 'refused', code: 'approval-not-withdrawable' }

      let accepted = false
      let code: string | null = null
      try {
        const outcome = await deps.callBridge('session/approval-withdraw', [{ requestId: input.requestId }])
        if (isRecord(outcome) && outcome.ok === true) accepted = true
        else code = isRecord(outcome) && outcome.ok === false && typeof outcome.code === 'string' ? outcome.code : 'bridge-answer-unrecognised'
      } catch (error) {
        code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
      }

      const record3: ReceiptRecord = {
        requestId: input.requestId,
        outcome: 'withdrawn',
        state: accepted ? 'accepted' : 'unknown',
        submittedAt: deps.now(),
        code,
      }
      state.receipts.push(record3)
      while (state.receipts.length > MAX_RECEIPTS) state.receipts.shift()
      return { state: 'recorded', receipt: receiptViewOf(record3) }
    },
  }
}
