/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { PlanRegion } from '../../src/product/app/plan-view.js'

/**
 * Batch 19 / P3 (ADR-0261): the plan card (candidate rows, per-step readiness, the single
 * step-execution confirmation card and the result sentence) renders from the region bridge only;
 * its explicit entries call the legacy down-bridge actions. Wire semantics stay in the legacy
 * script (test/plan-region-bridge.spec.ts).
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const originalActions = Object.getOwnPropertyDescriptor(globalThis, '__SAGE_LEGACY_ACTIONS__')

const step1 = { stepNo: 1, title: '备料', readiness: 'ready', readinessNote: '执行环境 ws-1 存在（逐次核验）' }
const step2 = { stepNo: 2, title: '试产', readiness: 'not-ready', readinessNote: '执行环境 ws-9 在最近折叠中不存在——重新选择或核验后再试' }
const step3 = { stepNo: 3, title: '投放', readiness: 'unknown', readinessNote: '前提未知（workspace-fold-unreadable）——按阻断处理，不派发' }
const plan = (overrides: Record<string, unknown> = {}) => ({
  planId: 'plan-1', matterRef: 'matter:1', title: '上架方案',
  steps: [step1, step2, step3], state: 'draft', acceptedAt: null, createdAt: 'x', ...overrides,
})

const plansRead = {
  plans: [
    plan(),
    plan({ planId: 'plan-2', title: '收尾方案', state: 'accepted', acceptedAt: 't-accept' }),
  ],
  lastStepRun: null,
}

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}

const mounted: Mounted[] = []

function mountRegion(): Mounted {
  const container = document.createElement('div')
  container.id = 'sage-region-plans'
  document.body.append(container)
  const store = createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(PlanRegion, { store, container })) })
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

const createPlan = vi.fn(async () => null)
const acceptPlan = vi.fn(async () => undefined)
const card = {
  confirmationId: 'cf-7', preparedAt: 't', target: { matterRef: 'matter:1', revisionRef: 'plan:plan-1:step:1' },
  action: { type: 'plan-step', scope: 'matter' },
  resources: [{ kind: 'execution-environment', ref: 'ws-1', state: 'selected' }],
  prerequisites: [{ name: 'execution-environment', state: 'met', note: 'environment-chosen' }],
  costEstimate: { state: 'unavailable', note: 'estimate-unavailable' }, effect: 'not-yet-happened',
}
const prepareStep = vi.fn(async () => ({ kind: 'prepared', card }))
const executedRun = { planId: 'plan-1', stepNo: 1, state: 'not-ready', code: 'step-execution-unavailable', at: 't' }
const executeStep = vi.fn(async () => ({ kind: 'run', run: executedRun }))

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', {
    configurable: true,
    value: { createPlan, acceptPlan, prepareStep, executeStep },
  })
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  vi.clearAllMocks()
  if (originalActions === undefined) Reflect.deleteProperty(globalThis, '__SAGE_LEGACY_ACTIONS__')
  else Object.defineProperty(globalThis, '__SAGE_LEGACY_ACTIONS__', originalActions)
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('plan card (React region)', () => {
  it('renders candidates with receipt tags, selects the current plan and shows readiness honestly', () => {
    const { container, store } = mountRegion()
    setRegion(store, 'plans', { kind: 'read', slot: plansRead })

    expect(container.getAttribute('data-region-state')).toBe('read')
    const rows = container.querySelectorAll('#plan-rows .sage-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('上架方案')
    expect(rows[0]?.textContent).toContain('草稿')
    expect((rows[0]?.querySelector('[data-plan-action="accept"]') as HTMLButtonElement).textContent).toBe('接受方案（只记回执）')
    expect(rows[1]?.textContent).toContain('已接受（回执 t-accept；接受≠执行）')
    expect(rows[1]?.querySelector('[data-plan-action="accept"]')).toBeNull()

    // The default current plan is the last row (plan-2): its steps open in the detail.
    expect((node(container, '#plan-step-detail') as HTMLElement).hidden).toBe(false)
    expect(node(container, '#plan-step-note').textContent).toBe('「收尾方案」的步骤（就绪按动作前提判断；未就绪或未知=阻断，不显示执行入口）：')

    // Select the first row: the detail follows the choice.
    act(() => { (rows[0] as HTMLElement).click() })
    expect(node(container, '#plan-step-note').textContent).toBe('「上架方案」的步骤（就绪按动作前提判断；未就绪或未知=阻断，不显示执行入口）：')
    const steps = container.querySelectorAll('#plan-step-rows .sage-roster-row')
    expect(steps).toHaveLength(3)
    expect(steps[0]?.textContent).toContain('步骤 1')
    expect(steps[0]?.textContent).toContain('就绪')
    expect(steps[1]?.textContent).toContain('未就绪（阻断——不派发）')
    expect(steps[2]?.textContent).toContain('未知（阻断——不派发）')
    // Only the ready step has a prepare entry — a blocked step cannot be dispatched at all.
    expect(steps[0]?.querySelector('[data-plan-action="prepare-step"]')).not.toBeNull()
    expect(steps[1]?.querySelector('[data-plan-action="prepare-step"]')).toBeNull()
    expect(steps[2]?.querySelector('[data-plan-action="prepare-step"]')).toBeNull()

    const unavailable = mountRegion()
    setRegion(unavailable.store, 'plans', { kind: 'unavailable' })
    expect(unavailable.container.getAttribute('data-region-state')).toBe('unavailable')
    expect(node(unavailable.container, '#plan-note').textContent).toBe('未核验：这一版还没有接上方案存储。')
    expect((node(unavailable.container, '#plan-step-detail') as HTMLElement).hidden).toBe(true)

    setRegion(store, 'plans', { kind: 'read', slot: { plans: [], lastStepRun: null } })
    expect(node(container, '#plan-note').textContent).toBe('还没有方案：写下标题与步骤（每行一条）形成方案。')
    expect((node(container, '#plan-step-detail') as HTMLElement).hidden).toBe(true)
  })

  it('prepares the single card, executes with the credential, and reads the result sentence', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'plans', { kind: 'read', slot: plansRead })
    act(() => { ((container.querySelectorAll('#plan-rows .sage-roster-row')[0]) as HTMLElement).click() })

    await act(async () => { (container.querySelector('#plan-step-rows [data-plan-action="prepare-step"]') as HTMLButtonElement).click() })
    expect(prepareStep).toHaveBeenCalledWith('plan-1', 1)
    const stepCard = node(container, '#plan-step-card') as HTMLElement
    expect(stepCard.hidden).toBe(false)
    expect(node(container, '#plan-step-target').textContent).toBe('matter:1（步骤 1 · plan:plan-1:step:1）')
    expect(node(container, '#plan-step-action').textContent).toBe('plan-step')
    expect(node(container, '#plan-step-scope').textContent).toBe('整个事项（matter）')
    expect(node(container, '#plan-step-resources').textContent).toBe('execution-environment：ws-1')
    expect(node(container, '#plan-step-time').textContent).toBe('t')
    expect(node(container, '#plan-step-prereq').textContent).toBe('execution-environment：已满足')
    expect(node(container, '#plan-step-cost').textContent).toBe('暂不可得（本版没有费用预估来源——不冒充数字）')

    await act(async () => { (node(container, '#plan-step-execute') as HTMLButtonElement).click() })
    expect(executeStep).toHaveBeenCalledWith('plan-1', 1, 'cf-7')
    expect(stepCard.hidden).toBe(true)
    expect(node(container, '#plan-step-result').textContent).toBe('步骤执行未接线（step-execution-unavailable）：没有伪造运行，也不消耗确认。')

    // A refusal notice wins the result area until the next act clears it.
    prepareStep.mockResolvedValueOnce({ kind: 'notice', notice: '这一步的前提未知：按阻断处理，不派发（不铸卡）。' })
    await act(async () => { (container.querySelector('#plan-step-rows [data-plan-action="prepare-step"]') as HTMLButtonElement).click() })
    expect(node(container, '#plan-step-result').textContent).toBe('这一步的前提未知：按阻断处理，不派发（不铸卡）。')

    // Cancel clears the pending card and the local sentence.
    prepareStep.mockResolvedValueOnce({ kind: 'prepared', card })
    await act(async () => { (container.querySelector('#plan-step-rows [data-plan-action="prepare-step"]') as HTMLButtonElement).click() })
    expect(stepCard.hidden).toBe(false)
    act(() => { (node(container, '#plan-step-cancel') as HTMLButtonElement).click() })
    expect(stepCard.hidden).toBe(true)
    expect(node(container, '#plan-step-result').textContent).toBe('')
  })

  it('creates from the chosen context through the down-bridge and keeps the local notice', async () => {
    const { container, store } = mountRegion()
    setRegion(store, 'plans', { kind: 'read', slot: plansRead })

    await act(async () => { (node(container, '#plan-create') as HTMLButtonElement).click() })
    expect(createPlan).toHaveBeenCalledWith('', '')

    setNativeValue(node(container, '#plan-title'), '上架方案')
    setNativeValue(node(container, '#plan-steps'), '备料\n试产\n投放')
    createPlan.mockResolvedValueOnce('先在「事项 ↔ 工作区关联」里选好事项：方案属于某个事项。')
    await act(async () => { (node(container, '#plan-create') as HTMLButtonElement).click() })
    expect(createPlan).toHaveBeenCalledWith('上架方案', '备料\n试产\n投放')
    expect(node(container, '#plan-note').textContent).toBe('先在「事项 ↔ 工作区关联」里选好事项：方案属于某个事项。')

    // A poll refresh does not overwrite the local sentence (notice timing stays on this side).
    setRegion(store, 'plans', { kind: 'read', slot: plansRead })
    expect(node(container, '#plan-note').textContent).toBe('先在「事项 ↔ 工作区关联」里选好事项：方案属于某个事项。')

    createPlan.mockResolvedValueOnce(null)
    await act(async () => { (node(container, '#plan-create') as HTMLButtonElement).click() })
    expect(node(container, '#plan-note').textContent).toBe('')
  })
})
