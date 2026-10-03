import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSessionAnchors } from '../src/main/session-anchors.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 035 (US-183/184) at the module and route seams.
 *
 * The acceptance lines: anchors (turn jump points with a bounded short preview) and locating one
 * target ride ONLY the pure-history read — nothing activates the session, nothing loads a full
 * transcript; and a target that cannot be read stays missing with its reason (never a blank).
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

async function harness(options: { readonly session?: boolean, readonly pages?: Record<string, unknown> } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sage-anchors-'))
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
  const store = createSessionAnchors({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      const pages = options.pages?.[String(pageIndex)] ?? options.pages?.default
      pageIndex += 1
      return pages ?? { ok: true, result: { records: [], hasMore: false } }
    },
    bindingsFile,
    now: () => '2026-10-03T12:00:00.000Z',
  })
  return { store, calls }
}

describe('the message anchors store (ticket 035)', () => {
  it('reads anchors newest-first with bounded previews and calls nothing but session/page', async () => {
    const h = await harness({
      pages: {
        default: {
          ok: true,
          result: {
            records: [
              event(0, 'turn/start', { turn: 1 }),
              event(1, 'user/message', { message: { content: [{ type: 'text', text: '第一轮的要求' }] } }),
              event(2, 'assistant/message', { message: { content: [{ type: 'text', text: '输出' }] } }),
              event(4, 'turn/end', { reason: 'completed' }),
              event(10, 'turn/start', { turn: 2 }),
              event(11, 'user/message', { message: { content: [{ type: 'text', text: '把《增长复盘》按渠道拆分再讲一遍'.repeat(10) }] } }),
            ],
            hasMore: false,
          },
        },
      },
    })
    const outcome = await h.store.read({ matterRef: 'matter:1' })
    expect(outcome.state).toBe('read')
    if (outcome.state !== 'read') return
    expect(outcome.anchors.map((anchor) => anchor.runSeq)).toEqual([10, 0])
    expect(outcome.anchors[0]).toMatchObject({ turn: 2 })
    expect(outcome.anchors[0]?.promptPreview?.startsWith('把《增长复盘》按渠道拆分再讲一遍')).toBe(true)
    // 短预览有界：整段正文不过界（截断到 140 字）。
    expect(outcome.anchors[0]?.promptPreview?.length).toBe(140)
    expect(outcome.anchors[1]).toMatchObject({ turn: 1, promptPreview: '第一轮的要求' })
    // US-183：定位与预览只走纯历史读取——调用表恰一种，无 prompt/follow/其它。
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/page'])
    expect(h.calls[0]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 400 }])
  })

  it('no session means no-session without creating one; a page failure stays named', async () => {
    const bare = await harness({ session: false })
    expect(await bare.store.read({ matterRef: 'matter:1' })).toEqual({ state: 'no-session' })
    expect(bare.calls).toEqual([])

    const failing = await harness({ pages: { default: { ok: false, code: 'bridge-page-failed' } } })
    expect(await failing.store.read({ matterRef: 'matter:1' })).toEqual({ state: 'unavailable', code: 'bridge-page-failed' })
    expect(await failing.store.locate({ matterRef: 'matter:1', runSeq: 10 })).toEqual({ state: 'missing', runSeq: 10, code: 'bridge-page-failed' })
  })

  it('locates one target through one bounded windowed read and answers its short preview (US-183)', async () => {
    const h = await harness({
      pages: {
        default: {
          ok: true,
          result: {
            records: [
              event(10, 'turn/start', { turn: 2 }),
              event(11, 'user/message', { message: { content: [{ type: 'text', text: '第二轮的要求' }] } }),
              event(14, 'turn/end', { reason: 'completed' }),
            ],
            hasMore: false,
          },
        },
      },
    })
    // 定位发生在读完锚点之后（现场已有）——先读一次，再定位同一目标。
    await h.store.read({ matterRef: 'matter:1' })
    const outcome = await h.store.locate({ matterRef: 'matter:1', runSeq: 10 })
    expect(outcome).toEqual({ state: 'located', runSeq: 10, turn: 2, promptPreview: '第二轮的要求' })
    expect(h.calls.map((call) => call.endpoint)).toEqual(['session/page', 'session/page'])
    expect(h.calls[1]?.payload).toEqual([{ sessionId: 'session-1', throughSeq: -1, maxMessages: 400, beforeSeq: 10 }])
    expect(h.store.status('matter:1').located).toEqual({ runSeq: 10, promptPreview: '第二轮的要求' })
  })

  it('keeps an unreadable target missing with its reason and the rail scene intact (US-184)', async () => {
    const h = await harness({
      pages: {
        0: { ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(11, 'user/message', { message: { content: [{ type: 'text', text: '第二轮的要求' }] } })] } },
        1: { ok: true, result: { records: [event(10, 'turn/start', { turn: 2 }), event(11, 'user/message', { message: { content: [{ type: 'text', text: '第二轮的要求' }] } })] } },
      },
    })
    await h.store.read({ matterRef: 'matter:1' })
    const missing = await h.store.locate({ matterRef: 'matter:1', runSeq: 99 })
    expect(missing).toEqual({ state: 'missing', runSeq: 99, code: 'history-run-not-in-page' })
    // 保持现场：已读的锚点列表与上一个已定位目标都还在，不回落为空白。
    const status = h.store.status('matter:1')
    expect(status.anchors.map((anchor) => anchor.runSeq)).toEqual([10])
    expect(status.at).toBe('2026-10-03T12:00:00.000Z')
  })
})

describe('the anchors route (ticket 035)', () => {
  it('parses exactly, forwards, and keeps an unwired family honest', async () => {
    const seen: unknown[] = []
    const providers = withProjectionReadTestAdmission(createUnavailableFirstService(null, {
      sessionAnchorsRead: async (request) => { seen.push({ read: request }); return { state: 'read', anchors: [] } },
      sessionAnchorLocate: async (request) => { seen.push({ locate: request }); return { state: 'missing', runSeq: request.runSeq, code: 'marker' } },
    }))
    const post = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/anchors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-035' }, providers } as never,
    )
    expect(await (await post({ action: 'read' })).json()).toEqual({ state: 'read', anchors: [] })
    expect(await (await post({ action: 'locate', runSeq: 10 })).json()).toEqual({ state: 'missing', runSeq: 10, code: 'marker' })
    expect(seen).toEqual([{ read: { action: 'read' } }, { locate: { action: 'locate', runSeq: 10 } }])
    expect((await post({ action: 'locate' })).status).toBe(400)
    expect((await post({ action: 'locate', runSeq: -1 })).status).toBe(400)
    expect((await post({ action: 'read', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'locate', runSeq: 1, extra: 1 })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)

    const unwired = withProjectionReadTestAdmission(createUnavailableFirstService(null, {}))
    const postUnwired = (body: unknown) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/session/anchors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-035' }, providers: unwired } as never,
    )
    expect(await (await postUnwired({ action: 'read' })).json()).toEqual({ state: 'unavailable', code: 'session-anchors-unavailable' })
    expect(await (await postUnwired({ action: 'locate', runSeq: 3 })).json()).toEqual({ state: 'missing', runSeq: 3, code: 'session-anchors-unavailable' })
  })
})
