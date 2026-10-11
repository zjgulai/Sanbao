import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** ADR-0313: the session-control action posts — thin wrappers over the existing compliant
 *  routes (approval answer/withdraw, pending-input, queue-item). The approval routes are
 *  protected-effect admitted: today they answer the honest unavailable refusal; the wrappers
 *  pass the code through and never invent an outcome. */
const PATHS = {
  approvalAnswer: '/.sage/session/approval-answer',
  approvalWithdraw: '/.sage/session/approval-withdraw',
  pending: '/.sage/session/pending',
  queue: '/.sage/session/queue',
} as const

export interface SessionControlResult {
  readonly ok: boolean
  readonly code: string | null
  /** The recorded receipt's own state when the route answered one ('accepted' | 'effective' |
   *  'lapsed' | 'unknown'), null otherwise — 'unknown' means recorded-but-unconfirmed. */
  readonly receiptState?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Transport refusals keep their named code (the same map the session submit uses) — a 400 from
// an over-long or empty edit is 'invalid-session-request', not the anonymous transport failure.
const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  400: 'invalid-session-request', 403: 'caller-denied', 405: 'method-not-allowed',
  413: 'request-too-large', 415: 'content-type-rejected',
}

async function post(path: string, body: Record<string, unknown>): Promise<SessionControlResult> {
  try {
    const response = await fetch(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store', signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { ok: false, code: transportRefusal, receiptState: null }
    if (!response.ok) return { ok: false, code: 'session-control-failed', receiptState: null }
    const result: unknown = await response.json()
    if (!isRecord(result)) return { ok: false, code: 'session-control-failed', receiptState: null }
    const code = typeof result.code === 'string' && result.code !== '' ? result.code : null
    // The approval routes answer {state:'recorded'|'refused', receipt}; the queue/pending routes
    // answer their own outcome shapes ({state:'ok'|'refused'} etc.) — both carry a state field.
    const receiptState = isRecord(result.receipt) && typeof result.receipt.state === 'string' ? result.receipt.state : null
    return { ok: result.state === 'recorded' || result.state === 'ok', code, receiptState }
  } catch {
    return { ok: false, code: 'session-control-failed', receiptState: null }
  }
}

export const answerDesktopApproval = (matterRef: string, requestId: string, outcome: 'allowed-once' | 'rejected'): Promise<SessionControlResult> =>
  post(PATHS.approvalAnswer, { matterRef, requestId, outcome })

export const withdrawDesktopApproval = (matterRef: string, requestId: string): Promise<SessionControlResult> =>
  post(PATHS.approvalWithdraw, { matterRef, requestId })

// The pending/queue parsers accept exactly {action, itemId[, text]} — the matter scope is bound
// server-side by the request-scoped service assembly; the renderer never names it.
export const editPendingInput = (itemId: string, text: string): Promise<SessionControlResult> =>
  post(PATHS.pending, { action: 'edit', itemId, text })

export const removePendingInput = (itemId: string): Promise<SessionControlResult> =>
  post(PATHS.pending, { action: 'remove', itemId })

export const editQueueItem = (itemId: string, text: string): Promise<SessionControlResult> =>
  post(PATHS.queue, { action: 'edit', itemId, text })

export const removeQueueItem = (itemId: string): Promise<SessionControlResult> =>
  post(PATHS.queue, { action: 'remove', itemId })
