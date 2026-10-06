import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Batch 25 / P4 (ADR-0261 strangler): the search card (`#search-*`) is owned by the React app.
 * The card has no projection slice — the legacy script publishes only the readiness fact through
 * `__SAGE_APP_SET_REGION__`, and the single `/.sage/search` POST plus its guards travel back
 * through `runSearch` on `__SAGE_LEGACY_ACTIONS__`. Rendering is pinned in
 * `test/product-app/search-region.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  runSearch?: (query: string) => Promise<{ kind: string, outcome?: Record<string, unknown>, notice?: string }>
}

let sink: RegionSink | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const outcome = (over: Record<string, unknown> = {}) => ({
  state: 'read',
  query: '订单',
  matters: [{ matterRef: 'receipt:1', title: '稳定订单增长', matchedField: 'goal' }],
  sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: '…订单口径…' }], hasMore: false },
  ...over,
})

describe('search region bridge (batch 25)', () => {
  it('publishes the readiness fact and leaves the card DOM unwritten', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({}))
    await page.refresh()
    expect(lastFor('search')).toEqual({ kind: 'read' })
    for (const id of ['search-input', 'search-run', 'search-note', 'search-session-state']) {
      expect(page.node(id).textContent, id).toBe('')
    }
    expect(page.node('search-matter-rows').children).toHaveLength(0)
    expect(page.node('search-session-rows').children).toHaveLength(0)
  })

  it('runs exactly one read with the trimmed query and hands the outcome back verbatim', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({}), { '/.sage/search': outcome() })
    const actions = legacyActions()
    const result = await actions.runSearch!('  订单  ')
    expect(page.requests).toEqual([{ path: '/.sage/search', body: { query: '订单' } }])
    expect(result.kind).toBe('read')
    expect(result.outcome).toMatchObject({ query: '订单' })
    expect((result.outcome as { matters: unknown[] }).matters).toHaveLength(1)
  })

  it('keeps the empty-query guard and the refusal/unreadable sentences on the wire', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({}), {
      '/.sage/search': (request: unknown) => (request as { query: string }).query === '拒绝'
        ? { state: 'refused', code: 'bridge-search-unavailable' }
        : null,
    })
    const actions = legacyActions()

    expect(await actions.runSearch!('   ')).toEqual({ kind: 'notice', notice: '先写关键词再搜索。' })
    expect(page.requests).toHaveLength(0)

    expect(await actions.runSearch!('拒绝')).toEqual({ kind: 'notice', notice: '搜索被拒绝：bridge-search-unavailable。' })
    expect(page.requests[0]).toEqual({ path: '/.sage/search', body: { query: '拒绝' } })

    expect(await actions.runSearch!('未知')).toEqual({ kind: 'notice', notice: '搜索没有返回可读结果。' })
    expect(page.requests[1]).toEqual({ path: '/.sage/search', body: { query: '未知' } })
  })

  it('keeps the card words pinned on the static first frame, and the legacy script off its DOM', () => {
    const html = renderSageDocument()
    const start = html.indexOf('id="sage-region-search"')
    const end = html.indexOf('id="panel-automation"')
    const block = html.slice(start, end)
    for (const pin of [
      'SEARCH · MATTERS LOCAL + SESSION CONTENT',
      '一次输入两区：',
      '不打开会话、不激活执行、不加载正文',
      '关键词',
      '搜索',
      '事项（本地匹配）',
      '会话（运行时检索）',
    ]) {
      expect(block, pin).toContain(pin)
    }
    for (const id of ['#search-input', '#search-run', '#search-note', '#search-matter-rows', '#search-session-state', '#search-session-rows']) {
      expect(html.includes("querySelector('" + id + "')"), id).toBe(false)
    }
    expect(html.includes('renderSearchOutcome'), 'renderSearchOutcome').toBe(false)
  })
})
