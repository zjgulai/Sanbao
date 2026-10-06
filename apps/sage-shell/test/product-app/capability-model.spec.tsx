/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createAppBridgeStore, type AppBridgeStore } from '../../src/product/app/bridge.js'
import { CapabilityRegion, CapabilitySourceBadge, ModelConfigRegion } from '../../src/product/app/capability-view.js'

/**
 * Batch 26 / P4 (ADR-0261): the capability roster, its source badge and the model-config card
 * render read-only structure facts from the region bridge. Both cards have no down-bridge surface;
 * the projection/route side stays in `capability-projection.spec.ts` and
 * `model-config-projection.spec.ts`.
 */

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT

const capability = (over: Record<string, unknown> = {}) => ({
  source: 'runtime-effective', observed: true, reason: null,
  agentPresets: [
    { id: 'standard', state: 'enabled', reason: null },
    { id: 'cordis', state: 'enabled', reason: null },
    { id: 'legacy-broken', state: 'configured-not-enabled', reason: 'preset-failed-to-activate' },
  ],
  ...over,
})
const capabilityRead = (over: Record<string, unknown> = {}) => ({ kind: 'read', slot: { slice: capability(over) } })
const modelConfig = (over: Record<string, unknown> = {}) => ({
  state: 'read', reason: null, connectivityTest: 'untested',
  namespaces: [
    { ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } },
    { ns: 'embedding', revision: 3, applies: 'restart', saved: 'base-only', secrets: { set: 0, total: 2 } },
  ],
  ...over,
})
const modelConfigRead = (over: Record<string, unknown> = {}) => ({ kind: 'read', slot: { slice: modelConfig(over) } })
const unavailable = () => ({ kind: 'unavailable' })

interface Mounted {
  readonly container: HTMLElement
  readonly store: AppBridgeStore
  readonly unmount: () => void
}
const mounted: Mounted[] = []

function mountRegion(component: typeof CapabilityRegion, id: string, existing?: AppBridgeStore): Mounted {
  const container = document.createElement('div')
  container.id = id
  document.body.append(container)
  const store = existing ?? createAppBridgeStore()
  const root = createRoot(container)
  act(() => { root.render(createElement(component, { store, container })) })
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

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

describe('the capability view states three facts separately and offers no write entry (React region)', () => {
  it('renders the roster with configured, enabled and availability kept apart', () => {
    const store = createAppBridgeStore()
    const { container } = mountRegion(CapabilityRegion, 'sage-region-capability', store)
    const badge = mountRegion(CapabilitySourceBadge, 'sage-region-capability-source', store)
    setRegion(store, 'capability', capabilityRead())
    const rows = node(container, '#capability-rows').children
    expect(rows).toHaveLength(3)
    const rowText = (row: Element): string => Array.from(row.querySelectorAll('strong, .sage-roster-tag')).map((child) => child.textContent).join(' | ')
    expect(rowText(rows[0]!)).toBe('standard | 已配置 | 已启用 | 可用性：外部能力面未接线，无法核验')
    expect(rowText(rows[2]!)).toContain('已配置')
    expect(rowText(rows[2]!)).toContain('未启用')
    expect(node(container, '#capability-note').textContent).toBe('已配置 3 项，其中 1 项未启用。已启用不等于可用。')
    expect(badge.container.textContent).toBe('来源：运行时清单观察')
    // 已配置 / 已启用 / 可用 stay three tags; no install, enable or revoke control exists.
    expect(container.querySelector('button, form, input, select, textarea')).toBeNull()
  })

  it('says 未核验 with the reason and never 已停用 when the roster could not be read', () => {
    const store = createAppBridgeStore()
    const { container } = mountRegion(CapabilityRegion, 'sage-region-capability', store)
    const badge = mountRegion(CapabilitySourceBadge, 'sage-region-capability-source', store)
    setRegion(store, 'capability', capabilityRead({ observed: false, reason: 'observation-not-read', agentPresets: [] }))
    expect(node(container, '#capability-rows').children).toHaveLength(0)
    expect(node(container, '#capability-note').textContent).toContain('未核验')
    expect(node(container, '#capability-note').textContent).not.toContain('已停用')
    expect(badge.container.textContent).toBe('来源：尚未读到运行时清单')
  })

  it('carries the runtime\u2019s own unavailable reason into the wording table', () => {
    const { container, store } = mountRegion(CapabilityRegion, 'sage-region-capability')
    setRegion(store, 'capability', capabilityRead({ observed: false, reason: 'registry-service-absent', agentPresets: [] }))
    expect(node(container, '#capability-note').textContent).toBe('未核验：这一版运行时没有提供目录服务，因此没有清单可读。')
  })

  it('keeps the waiting badge and the default reason when no slice ever arrived', () => {
    const store = createAppBridgeStore()
    const { container } = mountRegion(CapabilityRegion, 'sage-region-capability', store)
    const badge = mountRegion(CapabilitySourceBadge, 'sage-region-capability-source', store)
    setRegion(store, 'capability', unavailable())
    expect(badge.container.textContent).toBe('来源：等待运行时清单')
    expect(node(container, '#capability-note').textContent).toBe('未核验：还没有读到运行时的清单，无法判断任何一项的状态。')
    expect(node(container, '#capability-rows').children).toHaveLength(0)
  })
})

describe('the model-config view keeps saving and connectivity apart (React region)', () => {
  it('renders saved state, restart semantics and credential counts as separate statements', () => {
    const { container, store } = mountRegion(ModelConfigRegion, 'sage-region-model-config')
    setRegion(store, 'model-config', modelConfigRead())
    const rows = node(container, '#model-rows').children
    expect(rows).toHaveLength(2)
    const tagText = (row: Element): string[] => Array.from(row.children).map((child) => child.textContent ?? '')
    expect(tagText(rows[0]!)).toEqual(['llm', '已保存', '立即生效', '凭据：已设置 1/1'])
    expect(tagText(rows[1]!)).toEqual(['embedding', '仅默认值', '需重启', '凭据：已设置 0/2'])
    expect(node(container, '#model-test').textContent).toContain('未测试')
    expect(node(container, '#model-test').textContent).toContain('不代表供应商已被调用过')
    expect(node(container, '#model-note').textContent).toBe('仍有 1 个命名空间缺凭据；缺凭据的项不算配置完成。')
  })

  it('does not report a partial failure as a finished item', () => {
    const { container, store } = mountRegion(ModelConfigRegion, 'sage-region-model-config')
    setRegion(store, 'model-config', modelConfigRead({ namespaces: [
      { ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } },
      { ns: 'embedding', revision: 3, applies: 'restart', saved: 'base-only', secrets: { set: 0, total: 2 } },
    ] }))
    expect(node(container, '#model-note').textContent).toContain('缺凭据')
    expect(node(container, '#model-note').textContent).toContain('不算配置完成')

    const complete = mountRegion(ModelConfigRegion, 'sage-region-model-config-2')
    setRegion(complete.store, 'model-config', modelConfigRead({ namespaces: [
      { ns: 'llm', revision: 7, applies: 'live', saved: 'user', secrets: { set: 1, total: 1 } },
    ] }))
    expect(node(complete.container, '#model-note').textContent).toBe('已读 1 个命名空间的结构；配置值与凭据内容都不在本页。')
  })

  it('says 未核验 with a reason, keeps an empty document distinct, and offers no editing affordance', () => {
    const { container, store } = mountRegion(ModelConfigRegion, 'sage-region-model-config')
    setRegion(store, 'model-config', modelConfigRead({ state: 'unavailable', reason: 'not-read', namespaces: [], connectivityTest: null }))
    expect(node(container, '#model-note').textContent).toBe('未核验：还没有读到配置文档。')
    expect(node(container, '#model-rows').children).toHaveLength(0)
    expect(node(container, '#model-test').textContent).toBe('连通性：无法核验。')
    expect(container.querySelector('button, form, input, select, textarea')).toBeNull()

    setRegion(store, 'model-config', modelConfigRead({ namespaces: [] }))
    expect(node(container, '#model-note').textContent).toBe('未就绪：这份配置文档里还没有任何命名空间。')
  })
})
