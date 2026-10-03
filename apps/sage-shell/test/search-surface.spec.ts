import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 021: the search card on the workbench.
 *
 * What lives here: the two sections render apart; the missing engine and "no hits" are different
 * sentences; a plain query is the ONLY request the page fires; a click while the query is in
 * flight is ignored (no duplicate concurrent searches); hits are text — nothing opens.
 */

const outcome = (over: Record<string, unknown> = {}) => ({
  state: 'read',
  query: '订单',
  matters: [{ matterRef: 'receipt:1', title: '稳定订单增长', matchedField: 'goal' }],
  sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: '…订单口径…' }], hasMore: false },
  ...over,
})

const payload = (over: Record<string, unknown> = {}) => statePayload(over)

describe('the search card (021)', () => {
  it('fires exactly one read, renders both sections, and opens nothing', async () => {
    const harness = await bootSagePage(payload(outcome()))
    const sessionIdBefore = harness.node('session-id').textContent
    harness.node('search-input').value = '订单'
    harness.node('search-run').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/search', body: { query: '订单' } }])
    const matterRows = harness.node('search-matter-rows').children
    expect(matterRows).toHaveLength(1)
    expect(matterRows[0]!.textContent).toContain('命中：标题（本地记录）')
    expect(matterRows[0]!.textContent).toContain('稳定订单增长')
    const sessionRows = harness.node('search-session-rows').children
    expect(sessionRows[0]!.textContent).toContain('会话命中')
    expect(sessionRows[0]!.textContent).toContain('…订单口径…')
    expect(harness.node('search-session-state').textContent).toContain('检索可用：1 条命中。')
    expect(harness.node('search-note').textContent).toContain('命中只是文本，点击不会打开会话或加载正文。')
    // The session panel was untouched by the search read.
    expect(harness.node('session-id').textContent).toBe(sessionIdBefore)
  })

  it('keeps 不可用 and 无结果 as different sentences (US-087)', async () => {
    const unavailable = await bootSagePage(payload(outcome({ sessions: { state: 'unavailable', code: 'bridge-search-unavailable' } })))
    unavailable.node('search-input').value = '订单'
    unavailable.node('search-run').dispatch('click')
    await unavailable.settle()
    const unavailableText = unavailable.node('search-session-state').textContent
    expect(unavailableText).toContain('会话检索不可用：运行时没有挂载 dsh-session-query（这不是"无结果"；事项本地匹配不受影响）。')
    expect(unavailableText).not.toContain('没有命中的会话')
    expect(unavailable.node('search-matter-rows').children).toHaveLength(1)

    const empty = await bootSagePage(payload(outcome({ matters: [], sessions: { state: 'available', items: [], hasMore: false } })))
    empty.node('search-input').value = '订单'
    empty.node('search-run').dispatch('click')
    await empty.settle()
    const emptyText = empty.node('search-session-state').textContent
    expect(emptyText).toContain('没有命中的会话（"无结果"说的是这件事）。')
    expect(emptyText).not.toContain('不可用')

    const failed = await bootSagePage(payload(outcome({ sessions: { state: 'failed', code: 'bridge-provider-failed' } })))
    failed.node('search-input').value = '订单'
    failed.node('search-run').dispatch('click')
    await failed.settle()
    expect(failed.node('search-session-state').textContent).toContain('会话检索失败：bridge-provider-failed（这不是"无结果"）。')
  })

  it('notes 还有更多 when the page says so, and refuses an empty query without any request', async () => {
    const more = await bootSagePage(payload(outcome({ sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: 'x' }], hasMore: true } })))
    more.node('search-input').value = '订单'
    more.node('search-run').dispatch('click')
    await more.settle()
    expect(more.node('search-session-state').textContent).toContain('显示前 1 条，还有更多命中未列出。')

    const blank = await bootSagePage(payload(outcome()))
    blank.node('search-input').value = '   '
    blank.node('search-run').dispatch('click')
    await blank.settle()
    expect(blank.requests).toHaveLength(0)
    expect(blank.node('search-note').textContent).toContain('先写关键词再搜索。')
  })

  it('ignores clicks while a query is in flight — no duplicate concurrent searches', async () => {
    const harness = await bootSagePage(payload(outcome()))
    harness.node('search-input').value = '订单'
    // Two clicks in the same tick: the first starts the query, the second must be skipped.
    harness.node('search-run').dispatch('click')
    harness.node('search-run').dispatch('click')
    await harness.settle()
    expect(harness.requests).toHaveLength(1)
  })

  it('runs the same query from the keyboard (Enter)', async () => {
    const harness = await bootSagePage(payload(outcome()))
    harness.node('search-input').value = '订单'
    harness.node('search-input').dispatch('keydown', { key: 'Enter' })
    await harness.settle()
    expect(harness.requests).toEqual([{ path: '/.sage/search', body: { query: '订单' } }])
  })
})
