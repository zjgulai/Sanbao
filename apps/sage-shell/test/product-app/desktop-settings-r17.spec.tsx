/** @vitest-environment jsdom */
/** R17-A (wave 1, QDR.P06): the settings shell — observed navigation (search / back / entries)
 *  over the reproduced panes. Structure rows carry the observed labels verbatim and the honest
 *  未接线 state; the profile pane keeps only real identity facts and the real login/logout act. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { DesktopSettingsView } from '../../src/product/app/desktop/settings-view.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const cleanups: Array<() => void> = []

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })

afterEach(() => {
  let cleanup = cleanups.pop()
  while (cleanup !== undefined) {
    cleanup()
    cleanup = cleanups.pop()
  }
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}

function mount(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  return { container }
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

function search(container: HTMLElement, value: string): void {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="搜索设置"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('R17-A: the settings shell (QDR.P06)', () => {
  it('lands on the appearance pane with the observed navigation around it', () => {
    const { container } = mount(createElement(DesktopSettingsView, { controller: inertController }))
    expect(container.querySelector('.settings-appearance h2')?.textContent).toBe('外观与显示')
    const nav = container.querySelector('[aria-label="设置导航"]')!
    for (const label of ['设置项 个人资料', '设置项 常规', '设置项 模式配置', '设置项 任务监控', '设置项 外观与显示']) {
      expect(button(container, label), label).toBeDefined()
    }
    expect(button(container, '设置项 外观与显示').getAttribute('aria-current')).toBe('page')
    expect(nav.textContent).toContain('搜索设置')
  })

  it('reproduces the 常规 groups with observed labels and the honest 未接线 state', () => {
    const { container } = mount(createElement(DesktopSettingsView, { controller: inertController }))
    click(button(container, '设置项 常规'))
    const pane = container.querySelector('[aria-label="常规"]')!
    expect(pane.querySelector('h2')?.textContent).toBe('常规')
    for (const group of ['任务与工具', '通知', '隐私', '托盘与菜单栏']) {
      expect(pane.querySelector(`[aria-label="${group}"]`), group).not.toBeNull()
    }
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(19)
    expect(pane.textContent).toContain('运行中发送方式')
    expect(pane.textContent).toContain('设置主输入框和桌面宠物在 Agent 执行期间发送的新输入默认排队或立即插话。')
    expect(pane.textContent).toContain('未接线')
    // No fabricated controls: the structure reproduces labels and descriptions only.
    expect(pane.querySelectorAll('select, input')).toHaveLength(0)
  })

  it('reproduces the 模式配置 two groups and the 任务监控 five groups', () => {
    const { container } = mount(createElement(DesktopSettingsView, { controller: inertController }))
    click(button(container, '设置项 模式配置'))
    const mode = container.querySelector('[aria-label="模式配置"]')!
    expect(mode.querySelector('[aria-label="编程"]')).not.toBeNull()
    expect(mode.querySelector('[aria-label="通用"]')).not.toBeNull()
    expect(mode.querySelectorAll('.settings-observed-row')).toHaveLength(12)
    expect(mode.textContent).toContain('绑定主题')

    click(button(container, '设置项 任务监控'))
    const monitor = container.querySelector('[aria-label="任务监控"]')!
    for (const group of ['展示方式', '进度与上下文', '执行活动', '结果与来源', '辅助入口']) {
      expect(monitor.querySelector(`[aria-label="${group}"]`), group).not.toBeNull()
    }
    expect(monitor.querySelectorAll('.settings-observed-row')).toHaveLength(14)
    const reviewButton = Array.from(monitor.querySelectorAll('button')).find(item =>
      item.getAttribute('aria-label') === '设置任务回顾')!
    expect(reviewButton.disabled).toBe(true)
  })

  it('keeps the profile pane on real identity facts and the real login/logout act', () => {
    const onAction = vi.fn()
    const { container } = mount(createElement(DesktopSettingsView, {
      controller: inertController,
      account: { auth: 'signed-in', busy: false, onAction },
    }))
    click(button(container, '设置项 个人资料'))
    const pane = container.querySelector('[aria-label="个人资料"]')!
    expect(pane.textContent).toContain('已登录')
    expect(pane.textContent).toContain('不显示凭据')
    expect(pane.textContent).toContain('用量与活跃统计未接线')
    click(button(container, '退出登录'))
    expect(onAction).toHaveBeenCalledWith('logout')

    const signedOut = mount(createElement(DesktopSettingsView, {
      controller: inertController,
      account: { auth: 'signed-out', busy: false, onAction },
    }))
    click(button(signedOut.container, '设置项 个人资料'))
    click(button(signedOut.container, '登录'))
    expect(onAction).toHaveBeenCalledWith('login')
    // A display-only consumer gets no account control at all.
    const readOnly = mount(createElement(DesktopSettingsView, { controller: inertController }))
    click(button(readOnly.container, '设置项 个人资料'))
    expect(readOnly.container.querySelector('[aria-label="退出登录"]')).toBeNull()
    expect(readOnly.container.querySelector('[aria-label="登录"]')).toBeNull()
  })

  it('filters the entries by the search box and restores with 清空搜索', () => {
    const { container } = mount(createElement(DesktopSettingsView, { controller: inertController }))
    search(container, '模式')
    expect(container.querySelector('[aria-label="设置项 模式配置"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="设置项 常规"]')).toBeNull()
    search(container, 'sanbao-fixture-no-match')
    expect(container.querySelector('[aria-label="设置导航"]')!.textContent).toContain('没有匹配的设置项')
    click(button(container, '清空搜索'))
    expect(container.querySelector('[aria-label="设置项 常规"]')).not.toBeNull()
  })

  it('routes 返回应用 through the provided back navigation', () => {
    const onBack = vi.fn()
    const { container } = mount(createElement(DesktopSettingsView, { controller: inertController, onBack }))
    click(button(container, '返回应用'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
