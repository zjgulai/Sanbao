/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { ArtifactRegion } from '../../src/product/app/artifact-view.js'
import { MonitorRegion } from '../../src/product/app/monitor-view.js'

/**
 * Batch 17 / P3 (ADR-0261): the run-monitor card and the artifact card render from the region
 * bridge only; their explicit entries (run-log cursor walk, observe/retry/close/fullscreen/window
 * preview requests) call the legacy down-bridge actions. The wire semantics stay in the legacy
 * script (test/monitor-artifact-bridge.spec.ts); this spec pins the DOM and interaction contract.
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

const runMonitorRead = {
  state: 'read', matterRef: 'matter:1',
  steps: { state: 'running', lastTurnEnd: null, observedRecords: 4, reason: null },
  budget: {
    reserved: { state: 'unknown', reason: 'usage-provider-unavailable' },
    consumed: { state: 'unknown', reason: 'usage-provider-unavailable' },
    billed: { state: 'unknown', reason: 'usage-provider-unavailable' },
  },
  device: { state: 'unknown', reason: 'device-binding-unavailable' },
  background: { state: 'unknown', reason: 'background-host-unavailable' },
  context: { state: 'unknown', reason: 'context-usage-unavailable', compaction: 'unknown' },
}

const card = (overrides: Record<string, unknown> = {}) => ({ artifactId: 'art-1', name: 'report.md', kind: 'markdown', bytes: 10, version: 'v7', state: 'ready', source: 'changes-observed', observedAt: 't', ...overrides })

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(kind: 'run-monitor' | 'artifacts'): Mounted {
  const container = document.createElement('div')
  container.id = kind === 'run-monitor' ? 'sage-region-run-monitor' : 'sage-region-artifacts'
  document.body.append(container)
  const store = createAppBridgeStore()
  const component = kind === 'run-monitor'
    ? createElement(MonitorRegion, { store, container })
    : createElement(ArtifactRegion, { store, container })
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

function setRegion(store: AppBridgeStore, region: string, message: unknown): void {
  act(() => { store.setRegion(region, message) })
}

const openArtifact = vi.fn(async () => undefined)
const observeArtifacts = vi.fn(async () => '已观察 3 条文件变化线索，核验后现有 2 张产物卡。')
const retryArtifactPreview = vi.fn(async () => undefined)
const closeArtifactPreview = vi.fn(async () => undefined)
const setArtifactFullscreen = vi.fn(async () => undefined)
const artifactWindow = vi.fn(async () => '已在独立窗口打开（同一版本引用；未重读、未重跑生成）。')
const runLogOpen = vi.fn(async () => ({ lines: [{ no: 1, text: '第 1 行' }, { no: 2, text: '第 2 行' }], append: false, notice: '已读到第 2 行（已到文件末尾；继续读取会续上后续追加）' }))
const runLogContinue = vi.fn(async () => ({ lines: [{ no: 3, text: '第 3 行' }], append: true, notice: '已读到第 3 行' }))

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { openArtifact, observeArtifacts, retryArtifactPreview, closeArtifactPreview, setArtifactFullscreen, artifactWindow, runLogOpen, runLogContinue },
  })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('run-monitor card (React region)', () => {
  it('renders the four axes with their own words and the run-log controls', () => {
    const { container, store } = mountRegion('run-monitor')
    setRegion(store, 'run-monitor', { kind: 'read', slot: runMonitorRead })

    expect(container.getAttribute('data-region-state')).toBe('read')
    expect(node(container, '#monitor-steps').textContent).toBe('执行中（会话有未结束的一轮）')
    expect(node(container, '#monitor-budget-reserved').textContent).toContain('未知≠零')
    expect(node(container, '#monitor-budget-consumed').textContent).toContain('未知')
    expect(node(container, '#monitor-budget-billed').textContent).toContain('未知')
    expect(node(container, '#monitor-device').textContent).toContain('离线≠运行取消')
    expect(node(container, '#monitor-background').textContent).toContain('面板开合不影响运行')
    expect(node(container, '#monitor-context').textContent).toContain('压缩不得泄漏私有侧聊')
    expect(node(container, '#monitor-toggle').textContent).toBe('收起面板')
    expect((node(container, '#run-log-path') as HTMLInputElement).value).toBe('logs/run.log')

    setRegion(store, 'run-monitor', { kind: 'read', slot: { ...runMonitorRead, steps: { state: 'idle', lastTurnEnd: 't', observedRecords: 6, reason: null } } })
    expect(node(container, '#monitor-steps').textContent).toBe('空闲（没有未结束的轮）')

    setRegion(store, 'run-monitor', { kind: 'unavailable' })
    expect(container.getAttribute('data-region-state')).toBe('unavailable')
    expect(node(container, '#monitor-steps').textContent).toBe('不可用（监控未读取）')
  })

  it('collapses as local view state that posts nothing and survives the poll', () => {
    const { container, store } = mountRegion('run-monitor')
    setRegion(store, 'run-monitor', { kind: 'read', slot: runMonitorRead })
    const toggle = node(container, '#monitor-toggle') as HTMLButtonElement
    const body = node(container, '#monitor-body') as HTMLElement

    act(() => { toggle.click() })
    expect(body.hidden).toBe(true)
    expect(toggle.textContent).toBe('展开面板')
    expect(openArtifact).not.toHaveBeenCalled()
    expect(runLogOpen).not.toHaveBeenCalled()

    setRegion(store, 'run-monitor', { kind: 'read', slot: runMonitorRead })
    expect(body.hidden).toBe(true)

    act(() => { toggle.click() })
    expect(body.hidden).toBe(false)
    expect(toggle.textContent).toBe('收起面板')
  })

  it('walks the log: open replaces the rows, continue appends, pending disables the buttons', async () => {
    const { container, store } = mountRegion('run-monitor')
    setRegion(store, 'run-monitor', { kind: 'read', slot: runMonitorRead })
    const open = node(container, '#run-log-open') as HTMLButtonElement
    const cont = node(container, '#run-log-continue') as HTMLButtonElement
    const rows = (): Element[] => Array.from(container.querySelectorAll('#run-log-rows .sage-roster-row'))
    const note = (): string => node(container, '#run-log-note').textContent ?? ''

    let resolveOpen: ((value: Awaited<ReturnType<typeof runLogOpen>>) => void) | undefined
    runLogOpen.mockImplementationOnce(() => new Promise((resolve) => { resolveOpen = resolve }))
    act(() => { open.click() })
    expect(runLogOpen).toHaveBeenCalledWith('logs/run.log')
    expect(open.disabled).toBe(true)
    await act(async () => { resolveOpen?.({ lines: [{ no: 1, text: '第 1 行' }, { no: 2, text: '第 2 行' }], append: false, notice: '已读到第 2 行（已到文件末尾；继续读取会续上后续追加）' }) })
    expect(open.disabled).toBe(false)
    expect(rows()).toHaveLength(2)
    expect(rows()[0]?.getAttribute('data-log-line-no')).toBe('1')
    expect(rows()[0]?.textContent).toBe('1第 1 行')
    expect(note()).toContain('已读到第 2 行')

    await act(async () => { cont.click() })
    expect(runLogContinue).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(3)
    expect(note()).toContain('已读到第 3 行')

    // A region refresh does not clear the read lines.
    setRegion(store, 'run-monitor', { kind: 'read', slot: runMonitorRead })
    expect(rows()).toHaveLength(3)
  })
})

describe('artifact card (React region)', () => {
  it('renders every card state with its own words and the type-shaped entries', () => {
    const { container, store } = mountRegion('artifacts')
    setRegion(store, 'artifacts', {
      kind: 'cards',
      cards: [
        card({ artifactId: 'a-1', name: 'ok.md' }),
        card({ artifactId: 'a-2', name: 'gone.txt', kind: 'text', state: 'absent' }),
        card({ artifactId: 'a-3', name: 'shaky.json', kind: 'code', state: 'unconfirmed' }),
        card({ artifactId: 'a-4', name: 'q3.xlsx', kind: 'office' }),
        card({ artifactId: 'a-5', name: 'raw.bin', kind: 'binary' }),
      ],
      preview: { state: 'closed' },
    })

    expect(container.getAttribute('data-region-state')).toBe('cards')
    const rows = container.querySelectorAll('#artifact-cards .sage-roster-row')
    expect(rows).toHaveLength(5)
    const textOf = (id: string): string => Array.from(rows).find((row) => row.getAttribute('data-artifact-card') === id)?.textContent ?? ''
    expect(textOf('a-1')).toContain('就绪（版本已核验）')
    expect(textOf('a-1')).toContain('ok.md')
    expect(textOf('a-2')).toContain('观察时不存在')
    expect(textOf('a-3')).toContain('未能核验（保留上一次观察）')
    expect(textOf('a-4')).toContain('本版无内置预览（不自动转换；不把可下载写成可预览）')
    expect(textOf('a-5')).toContain('本版不支持该格式')
    const actionsOf = (id: string): string[] => {
      const row = Array.from(rows).find((candidate) => candidate.getAttribute('data-artifact-card') === id)
      if (row === undefined) return []
      return Array.from(row.querySelectorAll('button')).map((button) => button.textContent ?? '')
    }
    expect(actionsOf('a-1')).toEqual(['打开预览（该版本）'])
    expect(actionsOf('a-4')).toEqual([])
    expect(actionsOf('a-5')).toEqual([])
    expect(node(container, '#artifact-note').textContent).toContain('5 张产物卡')
    const all = node(container, '#artifact-cards').textContent + node(container, '#artifact-note').textContent
    for (const banned of ['已读取', '已使用', '模型已看到', '已验收']) expect(all, banned).not.toContain(banned)

    const unavailable = mountRegion('artifacts')
    setRegion(unavailable.store, 'artifacts', { kind: 'unavailable' })
    expect(unavailable.container.getAttribute('data-region-state')).toBe('unavailable')
    expect(node(unavailable.container, '#artifact-note').textContent).toBe('未核验：这一版还没有接上产物观察端口。')
  })

  it('mirrors every preview state: closed, opening, ready with expand/window, failed with retry only when retryable', () => {
    const { container, store } = mountRegion('artifacts')
    const panel = node(container, '#artifact-preview')
    const previewNote = (): string => node(container, '#artifact-preview-note').textContent ?? ''

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'closed' } })
    expect(panel.getAttribute('data-preview-state')).toBe('closed')
    expect(previewNote()).toContain('未打开：卡片出现不会创建或加载预览。')
    expect((node(container, '#artifact-retry') as HTMLElement).hidden).toBe(true)

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'opening', name: 'report.md' } })
    expect(previewNote()).toContain('正在按卡片版本读取内容…')
    expect((node(container, '#artifact-close') as HTMLElement).hidden).toBe(false)

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: true, window: true } })
    expect(previewNote()).toContain('已在右侧容器打开：report.md（v7）。')
    expect(previewNote()).toContain('全屏查看：同一文档，未重新加载、未重读版本')
    expect(previewNote()).toContain('独立窗口已打开：同一文档、同一版本引用；关闭独立窗口不改产物记录')
    const expand = node(container, '#artifact-expand')
    expect(expand.textContent).toBe('退出全屏（返回侧栏）')
    expect(expand.getAttribute('data-expanded')).toBe('true')
    const windowButton = node(container, '#artifact-window')
    expect(windowButton.textContent).toBe('关闭独立窗口')
    expect(windowButton.getAttribute('data-window-open')).toBe('true')

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'failed', name: 'report.md', code: 'artifact-version-changed', retryable: true } })
    expect(previewNote()).toContain('打开失败：文件在打开前已变化（不会切到新版本）。（可对同一版本重试）')
    expect((node(container, '#artifact-retry') as HTMLElement).hidden).toBe(false)

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'failed', name: 'report.md', code: 'artifact-not-text', retryable: false } })
    expect((node(container, '#artifact-retry') as HTMLElement).hidden).toBe(true)

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card({ kind: 'csv', name: 'big.csv' })], preview: { state: 'failed', name: 'big.csv', code: 'artifact-too-large', retryable: true } })
    expect(previewNote()).toContain('超出本版预览上限：文件超出实测处理上限，未解析显示')
    expect(previewNote()).not.toContain('解析失败')

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card({ kind: 'csv', name: 'broken.csv' })], preview: { state: 'failed', name: 'broken.csv', code: 'artifact-csv-parse-failed', retryable: false } })
    expect(previewNote()).toContain('CSV 解析失败：结构无法解析，未显示表格（这不是"空文件"）')
    expect(previewNote()).not.toContain('超出本版预览上限')
  })

  it('runs the explicit entries through the down-bridge and keeps the local notice across polls', async () => {
    const { container, store } = mountRegion('artifacts')
    setRegion(store, 'artifacts', { kind: 'cards', cards: [card({ artifactId: 'a-open' })], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: false, window: false } })

    const open = container.querySelector('#artifact-cards [data-artifact-action="open"]') as HTMLButtonElement
    await act(async () => { open.click() })
    expect(openArtifact).toHaveBeenCalledWith('a-open')

    await act(async () => { (node(container, '#artifact-observe') as HTMLButtonElement).click() })
    expect(observeArtifacts).toHaveBeenCalledTimes(1)
    expect(node(container, '#artifact-note').textContent).toContain('已观察 3 条文件变化线索，核验后现有 2 张产物卡。')

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card({ artifactId: 'a-open' })], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: false, window: false } })
    expect(node(container, '#artifact-note').textContent).toContain('已观察 3 条')

    await act(async () => { (node(container, '#artifact-retry') as HTMLButtonElement).click() })
    await act(async () => { (node(container, '#artifact-close') as HTMLButtonElement).click() })
    expect(retryArtifactPreview).toHaveBeenCalledTimes(1)
    expect(closeArtifactPreview).toHaveBeenCalledTimes(1)

    await act(async () => { (node(container, '#artifact-expand') as HTMLButtonElement).click() })
    expect(setArtifactFullscreen).toHaveBeenCalledWith(true)
  })

  it('restores focus to the expand trigger when leaving full view', async () => {
    const { container, store } = mountRegion('artifacts')
    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: true, window: false } })
    const expand = node(container, '#artifact-expand') as HTMLButtonElement
    expand.focus()
    await act(async () => { expand.click() })
    expect(setArtifactFullscreen).toHaveBeenCalledWith(false)
    expect(document.activeElement).toBe(expand)
  })

  it('opens and closes the separate window through the down-bridge with the returned notice', async () => {
    const { container, store } = mountRegion('artifacts')
    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: false, window: false } })
    const windowButton = node(container, '#artifact-window') as HTMLButtonElement
    await act(async () => { windowButton.click() })
    expect(artifactWindow).toHaveBeenCalledWith('open')
    expect(node(container, '#artifact-note').textContent).toContain('已在独立窗口打开（同一版本引用；未重读、未重跑生成）。')

    setRegion(store, 'artifacts', { kind: 'cards', cards: [card()], preview: { state: 'ready', name: 'report.md', version: 'v7', expanded: false, window: true } })
    artifactWindow.mockResolvedValueOnce('已关闭独立窗口（回到侧栏容器；未改产物记录，运行不受影响）。')
    await act(async () => { (node(container, '#artifact-window') as HTMLButtonElement).click() })
    expect(artifactWindow).toHaveBeenLastCalledWith('close')
    expect(node(container, '#artifact-note').textContent).toContain('已关闭独立窗口')
  })
})
