import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSessionHistory } from '../src/main/session-history.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 009 (US-024/097~100) at the module and route seams.
 *
 * The acceptance lines: history reads ride ONLY `session/page` (no follow/prompt/attachment —
 * opening a historic matter activates nothing, re-sends nothing, re-uploads nothing); runs are
 * listed newest-first from the durable log with their own request-header model; details are read
 * per run and a failure stays missing (never a blank success).
 */

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    await cleanup()
    cleanup = cleanups.pop()
  }
})

const event = (seq: number, type: string, data?: unknown) => ({ type: 'event', event: { seq, type, ...(data === undefined ? {} : { data }) } })

async function harness(options: { readonly session?: boolean, readonly pages?: Record<string, unknown>, readonly failPage?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-history-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const bindingsFile = join(dir, 'sessions', 'bindings.json')
  if (options.session !== false) {
    await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 }).catch(async () => {
      const { mkdir } = await import('node:fs/promises')
      await mkdir(join(dir, 'sessions'), { recursive: true })
      await writeFile(bindingsFile, JSON.stringify({ 'matter:1': 'session-1' }), { mode: 0o600 })
    })
  }
  const calls: Array<{ endpoint: string, payload: unknown }> = []
  let pageIndex = 0
  const store = createSessionHistory({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      if (options.failPage === true) return { ok: false, code: 'bridge-page-failed' }
      const pages = options.pages?.[String(pageIndex)] ?? options.pages?.default
      pageIndex += 1
      return pages ?? { ok: true, result: { records: [], hasMore: false } }
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
  })
  return { store, calls }
}

describe('the cold-history module (ticket 009)', () => {
  it('lists newest first from the durable log only — the call table carries just session/page', async () => {
    const h = await harness({
      pages: {
        default: {
          ok: true,
          result: {
            records: [
              event(0, 'turn/start', { turn: 1 }),
              event(1, 'request/header', { header: { config: { provider: 'zhipu', model: 'glm-4.6' } } }),
              event(2, 'user/message', { message: { content: [{ type: 'text', text: '第一轮的要求' }] } }),
              event(3, 'assistant/message', { message: { content: [{ type: 'text', text: '第一轮的输出' }] } }),
              event(4, 'turn/end', { reason: 'completed' }),
              event(10, 'turn/start', { turn: 2 }),
              event(11, 'request/header', { header: { config: { provider: 'deepseek', model: 'deepseek-chat' } } }),
              event(12, 'assistant/message', { message: { content: [{ type: 'text', text: '第二轮进行中的输出' }] } }),
            ],
            hasMore: false,
          },
        },
      },
    })
    const outcome = await h.store.list({ matterRef: 'matter:1' })
    expect(outcome.state).toBe('read')
    if (outcome.state !== 'read') return
    expect(outcome.runs.map((run) => run.runSeq)).toEqual([10, 0])
    expect(outcome.runs[0]).toMatchObject({ model: 'deepseek-chat', provider: 'deepseek', endSeq: null, endReason: null })
    expect(outcome.runs[1]).toMatchObject({ model: 'glm-4.6', endSeq: 4, endReason: 'completed', messages: 2 })
    // US-024: the exact call table — only page reads; nothing that could activate, re-send or re-upload.
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/page'])
    expect(h.calls[0]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 400 }])
  })

  it('keeps the model null when the run recorded no request header, and carries the paging cursor back', async () => {
    const h = await harness({
      pages: {
        0: {
          ok: true,
          result: {
            records: [
              event(20, 'turn/start', { turn: 3 }),
              event(22, 'turn/end', { reason: 'cancelled' }),
            ],
            hasMore: true,
          },
        },
        1: { ok: true, result: { records: [event(5, 'turn/start', { turn: 2 }), event(7, 'turn/end', { reason: 'completed' })], hasMore: false } },
      },
    })
    const first = await h.store.list({ matterRef: 'matter:1' })
    expect(first).toMatchObject({ state: 'read', hasMore: true, nextBeforeSeq: 20 })
    if (first.state !== 'read') return
    expect(first.runs[0]).toMatchObject({ runSeq: 20, model: null, endReason: 'cancelled' })
    const second = await h.store.list({ matterRef: 'matter:1', beforeSeq: 20 })
    expect(second).toMatchObject({ state: 'read', hasMore: false })
    if (second.state !== 'read') return
    expect(second.runs.map((run) => run.runSeq)).toEqual([5])
    expect(h.calls[1]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 400, beforeSeq: 20 }])
  })

  it('no session means no-session without creating one; a page failure refuses with its code', async () => {
    const bare = await harness({ session: false })
    expect(await bare.store.list({ matterRef: 'matter:1' })).toEqual({ state: 'no-session' })
    expect(bare.calls).toEqual([])

    const failing = await harness({ failPage: true })
    expect(await failing.store.list({ matterRef: 'matter:1' })).toEqual({ state: 'refused', code: 'bridge-page-failed' })
    expect(await failing.store.detail({ matterRef: 'matter:1', runSeq: 20 })).toMatchObject({ state: 'missing', code: 'bridge-page-failed' })
  })

  it('reads one run\'s detail on demand, window-filtered, and keeps failures missing (US-098/100)', async () => {
    const h = await harness({
      pages: {
        default: {
          ok: true,
          result: {
            records: [
              event(0, 'turn/start', { turn: 1 }),
              event(4, 'turn/end', { reason: 'completed' }),
              event(10, 'turn/start', { turn: 2 }),
              event(11, 'request/header', { header: { config: { provider: 'deepseek', model: 'deepseek-chat' } } }),
              event(12, 'user/message', { message: { content: [{ type: 'text', text: '第二轮的要求' }] } }),
              event(13, 'assistant/message', { message: { content: [{ type: 'text', text: '第二轮输出'.repeat(500) }] } }),
              event(14, 'turn/end', { reason: 'completed' }),
            ],
            hasMore: false,
          },
        },
      },
    })
    const detail = await h.store.detail({ matterRef: 'matter:1', runSeq: 10 })
    expect(detail.state).toBe('read')
    if (detail.state !== 'read') return
    // Window filter: the first run's events never leak into this run's detail.
    expect(detail.model).toBe('deepseek-chat')
    expect(detail.userTexts).toEqual(['第二轮的要求'])
    expect(detail.outputPreview).toHaveLength(2000)
    expect(detail.outputTruncated).toBe(true)
    expect(h.calls[0]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, beforeSeq: 10, maxMessages: 400 }])

    const absent = await h.store.detail({ matterRef: 'matter:1', runSeq: 99 })
    expect(absent).toMatchObject({ state: 'missing', code: 'history-run-not-in-page' })
  })

  it('walks a run\'s clarifications read-only: answered asks carry the recorded answer, an unsettled ask stays unanswered (US-180)', async () => {
    const h = await harness({
      pages: {
        default: {
          ok: true,
          result: {
            records: [
              event(10, 'turn/start', { turn: 2 }),
              event(12, 'tool/call', { turn: 2, step: 1, callId: 'call-1', name: 'ask_user_question', arguments: { questions: [{ id: 'q1', question: '先收口哪部分？' }, { id: 'q2', question: '截止何时？' }] } }),
              event(13, 'tool/result', { turn: 2, step: 1, message: { callId: 'call-1', content: [{ type: 'text', text: JSON.stringify({ answers: [{ id: 'q1', selected: ['保持当前范围'], custom: '补充说明' }, { id: 'q2', selected: [], custom: '周五前' }] }) }], isError: false } }),
              event(14, 'tool/call', { turn: 2, step: 2, callId: 'call-2', name: 'ask_user_question', arguments: { questions: [{ id: 'q3', question: '预算上限？' }] } }),
              event(15, 'turn/end', { reason: 'completed' }),
            ],
            hasMore: false,
          },
        },
      },
    })
    const detail = await h.store.detail({ matterRef: 'matter:1', runSeq: 10 })
    expect(detail.state).toBe('read')
    if (detail.state !== 'read') return
    expect(detail.clarifications).toEqual([
      { question: '先收口哪部分？', selected: ['保持当前范围'], custom: '补充说明', answered: true },
      { question: '截止何时？', selected: [], custom: '周五前', answered: true },
      { question: '预算上限？', selected: [], custom: null, answered: false },
    ])
  })
})

describe('the history route (ticket 009)', () => {
  it('parses exactly, forwards markers, and keeps an unwired family honest', async () => {
    const seen: unknown[] = []
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {
      sessionHistoryList: async (request) => { seen.push({ list: request }); return { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null } },
      sessionHistoryDetail: async (request) => { seen.push({ detail: request }); return { state: 'missing', runSeq: request.runSeq, code: 'marker' } },
    }))
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-009' }, providers } as never,
    )
    expect(await (await post({ action: 'list' })).json()).toMatchObject({ state: 'read' })
    expect(await (await post({ action: 'list', beforeSeq: 20 })).json()).toMatchObject({ state: 'read' })
    expect(await (await post({ action: 'detail', runSeq: 3 })).json()).toEqual({ state: 'missing', runSeq: 3, code: 'marker' })
    expect(seen).toEqual([{ list: { action: 'list' } }, { list: { action: 'list', beforeSeq: 20 } }, { detail: { action: 'detail', runSeq: 3 } }])
    expect((await post({ action: 'detail' })).status).toBe(400)
    expect((await post({ action: 'list', beforeSeq: -1 })).status).toBe(400)
    expect((await post({ action: 'list', extra: 1 })).status).toBe(400)

    const unwired = withProjectionReadTestAdmission(createUnavailableFirstService(null, {}))
    const postUnwired = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/history', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-009' }, providers: unwired } as never,
    )
    expect(await (await postUnwired({ action: 'list' })).json()).toEqual({ state: 'refused', code: 'session-history-unavailable' })
    expect(await (await postUnwired({ action: 'detail', runSeq: 1 })).json()).toMatchObject({ state: 'missing', code: 'session-history-unavailable' })
  })
})
