/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpertsPage } from '../../src/product/app/desktop/experts.js'

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const cleanups: Array<() => void> = []

beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true })
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
})

function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(ExpertsPage)) })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  return container
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

describe('EP-1 expert design catalogue', () => {
  it('renders 3 management identities and 50 job designs with same-origin avatars', () => {
    const container = mount()
    expect(container.querySelector('[aria-label="专家"]')).not.toBeNull()
    expect(container.querySelectorAll('.expert-card')).toHaveLength(53)
    expect(container.querySelectorAll('.expert-card[data-role-kind="MGT"]')).toHaveLength(3)
    expect(container.querySelectorAll('.expert-card[data-role-kind="AGT"]')).toHaveLength(50)
    expect(container.textContent).toContain('内置专家 53')
    expect(container.textContent).toContain('设计目录')
    expect(container.textContent).toContain('天時')
    expect(container.textContent).toContain('管理身份 · 首席执行官 CEO')
    expect(container.textContent).toContain('衡远')
    expect(container.textContent).toContain('岗位专家 · 经营目标与资源统筹')
    for (const img of container.querySelectorAll<HTMLImageElement>('.expert-avatar')) {
      expect(img.getAttribute('src')).toMatch(/^\/assets\/experts\/avatars\/(mgt|agt)-\d{3}\/light\/list-64\.webp$/)
      expect(img.getAttribute('alt')).toBe('')
    }
  })

  it('filters management and job designs without creating a runtime or a team', () => {
    const container = mount()
    click(button(container, '管理身份 3'))
    expect(container.querySelectorAll('.expert-card')).toHaveLength(3)
    expect(container.querySelectorAll('.expert-card[data-role-kind="AGT"]')).toHaveLength(0)
    expect(button(container, '管理身份 3').getAttribute('aria-pressed')).toBe('true')
    click(button(container, '岗位专家 50'))
    expect(container.querySelectorAll('.expert-card')).toHaveLength(50)
    expect(container.querySelectorAll('.expert-card[data-role-kind="MGT"]')).toHaveLength(0)
    click(button(container, '全部 53'))
    expect(container.querySelectorAll('.expert-card')).toHaveLength(53)
  })

  it('combines case-insensitive search with the active filter and supports empty-state recovery', () => {
    const container = mount()
    const search = container.querySelector<HTMLInputElement>('input[aria-label="搜索专家"]')!
    typeInto(search, '衡远')
    expect(container.querySelectorAll('.expert-card')).toHaveLength(1)
    expect(container.querySelector('.expert-card')?.textContent).toContain('衡远')
    typeInto(search, ' agt-001 ')
    expect(container.querySelectorAll('.expert-card')).toHaveLength(1)
    click(button(container, '管理身份 3'))
    expect(container.querySelectorAll('.expert-card')).toHaveLength(0)
    expect(container.textContent).toContain('没有匹配的专家')
    click(button(container, '清空搜索'))
    expect(search.value).toBe('')
    expect(container.querySelectorAll('.expert-card')).toHaveLength(3)
    click(button(container, '全部 53'))
    expect(container.querySelectorAll('.expert-card')).toHaveLength(53)
  })

  it('keeps new-expert and conversation controls disabled and explains the unavailable capability', () => {
    const fetch = vi.spyOn(globalThis, 'fetch')
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    const container = mount()
    expect(container.querySelector('.expert-create-card')).not.toBeNull()
    const create = button(container, '新建专家')
    expect(create.disabled).toBe(true)
    const conversations = Array.from(container.querySelectorAll<HTMLButtonElement>('.expert-card button'))
    expect(conversations).toHaveLength(53)
    expect(conversations.every(item => item.disabled)).toBe(true)
    const reason = container.querySelector('#expert-catalogue-note')
    expect(reason?.textContent).toContain('暂不支持新建或对话')
    for (const control of [create, ...conversations]) {
      expect(control.getAttribute('aria-describedby')).toBe('expert-catalogue-note')
      click(control)
    }
    expect(fetch).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
    expect(container.querySelectorAll('.expert-card')).toHaveLength(53)
  })
})
