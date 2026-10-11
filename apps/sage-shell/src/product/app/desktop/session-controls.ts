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

/** ADR-0317 D4 (stage 7, code-set derivation): the ONE home of the retryable contract for a
 *  control refusal. Retryability is a property of the refusal code — the closed set the kernel
 *  itself emits (`protected-effect-unavailable` is exactly its retryable family); the route
 *  body stays {state, code} and no second field re-states this mapping. A null code (transport
 *  failure or an unowned refusal) stays retryable. */
export function retryableForRefusal(code: string | null): boolean {
  switch (code) {
    case 'protected-effect-unavailable': return true
    case 'protected-effect-denied':
    case 'protected-effect-stale':
    case 'protected-effect-outcome-unknown': return false
    case null: return true
    default: return true
  }
}

/** ADR-0317 (stage 7): the admission refusal family's own sentence. The control surfaces no
 *  longer say "not wired" — the routes are wired, and each refusal family is named with its
 *  own next step (retry later / authorization missing / refresh / no auto-retry). null for
 *  codes this home does not own (route-specific codes keep their own wording). */
export function describeControlRefusal(code: string | null): string | null {
  if (code === 'protected-effect-unavailable') {
    return retryableForRefusal(code)
      ? '控制操作暂不可用——可稍后重试。'
      : '控制操作暂不可用。'
  }
  if (code === 'protected-effect-denied') return '当前没有执行该操作的授权；未记录任何改动。'
  if (code === 'protected-effect-stale') return '状态已变化：请刷新后重试。'
  if (code === 'protected-effect-outcome-unknown') return '结果未知（已记录，待核对，不自动重试）。'
  return null
}

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
