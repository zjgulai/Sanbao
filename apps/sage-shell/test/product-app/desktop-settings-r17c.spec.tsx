/** @vitest-environment jsdom */
/** R17-C (wave C, QDR.P06): the 快捷键 and 语音 pages — observed structure verbatim, the REAL
 *  local shortcut search (QB18-01/02), the modal shell (QB18-04 / QB19-02) and the local word
 *  draft (QB19-03). Nothing records, saves or persists. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

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

function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DesktopSettingsView, { controller: inertController })) })
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

function typeInto(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('R17-C: the shortcuts page (QDR.P06.settings.shortcuts)', () => {
  it('reproduces the five observed groups and filters over command or description', () => {
    const { container } = mount()
    click(button(container, '设置项 快捷键'))
    const pane = container.querySelector('[aria-label="快捷键"]')!
    for (const group of ['输入', '导航', '任务', '语音', '系统']) {
      expect(pane.querySelector(`[aria-label="${group}"]`), group).not.toBeNull()
    }
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(16)
    expect(pane.textContent).toContain('共 16 条观测命令，0 个已自定义')
    expect(pane.textContent).toContain('发送消息')

    // The real local search: '语音' narrows to the four voice commands (QB18-01).
    const search = pane.querySelector<HTMLInputElement>('input[aria-label="搜索快捷键"]')!
    typeInto(search, '语音')
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(4)
    expect(pane.querySelector('[aria-label="导航"]')).toBeNull()
    expect(pane.textContent).toContain('实时语音快捷键')

    // The no-match copy and the clear-restores behaviour (QB18-02).
    typeInto(search, 'sanbao-fixture-no-match')
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(0)
    expect(pane.textContent).toContain('没有找到包含“sanbao-fixture-no-match”的命令、说明或组合键。')
    click(button(pane, '清空搜索'))
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(16)
  })

  it('opens the observed edit-modal shell from a pencil and cancels back', () => {
    const { container } = mount()
    click(button(container, '设置项 快捷键'))
    const pane = container.querySelector('[aria-label="快捷键"]')!
    // The 发送消息 row has no pencil in this build (its observed interaction is the combo menu).
    expect(Array.from(pane.querySelectorAll('button')).some(item => item.getAttribute('aria-label') === '修改 发送消息 快捷键')).toBe(false)
    click(button(pane, '修改 设置 快捷键'))
    const modal = container.querySelector('[role="dialog"]')!
    expect(modal.getAttribute('aria-label')).toBe('修改“设置”快捷键')
    expect(modal.textContent).toContain('按下包含 ⌘/Ctrl、⌃ 或 Option/Alt 的新组合键。Escape 可取消修改。')
    expect(modal.textContent).toContain('录制与保存未接线')
    expect(button(modal as HTMLElement, '按下新快捷键').disabled).toBe(true)
    expect(button(modal as HTMLElement, '保存快捷键').disabled).toBe(true)
    click(button(modal as HTMLElement, '取消修改'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('R17-C: the voice page (QDR.P06.settings.voice)', () => {
  it('reproduces the four groups with the modal shell and the honest word draft', () => {
    const { container } = mount()
    click(button(container, '设置项 语音'))
    const pane = container.querySelector('[aria-label="语音"]')!
    for (const group of ['通用', '语音输入', '实时语音', '录音纪要']) {
      expect(pane.querySelector(`[aria-label="${group}"]`), group).not.toBeNull()
    }
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(13)
    expect(pane.textContent).toContain('常用词纠正')
    expect(pane.textContent).toContain('录音纪要最长时长') // guard against mis-slicing the group table
    expect(pane.textContent).toContain('未接线')

    // The 实时语音快捷键 pencil opens the observed modal shell (QB19-02).
    click(button(pane, '修改 实时语音快捷键 快捷键'))
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('修改“实时语音快捷键”快捷键')
    click(button(container, '取消修改'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()

    // The word draft takes local input; 添加 stays disabled and nothing is added (QB19-03).
    const draft = pane.querySelector<HTMLInputElement>('input[aria-label="添加词汇"]')!
    typeInto(draft, 'sanbao-fixture')
    expect(draft.value).toBe('sanbao-fixture')
    expect(button(pane, '添加词汇按钮').disabled).toBe(true)
    typeInto(draft, '')
    expect(pane.querySelectorAll('.settings-observed-row')).toHaveLength(13)
  })
})
