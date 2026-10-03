import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { createModelQueue } from '../src/main/model-queue.js'

/**
 * Ticket 042 (US-200~202) at the module seam.
 *
 * The acceptance lines: the three states fold from the base's own durable retry records
 * (`llm/retry` / `llm/retry-started`), never from a UI timer; readiness flips only when the log
 * shows recovery; a closed turn without recovery is 结果未知 (verify-only) — not a failure and
 * never a retry affordance; and the store is a pure read, so 排队与重试不重复提交 is structural.
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

async function harness(options: { readonly sessions?: Record<string, string> } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-model-queue-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  const sessions = options.sessions ?? { 'matter:1': 'session-1' }
  if (Object.keys(sessions).length > 0) {
    await mkdir(join(dir, 'sessions'), { recursive: true })
    await writeFile(bindingsFile, JSON.stringify(sessions), { mode: 0o600 })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  const pageResponses: unknown[] = []
  const store = createModelQueue({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (endpoint === 'session/page') return pageResponses.shift() ?? { ok: true, result: { records: [], hasMore: false } }
      throw new Error(`unexpected endpoint ${endpoint}`)
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
  })
  return { store, calls, pageResponses }
}

const event = (seq: number, type: string, data?: unknown) => ({ type: 'event', event: { seq, type, ...(data === undefined ? {} : { data }) } })
const retry = (overrides: Record<string, unknown> = {}) => ({
  retryId: 'r-1', turn: 2, step: 1, provider: 'deepseek', mode: 'normal', policyKey: 'p',
  retry: 1, maxRetries: 3, delayMs: 2000, failure: { code: 'rate_limited', message: '429' },
  ...overrides,
})
const page = (...records: readonly unknown[]) => ({ ok: true, result: { records, hasMore: false } })

describe('the model-queue store (ticket 042)', () => {
  it('folds waiting / retrying / ready from the durable retry records — never from a timer', async () => {
    const h = await harness()
    // Waiting: the retry is scheduled, its turn is still open.
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 2 }), event(2, 'llm/retry', retry())))
    const waiting = await h.store.read({ matterRef: 'matter:1' })
    expect(waiting).toMatchObject({ state: 'read', verdict: 'waiting', verifyOnly: false })
    expect(waiting.retries).toEqual([{
      retryId: 'r-1', turn: 2, attempt: 1, maxAttempts: 3, delayMs: 2000,
      provider: 'deepseek', failureCode: 'rate_limited', started: false,
    }])

    // Retrying: the wait succeeded and the attempt restarted (llm/retry-started), no message yet.
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 2 }), event(2, 'llm/retry', retry()), event(3, 'llm/retry-started', { retryId: 'r-1', turn: 2, step: 1, retry: 1 })))
    const retrying = await h.store.read({ matterRef: 'matter:1' })
    expect(retrying).toMatchObject({ state: 'read', verdict: 'retrying', verifyOnly: false })
    expect(retrying.retries[0]?.started).toBe(true)

    // Ready: the stream recovered after the retry (assistant/message in the same turn).
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 2 }), event(2, 'llm/retry', retry()), event(3, 'llm/retry-started', { retryId: 'r-1', turn: 2, step: 1, retry: 1 }), event(4, 'assistant/message', {})))
    const ready = await h.store.read({ matterRef: 'matter:1' })
    expect(ready).toMatchObject({ state: 'read', verdict: 'ready', verifyOnly: false })
  })

  it('a closed turn without recovery is 结果未知, verify-only — not a failure, no retry entry', async () => {
    const h = await harness()
    // Unmatched retry, then the turn closed: the wait ended without the log showing recovery.
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 2 }), event(2, 'llm/retry', retry()), event(3, 'turn/end', { reason: { kind: 'error' } })))
    const unresolved = await h.store.read({ matterRef: 'matter:1' })
    expect(unresolved).toMatchObject({ state: 'read', verdict: 'unknown', verifyOnly: true, reason: 'model-queue-unresolved' })
    // Same rule when the attempt restarted but the turn closed before any progress.
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 2 }), event(2, 'llm/retry', retry()), event(3, 'llm/retry-started', { retryId: 'r-1', turn: 2, step: 1, retry: 1 }), event(4, 'turn/end', { reason: 'completed' })))
    const closed = await h.store.read({ matterRef: 'matter:1' })
    expect(closed).toMatchObject({ verdict: 'unknown', verifyOnly: true })
  })

  it('reads idle when nothing retried, no-session by binding, and is a pure read (排队不重复提交)', async () => {
    const h = await harness()
    h.pageResponses.push(page(event(1, 'turn/start', { turn: 1 }), event(2, 'assistant/message', {}), event(3, 'turn/end', { reason: 'completed' })))
    expect(await h.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'read', verdict: 'idle', retries: [] })
    // The whole lifecycle touched exactly one read endpoint — nothing was submitted, retried or written.
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/page'])
    expect(h.calls[0]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 200 }])

    expect(await h.store.read({ matterRef: 'matter:never-sent' })).toMatchObject({ state: 'no-session' })
  })

  it('skips malformed retry rows and keeps a refusal a named unavailable', async () => {
    const h = await harness()
    h.pageResponses.push(page(
      event(1, 'turn/start', { turn: 2 }),
      event(2, 'llm/retry', retry({ retryId: 'r-bad', delayMs: 'soon' })),
      event(3, 'llm/retry', retry()),
    ))
    const read = await h.store.read({ matterRef: 'matter:1' })
    expect(read.retries).toHaveLength(1)

    h.pageResponses.push({ ok: false, code: 'bridge-host-not-ready' })
    expect(await h.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'unavailable', reason: 'bridge-host-not-ready' })
    h.pageResponses.push({ ok: true, result: { records: 'nope' } })
    expect(await h.store.read({ matterRef: 'matter:1' })).toMatchObject({ state: 'unavailable', reason: 'model-queue-unrecognised' })
  })

  it('the unwired production default is a named unavailable, never a fabricated verdict', async () => {
    const service = createUnavailableFirstService(null, {})
    const body = await (await service.readState()).json() as { modelQueue: { state: string, reason: string | null, verdict: string } }
    expect(body.modelQueue).toMatchObject({ state: 'unavailable', verdict: 'idle', reason: 'model-queue-provider-unavailable' })
  })
})
