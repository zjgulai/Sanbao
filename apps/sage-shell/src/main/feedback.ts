/** Ticket 048 (US-223/224): the feedback entry — user text + structured diagnostics only.
 *
 * The rules the ticket names:
 *
 * - **The payload is exactly the user's text plus structured diagnostics** (`code` / `stage` /
 *   `correlation`): nothing is ever attached automatically — this store reads no log, no stack,
 *   no machine path, no credential (its only inputs are the request and the injected sink). The
 *   payload's key set is asserted by the spec, so an added field cannot ride along silently.
 * - **The receipt distinguishes 已接收 from 结果未知** (US-224): a confirmed hand-over is
 *   `accepted`; a sink failure/unreadable ack is `unknown` (recorded, verify-only); a named sink
 *   refusal is `refused`. There is NO remote sink in production today — the port stays unwired
 *   and answers a named 缺项 instead of pretending a submission.
 * - **Unknown never resubmits** (US-224): `verify` returns the recorded receipt for the SAME
 *   requestId and dispatches nothing; a duplicate click on 核对 cannot reach the sink again.
 * - No log upload, no crash auto-report, no ticket-system integration (ticket boundary).
 */
import type { FeedbackReceiptView, FeedbackStatus } from '../appservice/contracts.js'

/** The sink port: a Sage-side dependency (the future feedback destination), never a bridge call. */
export type FeedbackSink = (payload: FeedbackPayload) => unknown | Promise<unknown>

export interface FeedbackDiagnostics {
  readonly code: string | null
  readonly stage: string | null
  readonly correlation: string | null
}

export interface FeedbackPayload {
  readonly requestId: string
  readonly at: string
  readonly text: string
  readonly diagnostics: FeedbackDiagnostics
}

export interface FeedbackDeps {
  /** Production wires none today — no destination exists, so the submit stays honestly unavailable. */
  readonly sink?: FeedbackSink
  readonly now: () => string
  readonly nextId: () => string
}

export interface FeedbackStore {
  readonly submit: (input: { readonly text: string, readonly code?: string, readonly stage?: string, readonly correlation?: string }) => Promise<FeedbackReceiptView>
  readonly verify: (input: { readonly requestId: string }) => Promise<FeedbackReceiptView>
  readonly status: () => FeedbackStatus
}

const MAX_TEXT = 4000
const MAX_FIELD = 128
const MAX_RECEIPTS = 16

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= max && !value.includes('\u0000')
    ? value
    : null
}

export function createFeedback(deps: FeedbackDeps): FeedbackStore {
  const receipts: FeedbackReceiptView[] = []

  return {
    async submit(input) {
      const text = typeof input.text === 'string' ? input.text.trim() : ''
      if (text === '' || text.length > MAX_TEXT) {
        return { state: 'refused', requestId: null, at: null, code: 'feedback-text-invalid' }
      }
      const code = input.code === undefined ? null : bounded(input.code, MAX_FIELD)
      const stage = input.stage === undefined ? null : bounded(input.stage, MAX_FIELD)
      const correlation = input.correlation === undefined ? null : bounded(input.correlation, MAX_FIELD)
      if ((input.code !== undefined && code === null) || (input.stage !== undefined && stage === null) || (input.correlation !== undefined && correlation === null)) {
        return { state: 'refused', requestId: null, at: null, code: 'feedback-diagnostics-invalid' }
      }
      if (deps.sink === undefined) {
        // The missing destination is a named 未就绪 — nothing was submitted, nothing is recorded.
        return { state: 'unavailable', requestId: null, at: null, code: 'feedback-sink-unavailable' }
      }
      const requestId = deps.nextId()
      const at = deps.now()
      let state: 'accepted' | 'unknown'
      let failureCode: string | null = null
      try {
        const outcome = await deps.sink({ requestId, at, text, diagnostics: { code, stage, correlation } })
        if (isRecord(outcome) && outcome.ok === false && typeof outcome.code === 'string') {
          return { state: 'refused', requestId: null, at: null, code: outcome.code }
        }
        // A readable ack is the hand-over confirmation; anything else is 结果未知 (verify only).
        state = isRecord(outcome) && outcome.ok === true ? 'accepted' : 'unknown'
        if (state === 'unknown') failureCode = 'feedback-ack-unreadable'
      } catch (error) {
        state = 'unknown'
        failureCode = isRecord(error) && typeof error.code === 'string' ? error.code : 'feedback-sink-failed'
      }
      const receipt: FeedbackReceiptView = { state, requestId, at, code: failureCode }
      receipts.push(receipt)
      while (receipts.length > MAX_RECEIPTS) receipts.shift()
      return receipt
    },

    async verify(input) {
      // Verify NEVER resubmits: it returns the recorded receipt for the same requestId only.
      const found = receipts.find((receipt) => receipt.requestId === input.requestId)
      if (found === undefined) {
        return { state: 'not-found', requestId: input.requestId, at: null, code: 'feedback-receipt-not-found' }
      }
      return found
    },

    status() {
      return { state: 'read', receipts: [...receipts] }
    },
  }
}
