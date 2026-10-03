/** Ticket 042 (US-200~202): the model-queue verdict — queued / retrying / ready, from service facts.
 *
 * The rules the ticket names:
 *
 * - **The three states come from service facts and never mix with the error three-state**
 *   (US-200): the facts are the durable retry records the base itself writes — `llm/retry`
 *   (a provider-routed retry scheduled after a failed attempt: attempt/maxRetries, `delayMs`,
 *   provider, failure code) and `llm/retry-started` (the wait succeeded and the next attempt is
 *   about to start). This store folds exactly those records; it never invents a queue.
 * - **Readiness is never a UI timer** (US-201): no countdown, no server-surrogate clock — `delayMs`
 *   is displayed as the SERVICE's scheduled delay, and the verdict flips only when the log shows
 *   the transition (`llm/retry-started`, then progress in the turn).
 * - **A timeout is 结果未知, verify-only** (US-201): when an unmatched retry sits in a turn that
 *   already closed (or the facts stop being readable), the verdict is `unknown` with its reason —
 *   the surface offers only the re-read entry, never a retry, never a failure claim.
 * - **排队与重试不重复提交** (US-202): this store is a pure read — its only bridge call is the
 *   bounded page read; retries belong to the base's own policy and are never re-submitted here.
 */
import { readFileSync } from 'node:fs'

import type { ModelQueueRetryView, ModelQueueStatus } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const PAGE_MESSAGES = 200
const MAX_RETRIES = 8
const MAX_PROVIDER = 64
const MAX_CODE = 64
const MAX_ID = 128

export interface ModelQueueDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
}

export interface ModelQueueStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<ModelQueueStatus>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function bounded(value: unknown, max: number): string | null {
  return typeof value === 'string' && value !== '' && value === value.trim() && value.length <= max
    ? value
    : null
}

function intOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

interface RetryFact {
  retryId: string
  turn: number
  attempt: number
  maxAttempts: number | null
  delayMs: number
  provider: string
  failureCode: string
  started: boolean
}

/** Fold the window's durable records into retry facts + the open-turn boundary. */
function foldWindow(records: readonly unknown[]): { retries: RetryFact[]; turnOpen: boolean; recovered: boolean } {
  const byId = new Map<string, RetryFact>()
  const order: string[] = []
  let turnSeen = false
  let turnEnded = false
  let lastRetryIndex = -1
  let lastMessageIndex = -1
  let index = 0
  for (const raw of records) {
    const event = isRecord(raw) && isRecord(raw.event) ? raw.event : isRecord(raw) ? raw : null
    if (event === null) { index += 1; continue }
    const type = typeof event.type === 'string' ? event.type : ''
    const data = isRecord(event.data) ? event.data : null
    if (type === 'turn/start') {
      turnSeen = true
      turnEnded = false
    } else if (type === 'turn/end') {
      turnEnded = true
    } else if (type === 'assistant/message') {
      lastMessageIndex = index
    } else if (type === 'llm/retry' && data !== null) {
      const retryId = bounded(data.retryId, MAX_ID)
      const turn = intOf(data.turn)
      const attempt = intOf(data.retry)
      const delayMs = intOf(data.delayMs)
      const provider = bounded(data.provider, MAX_PROVIDER)
      const failure = isRecord(data.failure) ? data.failure : null
      const failureCode = failure !== null ? bounded(failure.code, MAX_CODE) : null
      if (retryId !== null && turn !== null && attempt !== null && delayMs !== null && provider !== null && failureCode !== null) {
        if (!byId.has(retryId)) order.push(retryId)
        byId.set(retryId, {
          retryId, turn, attempt,
          maxAttempts: intOf(data.maxRetries),
          delayMs, provider, failureCode,
          started: false,
        })
        lastRetryIndex = index
      }
    } else if (type === 'llm/retry-started' && data !== null) {
      const retryId = bounded(data.retryId, MAX_ID)
      const existing = retryId === null ? undefined : byId.get(retryId)
      if (existing !== undefined) existing.started = true
    }
    index += 1
  }
  const retries = order.slice(-MAX_RETRIES).map((id) => byId.get(id)!)
  return {
    retries,
    turnOpen: turnSeen && !turnEnded,
    // A message after the last retry record means the stream recovered → ready (the service fact).
    recovered: lastRetryIndex >= 0 && lastMessageIndex > lastRetryIndex,
  }
}

export function createModelQueue(deps: ModelQueueDeps): ModelQueueStore {
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

  return {
    async read(input) {
      const sessionId = readBindings()[input.matterRef]
      const idle = (): ModelQueueStatus => ({ state: 'read', verdict: 'idle', retries: [], verifyOnly: false, reason: null, at: null })
      if (sessionId === undefined) return { state: 'no-session', verdict: 'idle', retries: [], verifyOnly: false, reason: null, at: null }
      let answer: unknown
      try {
        answer = await deps.callBridge('session/page', [{ sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return { state: 'unavailable', verdict: 'idle', retries: [], verifyOnly: false, reason: code, at: null }
      }
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) {
        const code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'model-queue-unrecognised'
        return { state: 'unavailable', verdict: 'idle', retries: [], verifyOnly: false, reason: code, at: null }
      }
      const result = record.result
      const records = isRecord(result) && Array.isArray(result.records) ? result.records : null
      if (records === null) return { state: 'unavailable', verdict: 'idle', retries: [], verifyOnly: false, reason: 'model-queue-unrecognised', at: null }
      const folded = foldWindow(records)
      const retries: ModelQueueRetryView[] = folded.retries.map((retry) => ({
        retryId: retry.retryId,
        turn: retry.turn,
        attempt: retry.attempt,
        maxAttempts: retry.maxAttempts,
        delayMs: retry.delayMs,
        provider: retry.provider,
        failureCode: retry.failureCode,
        started: retry.started,
      }))
      if (retries.length === 0) return idle()
      const last = retries[retries.length - 1]!
      if (last.started && folded.recovered) {
        return { state: 'read', verdict: 'ready', retries, verifyOnly: false, reason: null, at: null }
      }
      if (last.started && folded.turnOpen) {
        return { state: 'read', verdict: 'retrying', retries, verifyOnly: false, reason: null, at: null }
      }
      if (!last.started && folded.turnOpen) {
        return { state: 'read', verdict: 'waiting', retries, verifyOnly: false, reason: null, at: null }
      }
      // Unresolved: the retry sat in a turn that closed (or restarted) without the log ever showing
      // recovery — 结果未知, verify only, never a failure claim and never a retry affordance.
      return { state: 'read', verdict: 'unknown', retries, verifyOnly: true, reason: 'model-queue-unresolved', at: null }
    },
  }
}
