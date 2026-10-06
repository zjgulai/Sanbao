/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { MatterListRegion } from '../../src/product/app/matter-list-view.js'

/**
 * Batch 22 / P3 (ADR-0261): the matter list card renders from the region bridge only; its
 * generation-bound select calls the legacy down-bridge, and the filter is mirrored to the legacy
 * sidebar count through `__SAGE_APP_SET_MATTER_LIST_FILTER__`. Wire semantics stay in the legacy
 * script (test/matter-list-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')
const originalFilter = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_APP_SET_MATTER_LIST_FILTER__')

const item = (over: Record<string, unknown> = {}) => ({
  itemId: 'matter:a',
  matterRef: 'matter:a',
  title: '事项 A',
  partition: 'action',
  triggers: [],
  acceptanceCandidateCount: 0,
  lifecycle: 'active',
  updatedAt: '2026-10-03T10:00:00.000Z',
  ...over,
})

const activeContext = (over: Record<string, unknown> = {}) => ({
  state: 'active',
  contextGeneration: 7,
  matterId: 'matter:a',
  revisionId: 'revision:a.1',
  workspaceRef: 'workspace:a',
  frameGeneration: 3,
  ...over,
})

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-matter-list'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(MatterListRegion, { store, container })) })
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

const selectMatterContext = vi.fn(async () => ({ kind: 'selected' }) as { kind: string, noticeKind?: string, text?: string })
const setMatterListFilter = vi.fn((_showAll: boolean): void => undefined)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', { configurable: true, value: { selectMatterContext } })
  Object.defineProperty(globalThis, '__SAGE_APP_SET_MATTER_LIST_FILTER__', { configurable: true, value: setMatterListFilter })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  if (originalFilter === undefined) Reflect.deleteProperty(globalThis, '__SAGE_APP_SET_MATTER_LIST_FILTER__')
  else Object.defineProperty(globalThis, '__SAGE_APP_SET_MATTER_LIST_FILTER__', originalFilter)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('matter list card (React region)', () => {
  it('shows each action row with its trigger, groups only by the partition field, and counts from visible', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'matter-list', {
      kind: 'read',
      activeContext: activeContext(),
      slot: {
        items: [
          item({ itemId: 'receipt:1', matterRef: 'receipt:1', title: '稳定订单增长', triggers: [{ kind: 'pending-inputs', ref: 'receipt:1', count: 2 }] }),
          item({ itemId: 'draft:d-2', matterRef: null, title: '结果未知的创建', triggers: [{ kind: 'attempt-unknown', ref: 'c-unknown' }] }),
          item({ itemId: 'receipt:5', title: '普通进行中', partition: 'in-progress', updatedAt: '2026-10-02T07:00:00.000Z' }),
          item({ itemId: 'receipt:4', title: '有候选交付', partition: 'acceptance' }),
          item({ itemId: 'receipt:9', title: '未知分区', partition: 'mystery' }),
        ],
      },
    })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const actionRows = container.querySelectorAll('#matter-rows-action .sage-roster-row')
    expect(actionRows).toHaveLength(2)
    expect((actionRows[0] as HTMLElement).dataset.matterItem).toBe('receipt:1')
    expect(actionRows[0]?.textContent).toContain('触发：待继续输入 2 条（点「继续」才派发）')
    expect(actionRows[1]?.textContent).toContain('触发：建项结果未知（核对同一请求）— c-unknown')
    expect(container.querySelectorAll('#matter-rows-progress .sage-roster-row')).toHaveLength(1)
    expect(container.querySelector('#matter-rows-progress')?.textContent).toContain('最近更新 2026-10-02T07:00:00.000Z')
    expect(node(container, '#matter-count-acceptance').textContent).toBe('1')
    expect(node(container, '#matter-acceptance-note').textContent).toContain('待验收只显示计数：1 项有观察到的产物候选；分项验收与整体完成语义未收口，本版不定义。')
    expect(container.querySelector('#matter-rows-action')?.textContent).not.toContain('有候选交付')
    expect(node(container, '#matter-count-action').textContent).toBe('2')
    expect(node(container, '#matter-count-progress').textContent).toBe('1')
    expect(node(container, '#matter-list-note').textContent).toContain('默认不展开归档/完成；分区由 main 每次读取重新推导。')
    expect((node(container, '#matter-list-note') as HTMLElement).dataset.contextSelectionNote).toBe('ready')
  })

  it('keeps archived rows out of the default view, reveals them through the filter, and mirrors the filter up', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'matter-list', {
      kind: 'read',
      activeContext: activeContext(),
      slot: { items: [item({ itemId: 'receipt:1', matterRef: 'receipt:1' }), item({ itemId: 'receipt:old', matterRef: 'receipt:old', title: '已归档的事项', partition: 'in-progress', lifecycle: 'archived' })] },
    })
    expect(Array.from(container.querySelectorAll('#matter-rows-action .sage-roster-row')).map((row) => (row as HTMLElement).dataset.matterItem)).toEqual(['receipt:1'])
    expect(container.querySelectorAll('#matter-rows-progress .sage-roster-row')).toHaveLength(0)
    expect(setMatterListFilter).toHaveBeenLastCalledWith(false)

    act(() => { (node(container, '#matter-list-all') as HTMLInputElement).click() })
    const progressRows = container.querySelectorAll('#matter-rows-progress .sage-roster-row')
    expect(progressRows).toHaveLength(1)
    expect(progressRows[0]?.textContent).toContain('已归档（可恢复；≠停止执行）')
    expect(node(container, '#matter-list-note').textContent).toContain('显示全部（含归档/完成——本版还没有这类事实来源，与默认一致）。')
    expect(setMatterListFilter).toHaveBeenLastCalledWith(true)
  })

  it('words 未核验 without rows and dashes for the counts, and 还没有任何事项记录 when empty', () => {
    const coded = mountRegion()
    setRegion(coded.store, 'matter-list', { kind: 'unavailable', code: 'matter-list-locked', activeContext: null })
    expect(node(coded.container, '#matter-list-note').textContent).toContain('列表未核验：matter-list-locked（不显示仿造行——fixture 不当列表数据）。')
    expect(coded.container.querySelectorAll('#matter-rows-action .sage-roster-row')).toHaveLength(0)
    expect(coded.container.querySelectorAll('#matter-rows-progress .sage-roster-row')).toHaveLength(0)
    expect(node(coded.container, '#matter-count-action').textContent).toBe('—')
    expect(node(coded.container, '#matter-count-acceptance').textContent).toBe('—')

    const empty = mountRegion()
    setRegion(empty.store, 'matter-list', { kind: 'read', activeContext: activeContext(), slot: { items: [] } })
    expect(node(empty.container, '#matter-list-note').textContent).toContain('还没有任何事项记录（草案建项或出现待处理事实后才会出现在这里）。')
    expect(node(empty.container, '#matter-count-action').textContent).toBe('0')
  })

  it('marks the projected active matter, offers a control per visible matter, and posts one generation-bound select', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'matter-list', {
      kind: 'read',
      activeContext: activeContext(),
      slot: { items: [item({ itemId: 'matter:a', matterRef: 'matter:a' }), item({ itemId: 'matter:b', matterRef: 'matter:b', title: '事项 B', partition: 'in-progress' })] },
    })

    const active = container.querySelector('#matter-rows-action [data-matter-context-action]') as HTMLButtonElement
    const candidate = container.querySelector('#matter-rows-progress [data-matter-context-action]') as HTMLButtonElement
    expect(active.textContent).toBe('当前事项')
    expect(active.disabled).toBe(true)
    expect(active.dataset).toMatchObject({ matterContextAction: 'select', matterContextState: 'active', matterId: 'matter:a', contextGeneration: '7' })
    expect(candidate.textContent).toBe('选择事项')
    expect(candidate.disabled).toBe(false)
    expect(candidate.dataset).toMatchObject({ matterContextState: 'selectable', matterId: 'matter:b', contextGeneration: '7' })

    await act(async () => { candidate.click() })
    expect(selectMatterContext).toHaveBeenCalledWith('matter:b', 7)
    // The receipt does not mutate local truth: the unchanged projection still owns active.
    expect((container.querySelector('#matter-rows-progress [data-matter-context-action]') as HTMLButtonElement).textContent).toBe('选择事项')

    // Refused: the stable code lands in the dedicated list note with its dataset kind; buttons unchanged.
    selectMatterContext.mockResolvedValueOnce({ kind: 'notice', noticeKind: 'refused', text: '事项选择未完成：active-context-stale。' })
    await act(async () => { (container.querySelector('#matter-rows-progress [data-matter-context-action]') as HTMLButtonElement).click() })
    expect((node(container, '#matter-list-note') as HTMLElement).dataset.contextSelectionNote).toBe('refused')
    expect(node(container, '#matter-list-note').textContent).toContain('active-context-stale')
    expect((container.querySelector('#matter-rows-action [data-matter-context-action]') as HTMLButtonElement).textContent).toBe('当前事项')

    // A new generation clears the local sentence (projection stays the only truth).
    setRegion(store, 'matter-list', {
      kind: 'read',
      activeContext: activeContext({ contextGeneration: 8 }),
      slot: { items: [item({ itemId: 'matter:a', matterRef: 'matter:a' }), item({ itemId: 'matter:b', matterRef: 'matter:b', title: '事项 B', partition: 'in-progress' })] },
    })
    expect((node(container, '#matter-list-note') as HTMLElement).dataset.contextSelectionNote).toBe('ready')
    expect(node(container, '#matter-list-note').textContent).not.toContain('active-context-stale')
  })

  it('disables selection and says 未接线 when activeContext is missing or malformed', () => {
    const missing = mountRegion()
    setRegion(missing.store, 'matter-list', { kind: 'read', activeContext: null, slot: { items: [item({ itemId: 'matter:a', matterRef: 'matter:a' })] } })
    const controls = Array.from(missing.container.querySelectorAll('#matter-rows-action [data-matter-context-action]')) as HTMLButtonElement[]
    expect(controls).toHaveLength(1)
    expect(controls.every((control) => control.disabled)).toBe(true)
    expect((node(missing.container, '#matter-list-note') as HTMLElement).dataset.contextSelectionNote).toBe('unavailable')
    expect(node(missing.container, '#matter-list-note').textContent).toContain('事项选择未接线')
  })

  it('adds no selection control to unresolved or archived rows', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'matter-list', {
      kind: 'read',
      activeContext: activeContext({ state: 'inactive', contextGeneration: 4 }),
      slot: { items: [item({ itemId: 'draft:unknown', matterRef: null, title: '尚无事项标识' }), item({ itemId: 'matter:archived', matterRef: 'matter:archived', title: '已归档事项', lifecycle: 'archived' })] },
    })
    expect(container.querySelector('#matter-rows-action [data-matter-context-action]')).toBeNull()

    act(() => { (node(container, '#matter-list-all') as HTMLInputElement).click() })
    const archived = container.querySelector('#matter-rows-action [data-matter-item="matter:archived"]')
    expect(archived).not.toBeNull()
    expect(archived?.querySelector('[data-matter-context-action]')).toBeNull()
  })
})
