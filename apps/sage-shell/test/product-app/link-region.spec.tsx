/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { LinkRegion } from '../../src/product/app/link-view.js'

/**
 * Batch 20 / P3 (ADR-0261): the link card (selector cluster) renders from the region bridge only;
 * its three named acts call the legacy down-bridge, and every selection change is pushed to the
 * legacy script through the `__SAGE_APP_SET_LINK_SELECTION__` up-bridge. Wire semantics stay in
 * the legacy script (test/link-region-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')
const originalUpBridge = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_APP_SET_LINK_SELECTION__')

const linkState = {
  state: 'read',
  links: [
    { matterRef: 'receipt:1', workspaceRef: 'ws-1', workspacePath: '/Users/someone/a', linkedAt: '2026-10-02T12:00:00.000Z', isDefault: true },
  ],
  trail: [
    { linkId: 'link-op-1', at: '2026-10-02T12:00:00.000Z', action: 'linked', matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' },
    { linkId: 'link-op-2', at: '2026-10-02T12:00:01.000Z', action: 'default-set', matterRef: 'receipt:1', workspaceRef: 'ws-1', actorRef: 'session:verified' },
  ],
  matters: [{ value: 'receipt:1', label: '季度复盘对外化　receipt:1' }],
  workspaces: [
    { value: 'ws-1', label: '经营分析　/Users/someone/a' },
    { value: 'ws-2', label: '产品资料　/Users/someone/b' },
  ],
}

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-link'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(LinkRegion, { store, container })) })
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
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

const addLink = vi.fn(async () => null as string | null)
const removeLink = vi.fn(async () => undefined)
const setDefaultLink = vi.fn(async () => undefined)
const setLinkSelection = vi.fn((_matterRef: string, _workspaceRef: string): void => undefined)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { addLink, removeLink, setDefaultLink },
  })
  Object.defineProperty(globalThis, '__SAGE_APP_SET_LINK_SELECTION__', { configurable: true, value: setLinkSelection })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  if (originalUpBridge === undefined) Reflect.deleteProperty(globalThis, '__SAGE_APP_SET_LINK_SELECTION__')
  else Object.defineProperty(globalThis, '__SAGE_APP_SET_LINK_SELECTION__', originalUpBridge)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('link card (React region)', () => {
  it('lists only linked entries with the default badge, renders the trail read-only, and notes the count', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'link', { kind: 'read', slot: linkState })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#link-rows .sage-roster-row')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('/Users/someone/a')
    expect(rows[0]?.textContent).toContain('事项 receipt:1')
    expect(rows[0]?.textContent).toContain('默认执行环境')
    expect(container.querySelector('#link-rows').textContent).not.toContain('/Users/someone/b')

    const trail = container.querySelectorAll('#link-trail .sage-roster-row')
    expect(trail).toHaveLength(2)
    expect(trail[0]?.textContent).toContain('建立关联')
    expect(trail[1]?.textContent).toContain('设为默认')
    expect(Array.from(trail).every((row) => row.querySelector('button, input') === null)).toBe(true)
    expect(node(container, '#link-note').textContent).toBe('操作记录 2 条（只读留痕）。')

    setRegion(store, 'link', { kind: 'read', slot: { ...linkState, trail: [] } })
    expect(node(container, '#link-note').textContent).toBe('还没有任何关联操作记录。')

    const unavailable = mountRegion()
    setRegion(unavailable.store, 'link', { kind: 'unavailable' })
    expect(unavailable.container.getAttribute('data-region-state')).toBe('unavailable')
    expect(node(unavailable.container, '#link-note').textContent).toBe('未核验：这一版还没有接上关联存储。')
    expect(unavailable.container.querySelectorAll('#link-rows .sage-roster-row')).toHaveLength(0)
  })

  it('renders the option rosters with their defaults and posts the chosen pair through the down-bridge', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'link', { kind: 'read', slot: linkState })

    const matterSelect = node(container, '#link-matter') as HTMLSelectElement
    const workspaceSelect = node(container, '#link-workspace') as HTMLSelectElement
    expect(Array.from(matterSelect.querySelectorAll('option')).map((option) => option.value)).toEqual(['receipt:1'])
    expect(matterSelect.querySelector('option')?.textContent).toBe('季度复盘对外化　receipt:1')
    expect(Array.from(workspaceSelect.querySelectorAll('option')).map((option) => option.value)).toEqual(['ws-1', 'ws-2'])
    expect(matterSelect.value).toBe('receipt:1')
    expect(workspaceSelect.value).toBe('ws-1')

    setNativeValue(workspaceSelect, 'ws-2')
    await act(async () => { (node(container, '#link-add') as HTMLButtonElement).click() })
    expect(addLink).toHaveBeenCalledWith('receipt:1', 'ws-2')
    await act(async () => { (node(container, '#link-remove') as HTMLButtonElement).click() })
    expect(removeLink).toHaveBeenCalledWith('receipt:1', 'ws-2')
    await act(async () => { (node(container, '#link-default') as HTMLButtonElement).click() })
    expect(setDefaultLink).toHaveBeenCalledWith('receipt:1', 'ws-2')

    addLink.mockResolvedValueOnce('先选好事项与工作区：关联不会自动替你挑一个。')
    await act(async () => { (node(container, '#link-add') as HTMLButtonElement).click() })
    expect(node(container, '#link-note').textContent).toBe('先选好事项与工作区：关联不会自动替你挑一个。')

    const empty = mountRegion()
    setRegion(empty.store, 'link', { kind: 'read', slot: { ...linkState, matters: [], workspaces: [] } })
    const emptyMatter = node(empty.container, '#link-matter') as HTMLSelectElement
    expect(emptyMatter.value).toBe('')
    expect(emptyMatter.querySelector('option')?.textContent).toBe('（本设备还没有已建项的事项）')
    expect((node(empty.container, '#link-workspace') as HTMLSelectElement).querySelector('option')?.textContent).toBe('（还没有已采纳的工作区）')
  })

  it('pushes every derived selection through the up-bridge so legacy actions never read the card DOM', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'link', { kind: 'read', slot: linkState })

    // Mount defaults derive to the first option; the same values the legacy fillSelect would pick.
    expect(setLinkSelection).toHaveBeenLastCalledWith('receipt:1', 'ws-1')

    setNativeValue(node(container, '#link-workspace'), 'ws-2')
    expect(setLinkSelection).toHaveBeenLastCalledWith('receipt:1', 'ws-2')

    // A refresh that drops the chosen workspace falls back to the first option, like fillSelect did.
    setRegion(store, 'link', { kind: 'read', slot: { ...linkState, workspaces: [linkState.workspaces[0]] } })
    expect(setLinkSelection).toHaveBeenLastCalledWith('receipt:1', 'ws-1')

    setRegion(store, 'link', { kind: 'unavailable' })
    expect(setLinkSelection).toHaveBeenLastCalledWith('', '')
  })
})
