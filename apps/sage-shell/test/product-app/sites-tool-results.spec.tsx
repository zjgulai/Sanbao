/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { SitesRegion } from '../../src/product/app/sites-view.js'
import { ToolResultsRegion } from '../../src/product/app/tool-results-view.js'

/**
 * Batch 16 / P3 (ADR-0261): the web-deliverables catalog and the typed tool-result rows render
 * from the region bridge only; their explicit entries (version preview / checked external link)
 * call the legacy down-bridge actions. The wire semantics stay in the legacy script
 * (test/support-cards-bridge.spec.ts); this spec pins the DOM and the interaction contract
 * that the real Electron window repeats.
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT

const cards = [
  { artifactId: 'art-html', name: 'page.html', kind: 'html', bytes: 10, version: 'v3', state: 'ready', source: 'changes-observed', observedAt: 't' },
  { artifactId: 'art-md', name: 'notes.md', kind: 'markdown', bytes: 9, version: 'v1', state: 'ready', source: 'changes-observed', observedAt: 't' },
  { artifactId: 'art-absent', name: 'old.html', kind: 'html', version: 'v1', state: 'absent' },
]

const results = [
  { resultId: 'r1', tool: 'web.fetch', title: '抓取结果', at: '2026-10-03T10:00:00.000Z', state: 'read', fields: [{ kind: 'text', text: '正文第一行' }] },
  { resultId: 'r2', tool: 'web.fetch', title: '来源链接', at: 't', state: 'read', fields: [{ kind: 'link', label: '官方文档', host: 'docs.example.com', url: 'https://docs.example.com/guide' }] },
  { resultId: 'r3', tool: 'task', title: '图表输出', at: 't', state: 'read', fields: [{ kind: 'image', name: 'chart.png', artifactId: 'art-img', version: 'v7' }] },
  { resultId: 'r4', tool: 'db', title: '查询', at: 't', state: 'read', fields: [{ kind: 'key-values', entries: [{ name: 'Authorization', value: '（已脱敏）' }, { name: '状态码', value: '200' }] }] },
  { resultId: 'r5', tool: 'scene', title: '三维结果', at: 't', state: 'unsupported', declaredType: 'webgl-scene' },
]

const tableResult = {
  resultId: 'r6', tool: 'db', title: '明细', at: 't', state: 'read',
  fields: [{ kind: 'table', columns: ['列一', '列二'], rows: [['a', 'b'], ['c', 'd']] }],
}

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(kind: 'sites' | 'tool-results'): Mounted {
  const container = document.createElement('div')
  container.id = kind === 'sites' ? 'sage-region-sites' : 'sage-region-tool-results'
  document.body.append(container)
  const store = createAppBridgeStore()
  const component = kind === 'sites'
    ? createElement(SitesRegion, { store, container })
    : createElement(ToolResultsRegion, { store, container })
  const root = createRoot(container)
  act(() => { root.render(component) })
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

const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.restoreAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/** Flush a bridge message and its effects through the store. */
function setRegion(store: AppBridgeStore, region: string, message: unknown): void {
  act(() => { store.setRegion(region, message) })
}

interface ActionStubs {
  readonly openArtifact: ReturnType<typeof vi.fn>
  readonly openExternalLink: ReturnType<typeof vi.fn>
}

function stubActions(): ActionStubs {
  const openArtifact = vi.fn(async () => undefined)
  const openExternalLink = vi.fn(async () => '已交给系统浏览器打开（目标已校验：docs.example.com）；Sage 不读取浏览器内容、不跟踪操作。')
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { openArtifact, openExternalLink },
  })
  return { openArtifact, openExternalLink }
}

describe('web-deliverables catalog (React region)', () => {
  it('lists only web-kind cards with same-source version, state copy and the offline preview entry', () => {
    const { container, store } = mountRegion('sites')
    setRegion(store, 'sites', { kind: 'cards', cards })

    expect(container.getAttribute('data-region-state')).toBe('cards')
    const rows = container.querySelectorAll('#site-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('page.html')
    expect(rows[0]?.textContent).toContain('版本 v3')
    expect(rows[0]?.textContent).toContain('本机就绪（离线预览可用）')
    expect(rows[0]?.textContent).toContain('访问限制：仅本机离线预览（无发布/托管入口）')
    expect(rows[1]?.textContent).toContain('观察时不存在（保留上次版本标记）')
    expect(rows[1]?.querySelector('[data-artifact-action="open"]')).toBeNull()
    const open = node(container, '#site-rows [data-artifact-action="open"]')
    expect(open.textContent).toBe('预览（离线）')
    expect(open.getAttribute('data-artifact-id')).toBe('art-html')
    expect(node(container, '#site-note').textContent).toContain('共 2 项网页型成果（同源版本；访问限制：仅本机离线预览）。')
    expect(container.querySelectorAll('#site-rows button')).toHaveLength(1)
  })

  it('keeps the unwired and empty states honest', () => {
    const none = mountRegion('sites')
    setRegion(none.store, 'sites', { kind: 'unavailable' })
    expect(none.container.getAttribute('data-region-state')).toBe('unavailable')
    expect(none.container.querySelectorAll('#site-rows .sage-roster-row')).toHaveLength(0)
    expect(node(none.container, '#site-note').textContent).toBe('未核验：这一版还没有接上产物存储（目录不空报）。')

    const empty = mountRegion('sites')
    setRegion(empty.store, 'sites', { kind: 'cards', cards: [] })
    expect(node(empty.container, '#site-note').textContent).toBe('本机还没有网页型成果：目录只读，观察到 .html/.htm 文件变化后才会出现。')
  })

  it('opens the version preview through the legacy down-bridge and disables the button while pending', async () => {
    const actions = stubActions()
    let resolveOpen: (() => void) | undefined
    actions.openArtifact.mockImplementation(() => new Promise((resolve) => { resolveOpen = resolve }))
    const { container, store } = mountRegion('sites')
    setRegion(store, 'sites', { kind: 'cards', cards })

    const open = node(container, '#site-rows [data-artifact-action="open"]') as HTMLButtonElement
    act(() => { open.click() })
    expect(actions.openArtifact).toHaveBeenCalledWith('art-html')
    expect(open.disabled).toBe(true)
    await act(async () => { resolveOpen?.() })
    expect(open.disabled).toBe(false)
  })
})

describe('typed tool-result rows (React region)', () => {
  it('renders supported kinds locally, masks values, and names refused types without entries', () => {
    const { container, store } = mountRegion('tool-results')
    setRegion(store, 'tool-results', { kind: 'results', results })

    expect(container.getAttribute('data-region-state')).toBe('results')
    const rows = container.querySelectorAll('#tool-result-rows .sage-roster-row')
    expect(rows).toHaveLength(5)
    expect(rows[0]?.textContent).toContain('web.fetch · 抓取结果')
    expect(rows[0]?.querySelector('pre.sage-tool-text')?.textContent).toBe('正文第一行')
    expect(rows[1]?.querySelector('.sage-tool-link')?.textContent).toBe('官方文档 · docs.example.com')
    expect(rows[2]?.querySelector('.sage-tool-image')?.textContent).toBe('chart.png · 版本 v7')
    expect(rows[3]?.textContent).toContain('Authorization：（已脱敏）')
    expect(rows[3]?.textContent).toContain('状态码：200')
    expect(rows[4]?.textContent).toContain('不支持的类型：webgl-scene（已明确拒绝——不用替代内容渲染）。')
    expect(rows[4]?.querySelector('[data-tool-action]')).toBeNull()
    expect(rows[4]?.querySelector('[data-artifact-action]')).toBeNull()
    expect(node(container, '#tool-result-note').textContent).toContain('共 5 条结果（只读；可交互的只有：显式链接打开与按版本预览）。')
    const labels = Array.from(container.querySelectorAll('#tool-result-rows button')).map((button) => button.textContent)
    expect(labels).toEqual(['在系统浏览器打开（先校验）', '打开预览（按版本）'])
  })

  it('renders table fields with the shipped element shapes', () => {
    const { container, store } = mountRegion('tool-results')
    setRegion(store, 'tool-results', { kind: 'results', results: [tableResult] })
    const table = node(container, '#tool-result-rows table.sage-tool-table')
    expect(table.textContent).toContain('列一')
    expect(Array.from(table.querySelectorAll('tr')).map((row) => row.textContent)).toEqual(['列一列二', 'ab', 'cd'])
  })

  it('keeps the unwired and empty states honest', () => {
    const none = mountRegion('tool-results')
    setRegion(none.store, 'tool-results', { kind: 'unavailable' })
    expect(none.container.getAttribute('data-region-state')).toBe('unavailable')
    expect(none.container.querySelectorAll('#tool-result-rows .sage-roster-row')).toHaveLength(0)
    expect(node(none.container, '#tool-result-note').textContent).toBe('未核验：这一版还没有接上工具结果来源（provider 未接线；不用空列表冒充结果）。')

    const empty = mountRegion('tool-results')
    setRegion(empty.store, 'tool-results', { kind: 'results', results: [] })
    expect(node(empty.container, '#tool-result-note').textContent).toBe('本次运行还没有 typed 工具结果。')
  })

  it('opens external links through the legacy down-bridge and keeps the notice until the next action', async () => {
    const actions = stubActions()
    let resolveLink: ((notice: string) => void) | undefined
    actions.openExternalLink.mockImplementation(() => new Promise((resolve) => { resolveLink = resolve }))
    const { container, store } = mountRegion('tool-results')
    setRegion(store, 'tool-results', { kind: 'results', results })

    const link = node(container, '#tool-result-rows [data-tool-action="open-link"]') as HTMLButtonElement
    expect(link.getAttribute('data-link-url')).toBe('https://docs.example.com/guide')
    act(() => { link.click() })
    expect(actions.openExternalLink).toHaveBeenCalledWith('https://docs.example.com/guide')
    expect(link.disabled).toBe(true)
    // While the request is pending the payload note is the visible fact.
    expect(node(container, '#tool-result-note').textContent).toContain('共 5 条结果')
    await act(async () => { resolveLink?.('已交给系统浏览器打开（目标已校验：docs.example.com）；Sage 不读取浏览器内容、不跟踪操作。') })
    expect(link.disabled).toBe(false)
    expect(node(container, '#tool-result-note').textContent).toContain('已交给系统浏览器打开（目标已校验：docs.example.com）')

    // A payload refresh does not overwrite the local notice.
    setRegion(store, 'tool-results', { kind: 'results', results })
    expect(node(container, '#tool-result-note').textContent).toContain('已交给系统浏览器打开')

    // The next action clears it: the payload note shows again until the new answer lands.
    act(() => { link.click() })
    expect(node(container, '#tool-result-note').textContent).toContain('共 5 条结果')
    await act(async () => { resolveLink?.('未打开（响应无法识别）。') })
    expect(node(container, '#tool-result-note').textContent).toContain('未打开（响应无法识别）。')
  })

  it('opens image results as version previews through the same artifact action', async () => {
    const actions = stubActions()
    const { container, store } = mountRegion('tool-results')
    setRegion(store, 'tool-results', { kind: 'results', results })

    const open = node(container, '#tool-result-rows [data-artifact-action="open"]') as HTMLButtonElement
    expect(open.getAttribute('data-artifact-id')).toBe('art-img')
    await act(async () => { open.click() })
    expect(actions.openArtifact).toHaveBeenCalledWith('art-img')
  })
})
