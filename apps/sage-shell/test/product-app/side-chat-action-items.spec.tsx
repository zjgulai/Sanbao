/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { ActionItemsRegion } from '../../src/product/app/action-items-view.js'
import { SideChatsRegion } from '../../src/product/app/side-chats-view.js'

/**
 * Batch 18 / P3 (ADR-0261): the side-chat card and the action-items card (records, corrections,
 * projects) render from the region bridge only; their explicit entries call the legacy
 * down-bridge actions. Wire semantics stay in the legacy script
 * (test/side-chat-action-items-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

const sideChatsRead = {
  state: 'read',
  items: [
    { sideChatId: 'sc-1', execution: 'idle', lastTurnEnd: 't1', createdAt: '2026-10-03T09:10:00.000Z', atSeq: null },
    { sideChatId: 'sc-2', execution: 'executing', lastTurnEnd: null, createdAt: '2026-10-03T09:20:00.000Z', atSeq: 4 },
  ],
}

const longOriginal = '这是一条明显超过四十个字符上限的原要求文本，用来验证选项标签截断与省略号的显示行为完全正确无误'
const actionItemsRead = {
  state: 'read',
  items: [
    { actionId: 'act-1', title: '补充渠道对比', state: 'in-progress', revision: 2, records: [{ recordNo: 1, at: '2026-10-03T09:30:00.000Z', basis: { revision: 2, title: '补充渠道对比', note: '登记时冻结' } }] },
    { actionId: 'act-2', title: '整理证据包', state: 'done', revision: 1, records: [] },
  ],
  corrections: [{
    correctionId: 'cor-1', text: '更正后的要求',
    original: { text: '原要求', at: '2026-10-03T08:00:00.000Z' },
    receipt: { state: 'pending-application', reason: 'queued' },
  }],
  originals: [
    { text: '把预算数字核对一下', at: '2026-10-03T09:00:00.000Z' },
    { text: longOriginal, at: '2026-10-03T09:02:00.000Z' },
  ],
  projectsState: 'read',
  projects: [{ projectRef: 'prj-1', name: '增长专项', matterRefs: ['matter:1'] }],
}

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(kind: 'side-chats' | 'action-items'): Mounted {
  const container = document.createElement('div')
  container.id = kind === 'side-chats' ? 'sage-region-side-chats' : 'sage-region-action-items'
  document.body.append(container)
  const store = createAppBridgeStore()
  const component = kind === 'side-chats'
    ? createElement(SideChatsRegion, { store, container })
    : createElement(ActionItemsRegion, { store, container })
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
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

const createSideChat = vi.fn(async () => '已派生侧聊 sc-9（子会话，独立上下文；主对话历史未改动）。')
const readSideChat = vi.fn(async () => ({ kind: 'read', transcript: [{ role: 'user', text: '侧聊里的问题' }, { role: 'assistant', text: '侧聊里的回答' }], execution: 'idle' }))
const sendSideChat = vi.fn(async () => ({ notice: '已发送到侧聊（受理≠执行；这条只在子会话里）。', transcript: [{ role: 'user', text: '侧聊里的问题' }, { role: 'assistant', text: '侧聊里的回答' }] }))
const returnSideChat = vi.fn(async () => '已把这段文本作为主对话输入发出（受理≠执行；侧聊历史未改动）。')
const createActionItem = vi.fn(async () => null)
const actionItemRowAction = vi.fn(async () => undefined)
const submitCorrection = vi.fn(async () => null)
const createProject = vi.fn(async () => null)
const assignProject = vi.fn(async () => null)
const unassignProject = vi.fn(async () => null)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { createSideChat, readSideChat, sendSideChat, returnSideChat, createActionItem, actionItemRowAction, submitCorrection, createProject, assignProject, unassignProject },
  })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('side-chat card (React region)', () => {
  it('lists the derived records with their own tags and the honest note', () => {
    const { container, store } = mountRegion('side-chats')
    setRegion(store, 'side-chats', { kind: 'read', slot: sideChatsRead })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#side-chat-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('侧聊 · 本轮已结束（t1）')
    expect(rows[0]?.textContent).toContain('sc-1（派生自 2026-10-03T09:10:00.000Z · 从最后一个完成轮）')
    expect(rows[1]?.textContent).toContain('侧聊 · 执行中')
    expect(rows[1]?.textContent).toContain('sc-2（派生自 2026-10-03T09:20:00.000Z · 锚点 4）')
    expect(Array.from(rows).map((row) => row.querySelector('[data-side-chat-action="view"]')?.textContent)).toEqual(['单独回看', '单独回看'])
    expect(node(container, '#side-chat-note').textContent).toBe('2 条侧聊记录（独立投影，不混排进主对话）。')

    setRegion(store, 'side-chats', { kind: 'read', slot: { state: 'read', items: [] } })
    expect(node(container, '#side-chat-note').textContent).toBe('还没有侧聊；派生一条不会改动主对话历史。')

    setRegion(store, 'side-chats', { kind: 'unavailable' })
    expect(container.getAttribute('data-region-state')).toBe('unavailable')
    expect(node(container, '#side-chat-note').textContent).toBe('侧聊未核验：这一版还没有接上侧聊记录。')
  })

  it('opens one record for review, sends only to the child, and returns through the explicit act', async () => {
    const { container, store } = mountRegion('side-chats')
    setRegion(store, 'side-chats', { kind: 'read', slot: sideChatsRead })

    await act(async () => { (container.querySelector('#side-chat-rows [data-side-chat-action="view"]') as HTMLButtonElement).click() })
    expect(readSideChat).toHaveBeenCalledWith('sc-1')
    const view = node(container, '#side-chat-view') as HTMLElement
    expect(view.hidden).toBe(false)
    expect(node(container, '#side-chat-view-label').textContent).toBe('侧聊内容 · sc-1（独立于主对话）')
    const transcript = container.querySelectorAll('#side-chat-transcript .sage-roster-row')
    expect(transcript).toHaveLength(2)
    expect(transcript[0]?.textContent).toBe('我（侧聊回显）侧聊里的问题')
    expect(transcript[1]?.textContent).toBe('助手 · 历史侧聊里的回答')

    const input = node(container, '#side-chat-input') as HTMLInputElement
    setNativeValue(input, '侧聊里的问题')
    await act(async () => { (node(container, '#side-chat-send') as HTMLButtonElement).click() })
    expect(sendSideChat).toHaveBeenCalledWith('sc-1', '侧聊里的问题')
    expect(node(container, '#side-chat-view-note').textContent).toBe('已发送到侧聊（受理≠执行；这条只在子会话里）。')

    setNativeValue(input, '带回的结论')
    await act(async () => { (node(container, '#side-chat-return') as HTMLButtonElement).click() })
    expect(returnSideChat).toHaveBeenCalledWith('sc-1', '带回的结论')
    expect(node(container, '#side-chat-view-note').textContent).toBe('已把这段文本作为主对话输入发出（受理≠执行；侧聊历史未改动）。')

    act(() => { (node(container, '#side-chat-view-close') as HTMLButtonElement).click() })
    expect(view.hidden).toBe(true)
  })

  it('derives from the chosen matter context through the down-bridge and shows its notice', async () => {
    const { container, store } = mountRegion('side-chats')
    setRegion(store, 'side-chats', { kind: 'read', slot: sideChatsRead })
    await act(async () => { (node(container, '#side-chat-create') as HTMLButtonElement).click() })
    expect(createSideChat).toHaveBeenCalledTimes(1)
    expect(node(container, '#side-chat-note').textContent).toBe('已派生侧聊 sc-9（子会话，独立上下文；主对话历史未改动）。')
    // A poll refresh does not overwrite the local sentence.
    setRegion(store, 'side-chats', { kind: 'read', slot: sideChatsRead })
    expect(node(container, '#side-chat-note').textContent).toContain('已派生侧聊 sc-9')
  })
})

describe('action-items card (React region)', () => {
  it('renders items, records of the current item, corrections and projects with their own words', () => {
    const { container, store } = mountRegion('action-items')
    setRegion(store, 'action-items', { kind: 'read', slot: actionItemsRead })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#action-item-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('补充渠道对比')
    expect(rows[0]?.textContent).toContain('进行中')
    expect(rows[0]?.textContent).toContain('第 2 版 · 记录 1 次')
    expect(rows[1]?.textContent).toContain('已完成（≠交付验收）')
    expect(rows[0]?.querySelector('[data-action-item-action="start"]')?.textContent).toBe('登记一次执行')
    expect(rows[1]?.querySelector('[data-action-item-action="start"]')).toBeNull()
    expect(rows[1]?.querySelector('[data-action-item-action="complete"]')?.textContent).toBe('标记完成')

    // Default current item is the last one (act-2): its record note is the empty sentence.
    expect(node(container, '#action-record-note').textContent).toBe('「整理证据包」还没有执行记录——完成只是状态变更，不代表执行成功。')

    // Select the first row: records follow.
    act(() => { (rows[0] as HTMLElement).click() })
    expect(node(container, '#action-record-note').textContent).toBe('「补充渠道对比」的执行记录（冻结登记当时的依据版本）：')
    const recordRows = container.querySelectorAll('#action-record-rows .sage-roster-row')
    expect(recordRows).toHaveLength(1)
    expect(recordRows[0]?.textContent).toContain('第 1 次')
    expect(recordRows[0]?.textContent).toContain('依据 第 2 版：「补充渠道对比」 · 登记时冻结')

    const correctionRows = container.querySelectorAll('#correction-rows .sage-roster-row')
    expect(correctionRows).toHaveLength(1)
    expect(correctionRows[0]?.textContent).toContain('更正后的要求')
    expect(correctionRows[0]?.textContent).toContain('关联原要求：「原要求」 · 2026-10-03T08:00:00.000Z')
    expect(correctionRows[0]?.textContent).toContain('待应用（在队列中，等一次安全派发）')

    const options = Array.from(container.querySelectorAll('#correction-original option'))
    expect(options).toHaveLength(2)
    expect(options[1]?.textContent).toBe(longOriginal.slice(0, 40) + '…')
    expect((node(container, '#correction-original') as HTMLSelectElement).value).toBe('1')

    const projectOptions = Array.from(container.querySelectorAll('#project-select option'))
    expect(projectOptions[0]?.textContent).toBe('增长专项（1 个事项）')
    const projectRows = container.querySelectorAll('#project-rows .sage-roster-row')
    expect(projectRows[0]?.textContent).toContain('1 个事项（引用同一事项记录，复制不了事实）')
    expect(projectRows[0]?.textContent).toContain('matter:1')

    const unavailable = mountRegion('action-items')
    setRegion(unavailable.store, 'action-items', { kind: 'unavailable' })
    expect(node(unavailable.container, '#action-item-note').textContent).toBe('未核验：这一版还没有接上行动项存储。')
  })

  it('posts the named row acts, creates items with the chosen context, and keeps receipts honest', async () => {
    const { container, store } = mountRegion('action-items')
    setRegion(store, 'action-items', { kind: 'read', slot: actionItemsRead })

    await act(async () => { (container.querySelector('#action-item-rows [data-action-item-action="start"]') as HTMLButtonElement).click() })
    const secondRow = Array.from(container.querySelectorAll('#action-item-rows .sage-roster-row'))[1] as HTMLElement
    await act(async () => { (secondRow.querySelector('[data-action-item-action="complete"]') as HTMLButtonElement).click() })
    expect(actionItemRowAction).toHaveBeenNthCalledWith(1, 'act-1', 'start')
    expect(actionItemRowAction).toHaveBeenNthCalledWith(2, 'act-2', 'complete')

    const title = node(container, '#action-item-title') as HTMLInputElement
    const body = node(container, '#action-item-body') as HTMLInputElement
    setNativeValue(title, '补充渠道对比')
    setNativeValue(body, '说明文本')
    await act(async () => { (node(container, '#action-item-create') as HTMLButtonElement).click() })
    expect(createActionItem).toHaveBeenCalledWith('补充渠道对比', '说明文本')

    createActionItem.mockResolvedValueOnce('先在「事项 ↔ 工作区关联」里选好事项：行动项属于某个事项。')
    await act(async () => { (node(container, '#action-item-create') as HTMLButtonElement).click() })
    expect(node(container, '#action-item-note').textContent).toContain('先在「事项 ↔ 工作区关联」里选好事项')
  })

  it('prefills the correction copy from the chosen original and submits the new linked message', async () => {
    const { container, store } = mountRegion('action-items')
    setRegion(store, 'action-items', { kind: 'read', slot: actionItemsRead })

    const select = node(container, '#correction-original') as HTMLSelectElement
    setNativeValue(select, '0')
    expect((node(container, '#correction-text') as HTMLTextAreaElement).value).toBe('把预算数字核对一下')

    await act(async () => { (node(container, '#correction-submit') as HTMLButtonElement).click() })
    expect(submitCorrection).toHaveBeenCalledWith({ text: '把预算数字核对一下', at: '2026-10-03T09:00:00.000Z' }, '把预算数字核对一下')

    submitCorrection.mockResolvedValueOnce('先选一条原要求（已发送的消息）。')
    await act(async () => { (node(container, '#correction-submit') as HTMLButtonElement).click() })
    expect(node(container, '#correction-note').textContent).toBe('先选一条原要求（已发送的消息）。')
  })

  it('creates projects and posts assign/unassign with the chosen refs', async () => {
    const { container, store } = mountRegion('action-items')
    setRegion(store, 'action-items', { kind: 'read', slot: actionItemsRead })

    const nameInput = node(container, '#project-name') as HTMLInputElement
    setNativeValue(nameInput, '增长专项')
    await act(async () => { (node(container, '#project-create') as HTMLButtonElement).click() })
    expect(createProject).toHaveBeenCalledWith('增长专项')

    const select = node(container, '#project-select') as HTMLSelectElement
    setNativeValue(select, 'prj-1')
    await act(async () => { (node(container, '#project-assign') as HTMLButtonElement).click() })
    expect(assignProject).toHaveBeenCalledWith('prj-1')
    await act(async () => { (node(container, '#project-unassign') as HTMLButtonElement).click() })
    expect(unassignProject).toHaveBeenCalledTimes(1)

    createProject.mockResolvedValueOnce('先写一个项目名（≤100 字）。')
    await act(async () => { (node(container, '#project-create') as HTMLButtonElement).click() })
    expect(node(container, '#project-note').textContent).toBe('先写一个项目名（≤100 字）。')
  })
})
