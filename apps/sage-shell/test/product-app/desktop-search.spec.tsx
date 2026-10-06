/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Instrument ownership for entry cleanup, but render every component with the real React root.
vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return { ...actual, createRoot: vi.fn(actual.createRoot) }
})

import type { DesktopBootstrapRead, DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
import { DesktopPage } from '../../src/product/app/desktop/page.js'

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const cleanups: Array<() => void> = []
const blocked: DesktopRead = { kind: 'blocked', code: 'projection-read-unavailable' }
const requests = vi.fn()
const unavailableBootstrap = async (): Promise<DesktopBootstrapRead> => ({ kind: 'unavailable', code: null })
const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertPreferencesController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}

function mount(): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(DesktopPage, {
      readState: async () => blocked,
      readBootstrap: unavailableBootstrap,
      preferencesController: inertPreferencesController,
    }))
  })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  return container
}

function node<T extends HTMLElement = HTMLElement>(container: HTMLElement, selector: string): T {
  const found = container.querySelector<T>(selector)
  expect(found, selector).not.toBeNull()
  return found!
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll('button')).find(item =>
    (item.getAttribute('aria-label') ?? item.textContent?.trim()) === label)
  expect(found, `button: ${label}`).toBeDefined()
  return found!
}

function click(element: HTMLElement): void {
  act(() => { element.click() })
}

function writeQuery(container: HTMLElement, value: string): HTMLTextAreaElement {
  const input = node<HTMLTextAreaElement>(container, 'textarea[aria-label="搜索查询"]')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  return input
}

function key(element: HTMLElement, keyValue: string, options: KeyboardEventInit = {}): KeyboardEvent {
  element.focus()
  const event = new KeyboardEvent('keydown', { key: keyValue, bubbles: true, cancelable: true, ...options })
  act(() => { document.activeElement!.dispatchEvent(event) })
  return event
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

async function openSearch(): Promise<HTMLElement> {
  const container = mount()
  await settle()
  click(button(container, '搜索'))
  expect(node(container, 'h1').textContent).toBe('搜索')
  return container
}

async function runSearch(container: HTMLElement, query: string): Promise<void> {
  writeQuery(container, query)
  click(button(container, '执行搜索'))
  await settle()
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  requests.mockReset()
  vi.stubGlobal('fetch', requests)
})

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('T03-D search page consumes the real search route', () => {
  it('renders a refused search with its own code and no result rows at all', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({ state: 'refused', code: 'search-unavailable' }))
    await runSearch(container, '运行时状态')
    const note = node(container, '.search-note')
    expect(note.textContent).toContain('搜索不可用')
    expect(note.textContent).toContain('search-unavailable')
    expect(container.querySelector('.search-hit')).toBeNull()
    expect(container.querySelector('.search-session')).toBeNull()
    expect(container.querySelector('.search-section')).toBeNull()
    expect(container.textContent).not.toContain('没有事项命中')
    expect(container.textContent).not.toContain('会话搜索不可用')
    expect(requests).toHaveBeenCalledTimes(1)
    expect(requests.mock.calls[0]?.[0]).toBe('/.sage/search')
    expect(requests.mock.calls[0]?.[1]?.method).toBe('POST')
  })

  it('renders the read result: matters with field labels and session snippets in service order', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({
      state: 'read', query: '运行时状态',
      matters: [
        { matterRef: 'm1', title: '一号事项', matchedField: 'goal' },
        { matterRef: 'm2', title: '二号事项', matchedField: 'deliverable' },
      ],
      sessions: {
        state: 'available', hasMore: true,
        items: [{ sessionId: 'sess-a', snippet: '第一段摘录' }, { sessionId: 'sess-b', snippet: '第二段摘录' }],
      },
    }))
    await runSearch(container, '  运行时状态  ')
    const hits = Array.from(container.querySelectorAll('.search-hit'))
    expect(hits).toHaveLength(2)
    expect(hits[0]?.textContent).toContain('一号事项')
    expect(hits[0]?.textContent).toContain('目标')
    expect(hits[1]?.textContent).toContain('二号事项')
    expect(hits[1]?.textContent).toContain('交付物')
    const sessions = Array.from(container.querySelectorAll('.search-session'))
    expect(sessions).toHaveLength(2)
    expect(sessions[0]?.textContent).toContain('sess-a')
    expect(sessions[0]?.textContent).toContain('第一段摘录')
    const sessionText = node(container, '.search-section[aria-label="会话"]').textContent ?? ''
    expect(sessionText.indexOf('第一段摘录')).toBeLessThan(sessionText.indexOf('第二段摘录'))
    expect(container.textContent).toContain('还有更多')
    // Exactly one POST carrying the trimmed, single-key body.
    expect(requests).toHaveBeenCalledTimes(1)
    const [, init] = requests.mock.calls[0] ?? []
    expect(init?.method).toBe('POST')
    expect(init?.headers?.['content-type']).toBe('application/json')
    expect(init?.cache).toBe('no-store')
    expect(init?.body).toBe(JSON.stringify({ query: '运行时状态' }))
    expect(Object.keys(JSON.parse(init?.body as string))).toEqual(['query'])
  })

  it('keeps an empty matter section distinct from an unavailable session engine', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({
      state: 'read', query: '运行时状态', matters: [],
      sessions: { state: 'unavailable', code: 'search-provider-unmounted' },
    }))
    await runSearch(container, '运行时状态')
    expect(container.textContent).toContain('没有事项命中')
    expect(container.textContent).toContain('会话搜索不可用（search-provider-unmounted）')
    expect(container.querySelector('.search-hit')).toBeNull()
    expect(container.querySelector('.search-session')).toBeNull()
    expect(container.textContent).not.toContain('没有会话命中')
  })

  it('renders a failed session search as a failure, never as an empty result', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({
      state: 'read', query: '运行时状态', matters: [],
      sessions: { state: 'failed', code: 'bridge-provider-failed' },
    }))
    await runSearch(container, '运行时状态')
    expect(container.textContent).toContain('会话搜索失败（bridge-provider-failed）')
    expect(container.textContent).not.toContain('没有会话命中')
    expect(container.querySelector('.search-session')).toBeNull()
  })

  it('refuses an unrecognised read shape instead of rendering partial results', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({ state: 'read' }))
    await runSearch(container, '运行时状态')
    expect(node(container, '.search-note').textContent).toContain('搜索不可用（search-result-unrecognised）')
    expect(container.querySelector('.search-hit')).toBeNull()
    expect(container.querySelector('.search-section')).toBeNull()
    // A malformed matchedField invalidates the whole read, not just that row.
    requests.mockResolvedValue(json({
      state: 'read', query: '运行时状态',
      matters: [{ matterRef: 'm1', title: '一号事项', matchedField: 'bogus' }],
      sessions: { state: 'available', items: [], hasMore: false },
    }))
    await runSearch(container, '运行时状态')
    expect(node(container, '.search-note').textContent).toContain('搜索不可用（search-result-unrecognised）')
    expect(container.querySelector('.search-hit')).toBeNull()
  })

  it('reports an unknown transport failure with no rows and no leaked error', async () => {
    const container = await openSearch()
    requests.mockRejectedValue(new Error('private-network-canary'))
    await runSearch(container, '运行时状态')
    expect(node(container, '.search-note').textContent).toContain('结果未知')
    expect(container.textContent).not.toContain('private-network-canary')
    expect(container.querySelector('.search-hit')).toBeNull()
    expect(container.querySelector('.search-section')).toBeNull()
  })

  it('answers a blank query locally without any request', async () => {
    const container = await openSearch()
    click(button(container, '执行搜索'))
    expect(node(container, '.search-note').textContent).toContain('请输入查询内容')
    const input = writeQuery(container, '   \n ')
    key(input, 'Enter')
    expect(requests).not.toHaveBeenCalled()
    expect(container.querySelector('.search-hit')).toBeNull()
    expect(container.querySelector('.search-section')).toBeNull()
  })

  it('submits on Enter (not IME) and replaces the previous result on the next query', async () => {
    const container = await openSearch()
    requests.mockResolvedValue(json({ state: 'refused', code: 'search-unavailable' }))
    const input = writeQuery(container, '第一问')
    const composing = key(input, 'Enter', { isComposing: true })
    expect(composing.defaultPrevented).toBe(false)
    expect(requests).not.toHaveBeenCalled()
    key(input, 'Enter')
    await settle()
    expect(node(container, '.search-note').textContent).toContain('search-unavailable')
    requests.mockResolvedValue(json({
      state: 'read', query: '第二问', matters: [], sessions: { state: 'available', items: [], hasMore: false },
    }))
    await runSearch(container, '第二问')
    expect(container.textContent).not.toContain('search-unavailable')
    expect(container.textContent).toContain('没有事项命中')
    expect(requests).toHaveBeenCalledTimes(2)
  })
})
