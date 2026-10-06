/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { SearchRegion } from '../../src/product/app/search-view.js'

/**
 * Batch 25 / P4 (ADR-0261): the search card renders from the client-local outcome of one
 * explicit read; its single act calls the legacy down-bridge. Wire semantics stay in the legacy
 * script (test/search-region-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-search'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(SearchRegion, { store, container })) })
  const entry: Mounted = {
    container,
    store,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
  mounted.push(entry)
  return entry
}

function node(container: HTMLElement, selector: string): Element {
  const found = container.querySelector(selector)
  expect(found, selector).not.toBeNull()
  return found as Element
}

function setNativeValue(element: Element, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
  act(() => { element.dispatchEvent(new Event('input', { bubbles: true })) })
}

function click(element: Element): void {
  act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

const outcome = (over: Record<string, unknown> = {}) => ({
  state: 'read',
  query: '订单',
  matters: [{ matterRef: 'receipt:1', title: '稳定订单增长', matchedField: 'goal' }],
  sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: '…订单口径…' }], hasMore: false },
  ...over,
})

const runSearch = vi.fn(async (_query: string) => ({ kind: 'read', outcome: outcome() }) as { kind: string, outcome?: Record<string, unknown>, notice?: string })

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', { configurable: true, value: { runSearch } })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('search card (React region)', () => {
  it('fires exactly one read, renders both sections as read-only text, and opens nothing', async () => {
    const { container } = mountRegion()
    setNativeValue(node(container, '#search-input'), '订单')
    await act(async () => { click(node(container, '#search-run')) })
    expect(runSearch).toHaveBeenCalledTimes(1)
    expect(runSearch).toHaveBeenCalledWith('订单')

    const matterRows = node(container, '#search-matter-rows').children
    expect(matterRows).toHaveLength(1)
    expect(matterRows[0]?.textContent).toContain('命中：标题（本地记录）')
    expect(matterRows[0]?.textContent).toContain('稳定订单增长')
    expect(matterRows[0]?.getAttribute('data-search-matter')).toBe('receipt:1')
    expect(matterRows[0]?.querySelector('button')).toBeNull()
    const sessionRows = node(container, '#search-session-rows').children
    expect(sessionRows[0]?.textContent).toContain('会话命中')
    expect(sessionRows[0]?.textContent).toContain('…订单口径…')
    expect(sessionRows[0]?.querySelector('button')).toBeNull()
    expect(node(container, '#search-session-state').textContent).toBe('检索可用：1 条命中。')
    expect(node(container, '#search-note').textContent).toBe('查询"订单"：事项 1 条命中；会话区见下。命中只是文本，点击不会打开会话或加载正文。')
  })

  it('keeps 不可用, 无结果 and 失败 as three different sentences (US-087), matter hits unaffected', async () => {
    const { container } = mountRegion()
    const input = node(container, '#search-input')
    setNativeValue(input, '订单')

    runSearch.mockResolvedValueOnce({ kind: 'read', outcome: outcome({ sessions: { state: 'unavailable', code: 'bridge-search-unavailable' } }) })
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-session-state').textContent).toBe('会话检索不可用：运行时没有挂载 dsh-session-query（这不是"无结果"；事项本地匹配不受影响）。')
    expect(node(container, '#search-matter-rows').children).toHaveLength(1)

    runSearch.mockResolvedValueOnce({ kind: 'read', outcome: outcome({ matters: [], sessions: { state: 'available', items: [], hasMore: false } }) })
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-session-state').textContent).toBe('检索可用：没有命中的会话（"无结果"说的是这件事）。')

    runSearch.mockResolvedValueOnce({ kind: 'read', outcome: outcome({ sessions: { state: 'failed', code: 'bridge-provider-failed' } }) })
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-session-state').textContent).toBe('会话检索失败：bridge-provider-failed（这不是"无结果"）。')
  })

  it('notes 还有更多 when the page says so, and refuses an empty query without calling the bridge', async () => {
    const { container } = mountRegion()
    setNativeValue(node(container, '#search-input'), '订单')
    runSearch.mockResolvedValueOnce({ kind: 'read', outcome: outcome({ sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: 'x' }], hasMore: true } }) })
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-session-state').textContent).toBe('检索可用：显示前 1 条，还有更多命中未列出。')

    const fresh = mountRegion()
    setNativeValue(node(fresh.container, '#search-input'), '   ')
    await act(async () => { click(node(fresh.container, '#search-run')) })
    expect(runSearch).toHaveBeenCalledTimes(1)
    expect(node(fresh.container, '#search-note').textContent).toBe('先写关键词再搜索。')
  })

  it('ignores clicks while a query is in flight — no duplicate concurrent searches', async () => {
    const { container } = mountRegion()
    setNativeValue(node(container, '#search-input'), '订单')
    let release: (value: { kind: string, outcome: Record<string, unknown> }) => void = () => undefined
    runSearch.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const button = node(container, '#search-run')
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(runSearch).toHaveBeenCalledTimes(1)
    expect((button as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { release({ kind: 'read', outcome: outcome() }) })
    expect((node(container, '#search-run') as HTMLButtonElement).disabled).toBe(false)
  })

  it('runs the same query from the keyboard (Enter)', async () => {
    const { container } = mountRegion()
    const input = node(container, '#search-input')
    setNativeValue(input, '订单')
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(runSearch).toHaveBeenCalledWith('订单')
  })

  it('clears a previous read when the answer is a refusal', async () => {
    const { container } = mountRegion()
    setNativeValue(node(container, '#search-input'), '订单')
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-matter-rows').children).toHaveLength(1)

    runSearch.mockResolvedValueOnce({ kind: 'notice', notice: '搜索被拒绝：bridge-search-unavailable。' })
    await act(async () => { click(node(container, '#search-run')) })
    expect(node(container, '#search-note').textContent).toBe('搜索被拒绝：bridge-search-unavailable。')
    expect(node(container, '#search-matter-rows').children).toHaveLength(0)
    expect(node(container, '#search-session-rows').children).toHaveLength(0)
    expect(node(container, '#search-session-state').textContent).toBe('')
  })
})
