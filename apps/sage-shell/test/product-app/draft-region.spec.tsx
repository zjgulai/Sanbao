/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { DraftRegion } from '../../src/product/app/draft-view.js'

/**
 * Batch 23 / P3 (ADR-0261): the draft card (pipeline, identity default, attempt entries, the
 * single pre-execution confirmation card, converted matters and the site-template panel) renders
 * from the region bridge only; its six acts call the legacy down-bridge. Wire semantics stay in
 * the legacy script (test/draft-region-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')
const originalFields = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_APP_SET_DRAFT_FIELDS__')

const draft = (overrides: Record<string, unknown> = {}) => ({
  draftId: 'draft-1',
  fields: { goal: '', deliverable: '', responsibility: '', projectRef: '' },
  clarification: '',
  history: [{ entryId: 'entry-1', text: '帮我把季度复盘整理成对外的交付说明', selected: false }],
  status: 'editing',
  matterRef: null,
  complete: false,
  createdAt: '2026-10-02T12:00:00.000Z',
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...overrides,
})

const readSlot = (drafts: unknown[], overrides: Record<string, unknown> = {}) => ({
  kind: 'read',
  slot: {
    drafts,
    auth: { status: 'signed-out', displayName: null },
    siteTemplates: { state: 'read', reason: null, entries: [] },
    ...overrides,
  },
})

const templateEntry = { templateId: 'tpl-1', name: '数字粒子 · 企业官网', source: 'sage-builtin', version: '1', prompt: '请为一个企业官网生成落地页：主视觉用数字粒子、文案聚焦一句话价值。' }

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-draft'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(DraftRegion, { store, container })) })
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
    : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
  act(() => {
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

const confirmationCard = {
  confirmationId: 'cf-1',
  preparedAt: '2026-10-02T21:00:00.000Z',
  target: { matterRef: 'draft:draft-1', revisionRef: 'draft-revision:1' },
  action: { type: 'create-matter', scope: 'revision' },
  resources: [{ kind: 'execution-environment', ref: null, state: 'not-selected' }],
  prerequisites: [{ name: 'execution-environment', state: 'unknown', note: 'no-environment-chosen' }],
  costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
  effect: 'not-yet-happened',
}

const sendDraft = vi.fn(async () => null as string | null)
const saveDraft = vi.fn(async () => undefined)
const reconcileDraft = vi.fn(async () => undefined)
const cancelDraftAttempt = vi.fn(async () => undefined)
const prepareDraftConfirm = vi.fn(async () => ({ kind: 'prepared', card: confirmationCard }) as { kind: string, card?: unknown, notice?: string })
const executeDraftConvert = vi.fn(async () => ({ kind: 'ok' }) as { kind: string, notice?: string })
const setDraftFields = vi.fn((_fields: unknown): void => undefined)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { sendDraft, saveDraft, reconcileDraft, cancelDraftAttempt, prepareDraftConfirm, executeDraftConvert },
  })
  Object.defineProperty(globalThis, '__SAGE_APP_SET_DRAFT_FIELDS__', { configurable: true, value: setDraftFields })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  if (originalFields === undefined) Reflect.deleteProperty(globalThis, '__SAGE_APP_SET_DRAFT_FIELDS__')
  else Object.defineProperty(globalThis, '__SAGE_APP_SET_DRAFT_FIELDS__', originalFields)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('draft surface (React region)', () => {
  it('keeps the confirm entry disabled until the service says complete, and never auto-fills the fields', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft()]))
    expect(node(container, '#draft-lock').textContent).toContain('已解锁')
    expect((node(container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(node(container, '#draft-confirm').textContent).toBe('确认建项')
    expect((node(container, '#draft-deliverable') as HTMLInputElement).value).toBe('')
    expect((node(container, '#draft-responsibility') as HTMLInputElement).value).toBe('')
    expect((node(container, '#draft-goal') as HTMLInputElement).value).toBe('')
    const rows = container.querySelectorAll('#draft-history .sage-roster-row')
    expect(rows).toHaveLength(1)
    expect((rows[0] as HTMLElement).dataset.historyEntryId).toBe('entry-1')
    expect((rows[0]?.querySelector('[data-history-toggle]') as HTMLInputElement).checked).toBe(false)

    // A fresh mount mirrors the legacy first render (a same-updatedAt poll must not re-sync).
    const complete = mountRegion()
    setRegion(complete.store, 'draft', readSlot([draft({ complete: true, fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' } })]))
    expect((node(complete.container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(false)
    expect((node(complete.container, '#draft-goal') as HTMLInputElement).value).toBe('季度复盘')
    expect((node(complete.container, '#draft-responsibility') as HTMLInputElement).value).toBe('role:owner')
  })

  it('does not wipe a field the user is typing while the poll reports the same draft', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft()]))
    setNativeValue(node(container, '#draft-deliverable'), '正在输入')
    setRegion(store, 'draft', readSlot([draft()]))
    expect((node(container, '#draft-deliverable') as HTMLInputElement).value).toBe('正在输入')
  })

  it('posts the raw input on send, the typed fields on save, and asks for the confirmation card on confirm', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    setNativeValue(node(container, '#draft-input'), '新的一段需求')
    await act(async () => { (node(container, '#draft-send') as HTMLButtonElement).click() })
    expect(sendDraft).toHaveBeenCalledWith('新的一段需求')

    setNativeValue(node(container, '#draft-goal'), '目标 A')
    setNativeValue(node(container, '#draft-deliverable'), '交付 B')
    setNativeValue(node(container, '#draft-responsibility'), 'role:owner')
    setNativeValue(node(container, '#draft-project'), 'project:q3')
    setNativeValue(node(container, '#draft-clarification'), '还想确认口径')
    await act(async () => { (node(container, '#draft-save') as HTMLButtonElement).click() })
    expect(saveDraft).toHaveBeenCalledWith('draft-1', { goal: '目标 A', deliverable: '交付 B', responsibility: 'role:owner', projectRef: 'project:q3' }, '还想确认口径', [])

    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    expect(prepareDraftConfirm).toHaveBeenCalledWith('draft-1')
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(false)
  })

  it('carries only the checked history entries into the save request', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ history: [
      { entryId: 'entry-1', text: '第一条前史', selected: false },
      { entryId: 'entry-2', text: '第二条前史', selected: false },
    ] })]))
    const toggles = container.querySelectorAll('#draft-history [data-history-toggle]')
    expect(toggles).toHaveLength(2)
    act(() => { (toggles[1] as HTMLInputElement).click() })
    await act(async () => { (node(container, '#draft-save') as HTMLButtonElement).click() })
    expect(saveDraft).toHaveBeenCalledWith('draft-1', expect.anything(), expect.anything(), ['entry-2'])
  })

  it('shows a converted draft as built in place, with the service receipt and no second confirm', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ status: 'converted', matterRef: 'receipt:42', complete: true, fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: 'role:owner', projectRef: '' } })]))
    expect((node(container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(node(container, '#draft-confirm').textContent).toContain('不重复创建')
    expect(node(container, '#draft-result').textContent).toContain('receipt:42')
    expect(node(container, '#draft-result').textContent).toContain('来自服务回执')
    const matters = container.querySelectorAll('#draft-matters .sage-roster-row')
    expect(matters).toHaveLength(1)
    expect((matters[0] as HTMLElement).dataset.matterRef).toBe('receipt:42')
  })

  it('says locked while signed out and hides the whole editing area; refuses an empty send', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', { kind: 'locked' })
    expect(node(container, '#draft-lock').textContent).toContain('已锁定')
    expect(node(container, '#draft-note').textContent).toContain('重新登录并获准后才会恢复显示')
    expect((node(container, '#draft-detail') as HTMLElement).hidden).toBe(true)
    expect((node(container, '#draft-send') as HTMLButtonElement).disabled).toBe(true)

    const unlocked = mountRegion()
    setRegion(unlocked.store, 'draft', readSlot([draft()]))
    setNativeValue(node(unlocked.container, '#draft-input'), '   ')
    await act(async () => { (node(unlocked.container, '#draft-send') as HTMLButtonElement).click() })
    // The whitespace guard is component-local (same as the legacy click handler): no act is sent.
    expect(sendDraft).not.toHaveBeenCalled()
    expect(node(unlocked.container, '#draft-note').textContent).toContain('先写一句需求')
  })
})

describe('creation attempt entries (React region)', () => {
  const attempt = (state: string) => ({ correlation: 'c-1', at: '2026-10-02T12:00:00.000Z', state })

  it('offers 核对 and no retry while the outcome is unknown', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true, attempt: attempt('unknown') })]))
    expect(node(container, '#draft-attempt').textContent).toContain('结果未知')
    expect(node(container, '#draft-attempt').textContent).toContain('不要重复建项')
    expect((node(container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(node(container, '#draft-confirm').textContent).toContain('不重复建项')
    expect((node(container, '#draft-reconcile') as HTMLElement).hidden).toBe(false)
    expect((node(container, '#draft-cancel') as HTMLElement).hidden).toBe(true)

    await act(async () => { (node(container, '#draft-reconcile') as HTMLButtonElement).click() })
    expect(reconcileDraft).toHaveBeenCalledWith('draft-1')
  })

  it('lets a pending attempt be waited on or cancelled, without losing content', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true, attempt: attempt('pending'), clarification: '还想确认口径', fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: 'p' } })]))
    expect(node(container, '#draft-attempt').textContent).toContain('创建中')
    expect(node(container, '#draft-attempt').textContent).toContain('草案内容不会丢')
    expect((node(container, '#draft-cancel') as HTMLElement).hidden).toBe(false)
    expect((node(container, '#draft-reconcile') as HTMLElement).hidden).toBe(true)
    expect((node(container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(true)

    await act(async () => { (node(container, '#draft-cancel') as HTMLButtonElement).click() })
    expect(cancelDraftAttempt).toHaveBeenCalledWith('draft-1')
    expect((node(container, '#draft-goal') as HTMLInputElement).value).toBe('g')
    expect((node(container, '#draft-clarification') as HTMLTextAreaElement).value).toBe('还想确认口径')
  })

  it('lets a failed attempt be corrected and re-confirmed in place; shows nothing when none opened', () => {
    const failed = mountRegion()
    setRegion(failed.store, 'draft', readSlot([draft({ complete: true, attempt: attempt('failed') })]))
    expect(node(failed.container, '#draft-attempt').textContent).toContain('确定失败')
    expect(node(failed.container, '#draft-attempt').textContent).toContain('修正后再次确认')
    expect((node(failed.container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(false)
    expect((node(failed.container, '#draft-reconcile') as HTMLElement).hidden).toBe(true)
    expect((node(failed.container, '#draft-cancel') as HTMLElement).hidden).toBe(true)

    const none = mountRegion()
    setRegion(none.store, 'draft', readSlot([draft({ complete: true })]))
    expect(node(none.container, '#draft-attempt').textContent).toBe('')
    expect((node(none.container, '#draft-reconcile') as HTMLElement).hidden).toBe(true)
    expect((node(none.container, '#draft-cancel') as HTMLElement).hidden).toBe(true)
  })
})

describe('the pre-execution confirmation card (React region)', () => {
  it('shows the single card: object, action, scope, resources, time, prerequisites, honest cost line', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true, fields: { goal: 'g', deliverable: 'd', responsibility: 'r', projectRef: '' } })]))
    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    expect(prepareDraftConfirm).toHaveBeenCalledWith('draft-1')
    const region = node(container, '#draft-confirmation') as HTMLElement
    expect(region.hidden).toBe(false)
    expect(node(container, '#confirm-target').textContent).toContain('draft:draft-1')
    expect(node(container, '#confirm-action').textContent).toContain('create-matter')
    expect(node(container, '#confirm-scope').textContent).toContain('本修订')
    expect(node(container, '#confirm-resources').textContent).toContain('未选定')
    expect(node(container, '#confirm-time').textContent).toBe('2026-10-02T21:00:00.000Z')
    expect(node(container, '#confirm-prerequisites').textContent).toContain('未断言')
    expect(node(container, '#confirm-cost').textContent).toContain('暂不可得')
  })

  it('keeps the card across a poll and posts the credential once on 确认执行', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(false)
    await act(async () => { (node(container, '#draft-confirm-execute') as HTMLButtonElement).click() })
    expect(executeDraftConvert).toHaveBeenCalledWith('draft-1', 'cf-1')
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(true)
  })

  it('cancels the card locally without calling the service', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    await act(async () => { (node(container, '#draft-confirm-cancel') as HTMLButtonElement).click() })
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(true)
    expect(executeDraftConvert).not.toHaveBeenCalled()
  })

  it('turns a stale confirmation into an explicit re-confirm notice that survives the poll', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    executeDraftConvert.mockResolvedValueOnce({ kind: 'notice', notice: '确认已失效：动作、前提或版本已变化——请重新确认（旧卡不能沿用）。' })
    await act(async () => { (node(container, '#draft-confirm-execute') as HTMLButtonElement).click() })
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(true)
    expect(node(container, '#draft-note').textContent).toContain('失效')
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    expect(node(container, '#draft-note').textContent).toContain('失效')
    expect((node(container, '#draft-confirm') as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the refusal when no card can be minted, and never pretends a card exists', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft({ complete: true })]))
    prepareDraftConfirm.mockResolvedValueOnce({ kind: 'notice', notice: '执行前确认卡暂不可得：这一版还没有确认来源，建项暂不可派发。' })
    await act(async () => { (node(container, '#draft-confirm') as HTMLButtonElement).click() })
    expect(node(container, '#draft-note').textContent).toContain('确认')
    expect((node(container, '#draft-confirmation') as HTMLElement).hidden).toBe(true)
  })
})

describe('the responsibility identity default (React region)', () => {
  const withAuth = (auth: { status: string, displayName: string | null }, drafts: unknown[]) => ({
    kind: 'read',
    slot: { drafts, auth, siteTemplates: { state: 'read', reason: null, entries: [] } },
  })

  it('fills the default from the signed-in projection and keeps it editable', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', withAuth({ status: 'signed-in', displayName: '林一' }, [draft()]))
    expect((node(container, '#draft-responsibility') as HTMLInputElement).value).toBe('林一')
    expect((node(container, '#draft-responsibility') as HTMLInputElement).disabled).toBe(false)
    const note = node(container, '#draft-responsibility-note').textContent
    expect(note).toContain('责任默认：当前登录身份「林一」')
    expect(note).toContain('main 的登录投影')
    expect(note).toContain('可改')
    expect(note).toContain('不改变任何权限判定')
  })

  it('signed-out / pending / nameless sessions keep the field empty with their named reason', () => {
    const signedOut = mountRegion()
    setRegion(signedOut.store, 'draft', withAuth({ status: 'signed-out', displayName: null }, [draft()]))
    expect((node(signedOut.container, '#draft-responsibility') as HTMLInputElement).value).toBe('')
    expect(node(signedOut.container, '#draft-responsibility-note').textContent).toContain('未认证：责任字段没有默认值')
    expect(node(signedOut.container, '#draft-responsibility-note').textContent).toContain('不用占位身份填充')

    const pending = mountRegion()
    setRegion(pending.store, 'draft', withAuth({ status: 'pending', displayName: null }, [draft()]))
    expect((node(pending.container, '#draft-responsibility') as HTMLInputElement).value).toBe('')
    expect(node(pending.container, '#draft-responsibility-note').textContent).toContain('登录进行中')

    const nameless = mountRegion()
    setRegion(nameless.store, 'draft', withAuth({ status: 'signed-in', displayName: null }, [draft()]))
    expect((node(nameless.container, '#draft-responsibility') as HTMLInputElement).value).toBe('')
    expect(node(nameless.container, '#draft-responsibility-note').textContent).toContain('显示名未提供')
    expect(node(nameless.container, '#draft-responsibility-note').textContent).toContain('不伪造')
  })

  it('a saved value wins over the default and shows no default wording', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', withAuth({ status: 'signed-in', displayName: '林一' }, [draft({ fields: { goal: '季度复盘', deliverable: '对外说明', responsibility: '李四·主责', projectRef: '' } })]))
    expect((node(container, '#draft-responsibility') as HTMLInputElement).value).toBe('李四·主责')
    expect(node(container, '#draft-responsibility-note').textContent).toBe('')
  })

  it('does not overwrite live typing, but withdraws an untouched default when auth changes', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', withAuth({ status: 'signed-in', displayName: '林一' }, [draft()]))
    expect((node(container, '#draft-responsibility') as HTMLInputElement).value).toBe('林一')
    setNativeValue(node(container, '#draft-responsibility'), '王五（临时代填）')
    setRegion(store, 'draft', withAuth({ status: 'signed-in', displayName: '林明' }, [draft()]))
    expect((node(container, '#draft-responsibility') as HTMLInputElement).value).toBe('王五（临时代填）')

    const untouched = mountRegion()
    setRegion(untouched.store, 'draft', withAuth({ status: 'signed-in', displayName: '林一' }, [draft()]))
    setRegion(untouched.store, 'draft', withAuth({ status: 'signed-out', displayName: null }, [draft()]))
    expect((node(untouched.container, '#draft-responsibility') as HTMLInputElement).value).toBe('')
    expect(node(untouched.container, '#draft-responsibility-note').textContent).toContain('未认证')
  })

  it('saving records the user-confirmed text (edited default) through the ordinary save entry', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', withAuth({ status: 'signed-in', displayName: '林一' }, [draft()]))
    setNativeValue(node(container, '#draft-responsibility'), '王五（临时代填）')
    await act(async () => { (node(container, '#draft-save') as HTMLButtonElement).click() })
    expect(saveDraft).toHaveBeenCalledWith('draft-1', expect.objectContaining({ responsibility: '王五（临时代填）' }), expect.anything(), expect.anything())
  })
})

describe('the site starting-template panel (React region)', () => {
  it('lists entries read-only with provenance; selecting one fills only the draft input with zero acts', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft()], { siteTemplates: { state: 'read', reason: null, entries: [templateEntry, { templateId: 'tpl-orbit', name: 'Orbit · SaaS 产品官网', source: 'sage-builtin', version: '2', prompt: null }] } }))
    const rows = container.querySelectorAll('#site-template-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('数字粒子 · 企业官网')
    expect(rows[0]?.textContent).toContain('来源：sage-builtin · 版本：1')
    expect(rows[0]?.querySelector('[data-site-template-use]')).not.toBeNull()
    expect(rows[1]?.textContent).toContain('提示词未接线（本入口不可用；不代表模板已失效）')
    expect(rows[1]?.querySelector('[data-site-template-use]')).toBeNull()
    expect((rows[0]?.querySelector('button[disabled]') as HTMLButtonElement).textContent).toBe('预览（未接线）')
    expect(node(container, '#site-template-note').textContent).toContain('选择只填入本次草案输入，不建站、不写配置。')

    await act(async () => { (rows[0]?.querySelector('[data-site-template-use]') as HTMLButtonElement).click() })
    expect(sendDraft).not.toHaveBeenCalled()
    expect(saveDraft).not.toHaveBeenCalled()
    expect((node(container, '#draft-input') as HTMLTextAreaElement).value).toContain('请为一个企业官网生成落地页')
    const note = node(container, '#site-template-note').textContent
    expect(note).toContain('已填入草案输入（可编辑）')
    expect(note).toContain('选模板不等于已建站或已发布')
    expect(note).not.toContain('已建站：')
  })

  it('appends after existing draft text instead of replacing the user input', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'draft', readSlot([draft()], { siteTemplates: { state: 'read', reason: null, entries: [templateEntry] } }))
    setNativeValue(node(container, '#draft-input'), '我自己的需求句子。')
    await act(async () => { (container.querySelector('[data-site-template-use]') as HTMLButtonElement).click() })
    expect((node(container, '#draft-input') as HTMLTextAreaElement).value).toBe('我自己的需求句子。\n\n' + templateEntry.prompt)
    expect(sendDraft).not.toHaveBeenCalled()
  })

  it('names the reason for an unavailable catalog and says exactly what an empty read means', () => {
    const unavailable = mountRegion()
    setRegion(unavailable.store, 'draft', readSlot([draft()], { siteTemplates: { state: 'unavailable', reason: 'site-templates-provider-unavailable', entries: [] } }))
    expect(unavailable.container.querySelectorAll('#site-template-rows .sage-roster-row')).toHaveLength(0)
    expect(node(unavailable.container, '#site-template-note').textContent).toContain('模板目录不可用（site-templates-provider-unavailable）')
    expect(node(unavailable.container, '#site-template-note').textContent).toContain('不以空列表冒充，也不静默替换')

    const empty = mountRegion()
    setRegion(empty.store, 'draft', readSlot([draft()], { siteTemplates: { state: 'read', reason: null, entries: [] } }))
    expect(empty.container.querySelectorAll('#site-template-rows .sage-roster-row')).toHaveLength(0)
    expect(node(empty.container, '#site-template-note').textContent).toContain('模板目录可读，但当前没有条目')
  })
})
