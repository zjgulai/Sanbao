/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { MatterAdminRegion } from '../../src/product/app/matter-admin-view.js'
import { MatterGroupsRegion } from '../../src/product/app/matter-groups-view.js'

/**
 * Batch 21 / P3 (ADR-0261): the matter-admin card and the task-groups card render from the region
 * bridge only; their seven named acts call the legacy down-bridge. Wire semantics stay in the
 * legacy script (test/matter-admin-groups-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

const item = (overrides: Record<string, unknown> = {}) => ({ itemId: 'receipt:42', matterRef: 'receipt:42', title: '季度复盘', ...overrides })
const groupsSlot = (overrides: Record<string, unknown> = {}) => ({
  items: [item(), item({ itemId: 'm-2', matterRef: 'm-2', title: '外部对齐' })],
  groups: [{ groupId: 'grp-1', name: '交付跟进', memberIds: ['m-2'] }],
  batch: null,
  rename: null,
  trail: [],
  ...overrides,
})
const adminSlot = (overrides: Record<string, unknown> = {}) => ({
  items: [item(), item({ itemId: 'receipt:other', matterRef: 'receipt:other', title: '外部对齐' })],
  archived: ['receipt:other'],
  batch: null,
  rename: null,
  trail: [],
  ...overrides,
})

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(kind: 'matter-admin' | 'matter-groups'): Mounted {
  const container = document.createElement('div')
  container.id = kind === 'matter-admin' ? 'sage-region-matter-admin' : 'sage-region-matter-groups'
  document.body.append(container)
  const store = createAppBridgeStore()
  const component = kind === 'matter-admin'
    ? createElement(MatterAdminRegion, { store, container })
    : createElement(MatterGroupsRegion, { store, container })
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

/** React tracks the instance value setter; drive the prototype setter so onChange fires. */
function setNativeValue(element: Element, value: string): void {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

const archiveMatters = vi.fn(async () => null as string | null)
const restoreMatters = vi.fn(async () => null as string | null)
const renameMatter = vi.fn(async () => null as string | null)
const createGroup = vi.fn(async () => null as string | null)
const renameGroup = vi.fn(async () => null as string | null)
const removeGroup = vi.fn(async () => null as string | null)
const assignGroupMembers = vi.fn(async () => null as string | null)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { archiveMatters, restoreMatters, renameMatter, createGroup, renameGroup, removeGroup, assignGroupMembers },
  })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('matter-admin card (React region)', () => {
  it('renders rows with their archive state and the per-item batch verdicts', () => {
    const { container, store } = mountRegion('matter-admin')
    setRegion(store, 'matter-admin', { kind: 'read', slot: adminSlot({
      batch: {
        operation: 'restore',
        rows: [
          { matterRef: 'receipt:42', outcome: 'ok', code: null },
          { matterRef: 'receipt:ghost', outcome: 'refused', code: 'matter-unknown' },
        ],
        okCount: 1,
        refusedCount: 1,
      },
    }) })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#matter-admin-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('活动')
    expect(rows[1]?.textContent).toContain('已归档（可恢复；≠停止执行）')

    const batchRows = container.querySelectorAll('#matter-admin-batch-rows .sage-roster-row')
    expect(batchRows[0]?.textContent).toContain('共 2 项，成功 1、拒绝 1')
    expect(batchRows[0]?.textContent).toContain('无整体成功')
    expect(batchRows[1]?.textContent).toContain('该项成功')
    expect(batchRows[2]?.textContent).toContain('该项拒绝')
    expect(batchRows[2]?.textContent).toContain('查不到')

    const unavailable = mountRegion('matter-admin')
    setRegion(unavailable.store, 'matter-admin', { kind: 'unavailable' })
    expect(node(unavailable.container, '#matter-admin-note').textContent).toBe('未核验：这一版还没有接上事项管理存储。')
    expect(unavailable.container.querySelectorAll('#matter-admin-rows .sage-roster-row')).toHaveLength(0)
  })

  it('posts the archive and restore batches with the chosen selection and ground', async () => {
    const { container, store } = mountRegion('matter-admin')
    setRegion(store, 'matter-admin', { kind: 'read', slot: adminSlot() })

    // The preconditions live in the legacy actions: an empty selection still calls, and the notice comes back.
    archiveMatters.mockResolvedValueOnce('先勾选要归档的事项（可多选：批量逐项返回结果）。')
    await act(async () => { (node(container, '#matter-admin-archive') as HTMLButtonElement).click() })
    expect(archiveMatters).toHaveBeenCalledWith([], 'completed')
    expect(node(container, '#matter-admin-note').textContent).toBe('先勾选要归档的事项（可多选：批量逐项返回结果）。')

    const toggles = container.querySelectorAll('#matter-admin-rows [data-matter-admin-toggle]')
    act(() => { (toggles[0] as HTMLInputElement).click() })
    act(() => { (toggles[1] as HTMLInputElement).click() })
    setNativeValue(node(container, '#matter-admin-ground'), 'stopped')
    await act(async () => { (node(container, '#matter-admin-archive') as HTMLButtonElement).click() })
    expect(archiveMatters).toHaveBeenLastCalledWith(['receipt:42', 'receipt:other'], 'stopped')
    expect(node(container, '#matter-admin-note').textContent).toBe('')

    await act(async () => { (node(container, '#matter-admin-restore') as HTMLButtonElement).click() })
    expect(restoreMatters).toHaveBeenCalledWith(['receipt:42', 'receipt:other'])
  })

  it('renames exactly one selected matter and shows the service read-back, keeping the notice across a poll', async () => {
    const { container, store } = mountRegion('matter-admin')
    setRegion(store, 'matter-admin', { kind: 'read', slot: adminSlot({
      rename: { matterRef: 'receipt:42', requested: '季度复盘', effective: '季度复盘·财务口径', at: 't' },
    }) })
    expect(node(container, '#matter-admin-rename-note').textContent).toContain('服务回读生效「季度复盘·财务口径」')
    expect(node(container, '#matter-admin-rename-note').textContent).toContain('请求「季度复盘」')

    const toggle = container.querySelector('#matter-admin-rows [data-matter-admin-toggle]') as HTMLInputElement
    act(() => { toggle.click() })
    setNativeValue(node(container, '#matter-admin-rename-title'), '季度复盘（财务口径）')
    await act(async () => { (node(container, '#matter-admin-rename') as HTMLButtonElement).click() })
    expect(renameMatter).toHaveBeenCalledWith(['receipt:42'], '季度复盘（财务口径）')

    renameMatter.mockResolvedValueOnce('重命名未接线：正式记录由托管侧裁决，这一版还没有裁决通道。')
    await act(async () => { (node(container, '#matter-admin-rename') as HTMLButtonElement).click() })
    expect(node(container, '#matter-admin-rename-note').textContent).toContain('未接线')
    setRegion(store, 'matter-admin', { kind: 'read', slot: adminSlot() })
    expect(node(container, '#matter-admin-rename-note').textContent).toContain('未接线')
  })
})

describe('task-groups card (React region)', () => {
  it('renders matter rows with their group tags and group rows with the read-back count', () => {
    const { container, store } = mountRegion('matter-groups')
    setRegion(store, 'matter-groups', { kind: 'read', slot: groupsSlot() })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#matter-groups-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('未分组')
    expect(rows[1]?.textContent).toContain('分组：交付跟进')
    const groupRows = container.querySelectorAll('#matter-groups-list .sage-roster-row')
    expect(groupRows).toHaveLength(1)
    expect(groupRows[0]?.textContent).toContain('交付跟进')
    expect(groupRows[0]?.textContent).toContain('1 项（回读）')

    const unavailable = mountRegion('matter-groups')
    setRegion(unavailable.store, 'matter-groups', { kind: 'unavailable' })
    expect(node(unavailable.container, '#matter-groups-note').textContent).toBe('未核验：这一版还没有接上任务分组存储。')
    expect(unavailable.container.querySelectorAll('#matter-groups-rows .sage-roster-row')).toHaveLength(0)
  })

  it('creates only with a name, carries selected items as targets, and keeps single-pick semantics', async () => {
    const { container, store } = mountRegion('matter-groups')
    setRegion(store, 'matter-groups', { kind: 'read', slot: groupsSlot() })

    // Empty name still calls (precondition lives in the legacy act) and shows its notice.
    createGroup.mockResolvedValueOnce('先给分组起一个名字（建立是具名命令，不会隐式产生）。')
    await act(async () => { (node(container, '#matter-groups-create') as HTMLButtonElement).click() })
    expect(createGroup).toHaveBeenCalledWith('', [])
    expect(node(container, '#matter-groups-readback').textContent).toContain('不会隐式产生')

    const itemToggles = container.querySelectorAll('#matter-groups-rows [data-matter-group-toggle]')
    act(() => { (itemToggles[0] as HTMLInputElement).click() })
    setNativeValue(node(container, '#matter-groups-name'), '交付跟进')
    await act(async () => { (node(container, '#matter-groups-create') as HTMLButtonElement).click() })
    expect(createGroup).toHaveBeenLastCalledWith('交付跟进', ['receipt:42'])

    // Single-pick: picking the group marks it; clicking again clears it.
    const pick = container.querySelector('#matter-groups-list [data-matter-group-pick]') as HTMLInputElement
    act(() => { pick.click() })
    expect(pick.checked).toBe(true)
    act(() => { pick.click() })
    expect(pick.checked).toBe(false)
  })

  it('renames and removes only the picked group, and shows the read-back value rather than the request', async () => {
    const { container, store } = mountRegion('matter-groups')
    setRegion(store, 'matter-groups', { kind: 'read', slot: groupsSlot({
      rename: { groupId: 'grp-1', requested: '交付跟进v2', effective: '交付跟进·财务口径', at: 't' },
    }) })
    expect(node(container, '#matter-groups-readback').textContent).toContain('请求「交付跟进v2」')
    expect(node(container, '#matter-groups-readback').textContent).toContain('回读生效「交付跟进·财务口径」')

    await act(async () => { (node(container, '#matter-groups-rename') as HTMLButtonElement).click() })
    expect(renameGroup).not.toHaveBeenCalled()
    expect(node(container, '#matter-groups-readback').textContent).toContain('先在分组行勾选一个分组')

    act(() => { (container.querySelector('#matter-groups-list [data-matter-group-pick]') as HTMLInputElement).click() })
    setNativeValue(node(container, '#matter-groups-rename-title'), '交付跟进v3')
    await act(async () => { (node(container, '#matter-groups-rename') as HTMLButtonElement).click() })
    expect(renameGroup).toHaveBeenCalledWith('grp-1', '交付跟进v3')
    await act(async () => { (node(container, '#matter-groups-remove') as HTMLButtonElement).click() })
    expect(removeGroup).toHaveBeenCalledWith('grp-1')
  })

  it('adds and removes members as per-item batches over the picked group', async () => {
    const { container, store } = mountRegion('matter-groups')
    setRegion(store, 'matter-groups', { kind: 'read', slot: groupsSlot() })

    act(() => { (container.querySelector('#matter-groups-list [data-matter-group-pick]') as HTMLInputElement).click() })
    // With a group picked but no items selected, the act still runs and answers the empty-targets notice.
    assignGroupMembers.mockResolvedValueOnce('先勾选要入组的事项（可多选：批量逐项返回结果）。')
    await act(async () => { (node(container, '#matter-groups-add') as HTMLButtonElement).click() })
    expect(assignGroupMembers).toHaveBeenCalledWith('grp-1', 'add', [])
    expect(node(container, '#matter-groups-readback').textContent).toContain('先勾选要入组的事项')

    const itemToggles = container.querySelectorAll('#matter-groups-rows [data-matter-group-toggle]')
    act(() => { (itemToggles[0] as HTMLInputElement).click() })
    await act(async () => { (node(container, '#matter-groups-add') as HTMLButtonElement).click() })
    expect(assignGroupMembers).toHaveBeenLastCalledWith('grp-1', 'add', ['receipt:42'])

    act(() => { (itemToggles[1] as HTMLInputElement).click() })
    await act(async () => { (node(container, '#matter-groups-remove-members') as HTMLButtonElement).click() })
    expect(assignGroupMembers).toHaveBeenLastCalledWith('grp-1', 'remove', ['receipt:42', 'm-2'])
  })

  it('renders the membership batch row by row — counts plus per-row verdicts, no overall success', () => {
    const { container, store } = mountRegion('matter-groups')
    setRegion(store, 'matter-groups', { kind: 'read', slot: groupsSlot({
      batch: {
        operation: 'add',
        groupId: 'grp-1',
        rows: [
          { itemId: 'm-1', outcome: 'ok', code: null },
          { itemId: 'm-2', outcome: 'unchanged', code: 'already-member' },
          { itemId: 'ghost', outcome: 'refused', code: 'item-unknown' },
        ],
        okCount: 1,
        unchangedCount: 1,
        refusedCount: 1,
      },
    }) })
    const rows = container.querySelectorAll('#matter-groups-batch-rows .sage-roster-row')
    expect(rows[0]?.textContent).toContain('批量入组逐项结果：共 3 项，成功 1、未变化 1、拒绝 1')
    expect(rows[0]?.textContent).toContain('无整体成功')
    expect(rows[1]?.textContent).toContain('该项已变更')
    expect(rows[2]?.textContent).toContain('未变化：已在该分组')
    expect(rows[3]?.textContent).toContain('该项拒绝')
    expect(rows[3]?.textContent).toContain('查不到')
  })
})
