/** @vitest-environment jsdom */
/** R17-B (wave B, QDR.P06): the 模型 page — the observed editor shell over the QB20 capture.
 *  The add-dialog opens/cancels for real, the provider menu reproduces the observed 3-group/
 *  17-entry list with DeepSeek selectable, the type/models/api-type panels open and Escape
 *  back, and the discard confirm offers both outcomes. The API Key stays an always-empty
 *  read-only placeholder and 校验并添加模型 stays disabled — nothing enters, validates, stores
 *  or sends a credential. */
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

function pressEscape(element: HTMLElement): void {
  act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
}

describe('R17-B: the models page (QDR.P06.settings.models)', () => {
  it('lands on the observed default page (QB20-01) and opens the add dialog (QB20-02)', () => {
    const { container } = mount()
    click(button(container, '设置项 模型'))
    const pane = container.querySelector('[aria-label="模型"]')!
    expect(pane.querySelector('h2')!.textContent).toBe('模型')
    expect(pane.textContent).toContain('使用自有 API Key 管理自定义模型。')
    expect(pane.textContent).toContain('暂无自定义模型，点击添加模型开始使用')

    click(button(pane, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-label')).toBe('添加模型')
    expect(dialog.textContent).toContain('供应商')
    expect(dialog.textContent).toContain('API Key')
    // The observed default form: aliyun + Token plan, 校验 disabled.
    expect(dialog.querySelector('[aria-label="供应商"]')!.textContent).toContain('阿里云百炼 - 中国')
    expect(dialog.querySelector('[aria-label="类型"]')!.textContent).toContain('Token plan')
    expect(button(dialog as HTMLElement, '校验并添加模型').disabled).toBe(true)
    // The API Key field is a read-only always-empty placeholder with the named note.
    const apiKey = dialog.querySelector<HTMLInputElement>('input[aria-label="API Key"]')!
    expect(apiKey.readOnly).toBe(true)
    expect(apiKey.value).toBe('')
    expect(dialog.textContent).toContain('API Key 未接线')
  })

  it('reproduces the observed provider menu and switches to DeepSeek (QB20-03/04)', () => {
    const { container } = mount()
    click(button(container, '设置项 模型'))
    click(button(container, '添加模型'))
    const dialog = container.querySelector('[role="dialog"]') as HTMLElement
    click(dialog.querySelector<HTMLButtonElement>('[aria-label="供应商"]')!)
    const menu = dialog.querySelector('[role="listbox"][aria-label="供应商"]')!
    // The observed 3 groups / 17 entries, verbatim order (QB20-03).
    for (const group of ['推荐', '更多', '自定义']) {
      expect(menu.querySelector(`[role="group"][aria-label="${group}"]`), group).not.toBeNull()
    }
    expect(menu.querySelectorAll('[role="option"]')).toHaveLength(17)
    expect(menu.textContent).toContain('阿里云百炼 - 新加坡')
    expect(menu.textContent).toContain('OpenRouter')
    expect(menu.textContent).toContain('OpenAI Compatible')
    expect(menu.textContent).toContain('Anthropic Compatible')

    // Selecting DeepSeek lands on its observed form (QB20-04).
    click(button(menu as HTMLElement, 'DeepSeek'))
    const form = container.querySelector('[role="dialog"]') as HTMLElement
    expect(form.querySelector('[aria-label="供应商"]')!.textContent).toContain('DeepSeek')
    expect(form.querySelector('[aria-label="类型"]')!.textContent).toContain('按量付费')
    // QB20-04: the 购买 Token Plan link disappears on DeepSeek (it is aliyun-only).
    expect(form.textContent).not.toContain('购买 Token Plan')
    // The DeepSeek model checklist reproduces the observed three unchecked items (QB20-05).
    click(form.querySelector<HTMLButtonElement>('[aria-label="选择模型"]')!)
    const modelsMenu = form.querySelector('[role="menu"][aria-label="选择模型"]')!
    expect(modelsMenu.querySelectorAll('[role="menuitemcheckbox"]')).toHaveLength(3)
    for (const checkbox of Array.from(modelsMenu.querySelectorAll('[role="menuitemcheckbox"]'))) {
      expect(checkbox.getAttribute('aria-checked')).toBe('false')
    }
    expect(modelsMenu.textContent).toContain('DeepSeek-V4-Pro')
    pressEscape(modelsMenu as HTMLElement)
    // The DeepSeek type panel holds exactly the observed option (QB20-06).
    click(form.querySelector<HTMLButtonElement>('[aria-label="类型"]')!)
    const typeMenu = form.querySelector('[role="listbox"][aria-label="类型"]')!
    expect(typeMenu.querySelectorAll('[role="option"]')).toHaveLength(1)
    expect(typeMenu.textContent).toContain('按量付费')
    pressEscape(typeMenu as HTMLElement)
    expect(container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('renders the compatible forms with the api-type panel and unwired drafts (QB20 variants)', () => {
    const { container } = mount()
    click(button(container, '设置项 模型'))
    click(button(container, '添加模型'))
    click(container.querySelector<HTMLButtonElement>('[aria-label="供应商"]')!)
    const menu = container.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    click(button(menu, 'OpenAI Compatible'))
    let form = container.querySelector('[role="dialog"]') as HTMLElement
    expect(form.querySelector('[aria-label="API 类型"]')!.textContent).toContain('Chat Completions API')
    click(form.querySelector<HTMLButtonElement>('[aria-label="API 类型"]')!)
    const apiTypeMenu = form.querySelector('[role="listbox"][aria-label="API 类型"]')!
    expect(apiTypeMenu.querySelectorAll('[role="option"]')).toHaveLength(2)
    expect(apiTypeMenu.textContent).toContain('Responses API')
    // The endpoint draft stays a read-only placeholder (nothing is entered).
    const endpoint = form.querySelector<HTMLInputElement>('input[aria-label="接口地址（Base URL）"]')!
    expect(endpoint.readOnly).toBe(true)
    expect(endpoint.value).toBe('')

    // Anthropic Compatible: no api-type panel, endpoint stays read-only.
    pressEscape(apiTypeMenu as HTMLElement)
    click(button(form, '供应商'))
    const menu2 = container.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    click(button(menu2, 'Anthropic Compatible'))
    form = container.querySelector('[role="dialog"]') as HTMLElement
    expect(form.querySelector('[aria-label="API 类型"]')).toBeNull()
    expect(form.querySelector<HTMLInputElement>('input[aria-label="接口地址（Base URL）"]')!.readOnly).toBe(true)
  })

  it('guards cancellation with the observed discard confirm (QB20-07)', () => {
    const { container } = mount()
    click(button(container, '设置项 模型'))
    click(button(container, '添加模型'))
    click(container.querySelector<HTMLButtonElement>('[aria-label="供应商"]')!)
    const menu = container.querySelector('[role="listbox"][aria-label="供应商"]') as HTMLElement
    click(button(menu, 'DeepSeek'))
    // Dirty form: cancel opens the observed confirm with both outcomes.
    click(button(container, '取消'))
    const confirm = container.querySelector('[role="dialog"][aria-label="放弃未保存的模型配置？"]')!
    expect(confirm.textContent).toContain('关闭后，本次输入的 Endpoint、模型能力和 API Key 都会被清空。')
    // 继续编辑 returns to the form.
    click(button(confirm as HTMLElement, '继续编辑'))
    expect(container.querySelector('[aria-label="放弃未保存的模型配置？"]')).toBeNull()
    expect((container.querySelector('[role="dialog"]') as HTMLElement).getAttribute('aria-label')).toBe('添加模型')
    // 放弃更改 lands back on the empty default page (QB20-07 exit).
    click(button(container, '取消'))
    click(button(container, '放弃更改') ?? button(container.querySelector('[aria-label="放弃未保存的模型配置？"]') as HTMLElement, '放弃更改'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[aria-label="模型"]')!.textContent).toContain('暂无自定义模型')
    expect((container.querySelector('[aria-label="供应商"]') ?? null)).toBeNull()
  })

  it('closes the clean default form directly without the confirm', () => {
    const { container } = mount()
    click(button(container, '设置项 模型'))
    click(button(container, '添加模型'))
    // Unmodified default form: 取消 closes directly (QB20-02 exit, AX/图一致).
    click(button(container, '取消'))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(container.querySelector('[aria-label="模型"]')!.textContent).toContain('暂无自定义模型')
  })
})
