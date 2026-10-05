/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Instrument ownership for entry cleanup, but render every component with the real React root.
vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>()
  return { ...actual, createRoot: vi.fn(actual.createRoot) }
})

import type { DesktopRead } from '../../src/product/app/desktop/client.js'
import { DesktopPage } from '../../src/product/app/desktop/page.js'

const originalActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT
const cleanups: Array<() => void> = []
const blocked: DesktopRead = { kind: 'blocked', code: 'projection-read-unavailable' }
const ready: DesktopRead = { kind: 'read', runtime: { status: 'ready', message: '运行时已连接', retryable: false } }
const requests = vi.fn()

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function mount(readState: () => Promise<DesktopRead>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = (read: () => Promise<DesktopRead>) => {
    act(() => { root.render(createElement(DesktopPage, { readState: read })) })
  }
  render(readState)
  const unmount = () => { act(() => { root.unmount() }); container.remove() }
  cleanups.push(unmount)
  return { container, render }
}

function node<T extends HTMLElement = HTMLElement>(container: HTMLElement, selector: string): T {
  const found = container.querySelector<T>(selector)
  expect(found, selector).not.toBeNull()
  return found!
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

function write(container: HTMLElement, value: string): HTMLTextAreaElement {
  const input = node<HTMLTextAreaElement>(container, 'textarea[aria-label="任务输入"]')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  return input
}

function key(element: HTMLElement, keyValue: string, options: KeyboardEventInit = {}): KeyboardEvent {
  element.focus()
  const event = new KeyboardEvent('keydown', { key: keyValue, bubbles: true, cancelable: true, ...options })
  act(() => { document.activeElement!.dispatchEvent(event) })
  return event
}

async function settle(): Promise<void> {
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  requests.mockReset()
  vi.stubGlobal('fetch', requests)
  document.documentElement.dataset.sageThemeEffective = 'unknown'
})

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment
  delete document.documentElement.dataset.sageThemeEffective
})

describe('T01 complete desktop visual structure and honest read states', () => {
  it('uses the production read client by default and exposes its denial without a business request', async () => {
    requests.mockResolvedValue(new Response(JSON.stringify({ code: 'projection-read-unavailable', stage: 'read-policy', retryable: true, correlation: 'test' }), { status: 200 }))
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    cleanups.push(() => { act(() => root.unmount()); container.remove() })
    await act(async () => { root.render(createElement(DesktopPage)) })
    expect(container.querySelector('[data-desktop-read="blocked"]')).not.toBeNull()
    expect(node(container, '#desktop-read-status').textContent).toContain('projection-read-unavailable')
    write(container, '保持本地')
    click(button(container, '发送任务'))
    expect(node<HTMLTextAreaElement>(container, 'textarea').value).toBe('保持本地')
    expect(requests).toHaveBeenCalledTimes(1)
    expect(requests.mock.calls[0]?.[0]).toBe('/.sage/state')
    expect(requests.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('collapses and expands the sidebar without hiding the draft or losing named navigation', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '折叠侧栏时保留')
    click(button(container, '收起侧栏'))
    expect(node(container, '#desktop-sidebar-content').hidden).toBe(true)
    expect(input.value).toBe('折叠侧栏时保留')
    click(button(container, '展开侧栏'))
    expect(node(container, '#desktop-sidebar-content').hidden).toBe(false)
    expect(node(container, 'aside').textContent).toContain('知识中心')
    expect(input.value).toBe('折叠侧栏时保留')
  })

  it('keeps suggestions local and does not replace a nonempty draft', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    click(button(container, '帮我梳理一个想法'))
    expect(node<HTMLTextAreaElement>(container, 'textarea').value).toBe('帮我梳理一个想法')
    write(container, '自己的版本')
    click(button(container, '制作一个小工具'))
    expect(node<HTMLTextAreaElement>(container, 'textarea').value).toBe('自己的版本')
    expect(node(container, '.composer-local-note').textContent).toContain('不会覆盖')
    expect(requests).not.toHaveBeenCalled()
  })

  it('changes activity categories without inventing counts and keeps the draft', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '切换统计仍保留')
    click(button(container, 'Credits'))
    expect(node(container, '.activity-unavailable').textContent).toContain('Credits活动数据不可用')
    expect(button(container, 'Credits').getAttribute('aria-pressed')).toBe('true')
    expect(node(container, '.activity-card').textContent).not.toMatch(/\d+/)
    expect(input.value).toBe('切换统计仍保留')
    expect(requests).not.toHaveBeenCalled()
  })

  it('keeps the full sidebar, home, activity area and composer while the initial read is pending', () => {
    const pending = deferred<DesktopRead>()
    const { container } = mount(() => pending.promise)
    expect(container.textContent).toContain('正在读取服务状态')
    expect(container.querySelector('[data-desktop-read="loading"]')).not.toBeNull()
    for (const label of ['编程', '通用', '新任务', '搜索', '工作区', '知识中心', '站点', '自动化', '扩展', '账号与设置']) {
      expect(node(container, 'aside').textContent).toContain(label)
    }
    expect(node(container, 'h1').textContent).toBe('不止于编程')
    expect(container.querySelector('.welcome-content .activity-card')).not.toBeNull()
    expect(container.querySelector('.home-composer .composer textarea')).not.toBeNull()
    expect(container.querySelector('.composer-toolbar .composer-tools')).not.toBeNull()
    expect(container.querySelector('.composer-context')).not.toBeNull()
    expect(container.querySelector('.heatmap span, .sidebar-task, [data-observation]')).toBeNull()
    expect(container.textContent).not.toMatch(/paper-plane|292 Credits|原型虚构账号|三宝设计团队|UI 原型规划|demo\.html/)
    expect(document.documentElement.dataset.sageThemeEffective).toBe('unknown')
    expect(requests).not.toHaveBeenCalled()
  })

  it('renders a denial as blocked rather than signed-out, model readiness or an empty activity history', async () => {
    const read = deferred<DesktopRead>()
    const { container } = mount(() => read.promise)
    const input = write(container, '不要丢失的草稿')
    await act(async () => { read.resolve(blocked) })
    expect(container.querySelector('[data-desktop-read="blocked"]')).not.toBeNull()
    expect(node(container, '#desktop-read-status').textContent).toContain('读取被拒绝')
    expect(node(container, '#desktop-read-status').textContent).toContain('projection-read-unavailable')
    expect(container.textContent).not.toMatch(/未登录|请先登录|模型已就绪|没有会话|已发送/)
    expect(input.value).toBe('不要丢失的草稿')
    expect(node(container, '.activity-card').textContent).toContain('活动数据不可用')
  })

  it('re-reads on retry, clears stale runtime facts and retains newer input through loading and unavailable', async () => {
    const retry = deferred<DesktopRead>()
    const read = vi.fn<() => Promise<DesktopRead>>().mockResolvedValueOnce(ready).mockReturnValueOnce(retry.promise)
    const { container } = mount(read)
    await settle()
    expect(node(container, '#desktop-read-status').textContent).toContain('运行时已连接')
    write(container, '第一版')
    click(button(container, '重新读取状态'))
    expect(container.querySelector('[data-desktop-read="loading"]')).not.toBeNull()
    expect(node(container, '#desktop-read-status').textContent).not.toContain('运行时已连接')
    expect(node<HTMLButtonElement>(container, '#desktop-read-retry').disabled).toBe(true)
    const input = write(container, '等待期间的新版本')
    await act(async () => { retry.resolve({ kind: 'unavailable' }) })
    expect(container.querySelector('[data-desktop-read="unavailable"]')).not.toBeNull()
    expect(node(container, '#desktop-read-status').textContent).toContain('服务状态不可用')
    expect(input.value).toBe('等待期间的新版本')
    expect(read).toHaveBeenCalledTimes(2)
    expect(requests).not.toHaveBeenCalled()
  })

  it.each(['ready', 'recovering', 'unavailable'] as const)('renders read runtime %s without claiming successful sending', async status => {
    const { container } = mount(async () => ({ kind: 'read', runtime: { status, message: `安全状态：${status}`, retryable: true } }))
    await settle()
    expect(container.querySelector('[data-desktop-read="read"]')).not.toBeNull()
    expect(node(container, '#desktop-read-status').textContent).toContain(`安全状态：${status}`)
    expect(container.textContent).not.toMatch(/发送成功|模型已就绪/)
    expect(node(container, '.activity-card').textContent).toContain('活动数据不可用')
  })

  it('contains a rejected read without leaking its exception or erasing input', async () => {
    const { container } = mount(async () => { throw new Error('private-provider-path-canary') })
    const input = write(container, '保留输入')
    await settle()
    expect(container.querySelector('[data-desktop-read="unavailable"]')).not.toBeNull()
    expect(container.textContent).not.toContain('private-provider-path-canary')
    expect(input.value).toBe('保留输入')
  })

  it('ignores a stale read when the injected reader changes', async () => {
    const old = deferred<DesktopRead>()
    const current = deferred<DesktopRead>()
    const { container, render } = mount(() => old.promise)
    const input = write(container, '新读数的草稿')
    render(() => current.promise)
    await act(async () => { current.resolve(blocked) })
    await act(async () => { old.resolve(ready) })
    expect(container.querySelector('[data-desktop-read="blocked"]')).not.toBeNull()
    expect(container.textContent).not.toContain('运行时已连接')
    expect(input.value).toBe('新读数的草稿')
  })
})

describe('T01 composer has no business write authority', () => {
  it('preserves text on repeated button/Enter submission and explains the missing successful send integration', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '  一份待办\n第二行  ')
    const send = button(container, '发送任务')
    act(() => { send.click(); send.click() })
    key(input, 'Enter')
    key(input, 'Enter', { repeat: true })
    expect(node(container, '.composer-local-note').textContent).toContain('发送尚未接通')
    expect(node(container, '.composer-local-note').textContent).toContain('草稿已保留')
    expect(input.value).toBe('  一份待办\n第二行  ')
    expect(container.textContent).not.toMatch(/发送成功|已受理|已创建会话/)
    expect(container.querySelector('[data-session-id]')).toBeNull()
    expect(requests).not.toHaveBeenCalled()
  })

  it('does nothing for whitespace-only input', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, ' \n ')
    expect(button(container, '发送任务').disabled).toBe(true)
    key(input, 'Enter')
    expect(container.querySelector('.composer-local-note')).toBeNull()
    expect(input.value).toBe(' \n ')
    expect(requests).not.toHaveBeenCalled()
  })

  it('does not submit IME Enter or consume Shift+Enter, and accepts subsequent newline input', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '中文输入')
    const composing = key(input, 'Enter', { isComposing: true })
    const legacyIme = key(input, 'Enter', { keyCode: 229 })
    const shift = key(input, 'Enter', { shiftKey: true })
    expect(composing.defaultPrevented).toBe(false)
    expect(legacyIme.defaultPrevented).toBe(false)
    expect(shift.defaultPrevented).toBe(false)
    expect(container.querySelector('.composer-local-note')).toBeNull()
    // jsdom does not implement native text editing; apply the browser's ensuing input event.
    write(container, '中文输入\n下一行')
    expect(input.value).toBe('中文输入\n下一行')
    expect(requests).not.toHaveBeenCalled()
  })

  it('keeps the draft above local navigation and never silently discards it for new-task', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    write(container, '未提交的原文')
    for (const label of ['搜索', '工作区', '知识中心', '站点', '自动化', '扩展', '账号与设置']) {
      click(button(container, label))
      expect(node(container, 'h1').textContent).toBe(label)
      expect(node(container, '.outstanding-feature').textContent).toContain('尚未接通')
      expect(node(container, 'aside').textContent).toContain('知识中心')
      click(button(container, '新任务'))
      expect(node(container, 'h1').textContent).toBe('不止于编程')
      expect(node<HTMLTextAreaElement>(container, 'textarea').value).toBe('未提交的原文')
      expect(node(container, '.composer-local-note').textContent).toContain('草稿已保留')
    }
    expect(requests).not.toHaveBeenCalled()
  })

  it('shows unavailable context actions, closes on Escape and restores actual focus', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '上下文未接通也不丢失')
    const opener = button(container, '添加上下文')
    opener.focus()
    click(opener)
    const menu = node(container, '[role="menu"]')
    for (const name of ['目标', '计划', '站点', '工作区文件', '插件', '技能']) {
      expect(menu.textContent).toContain(name)
    }
    expect(menu.textContent).toContain('不可用')
    expect(menu.contains(document.activeElement)).toBe(true)
    key(document.activeElement as HTMLElement, 'ArrowDown')
    expect(document.activeElement?.textContent).toContain('计划')
    key(document.activeElement as HTMLElement, 'Escape')
    expect(container.querySelector('[role="menu"]')).toBeNull()
    expect(opener.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(opener)
    expect(input.value).toBe('上下文未接通也不丢失')
    expect(requests).not.toHaveBeenCalled()
  })

  it('reports a selected unavailable context action without adding a fake file or skill chip', async () => {
    const { container } = mount(async () => blocked)
    await settle()
    const input = write(container, '需要真实文件')
    click(button(container, '添加上下文'))
    click(button(container, '工作区文件：不可用'))
    expect(node(container, '.composer-local-note').textContent).toContain('工作区文件尚未接通')
    expect(container.querySelector('.composer-context-chip')).toBeNull()
    expect(input.value).toBe('需要真实文件')
    expect(requests).not.toHaveBeenCalled()
  })
})

describe('T01 desktop entry and token-only geometry', () => {
  it('loads the geometry stylesheet without introducing a second palette', async () => {
    const { SAGE_DESKTOP_CSS } = await import('../../src/product/app/desktop/styles.js')
    const style = document.createElement('style')
    style.textContent = SAGE_DESKTOP_CSS
    document.head.append(style)
    cleanups.push(() => style.remove())
    const { container } = mount(async () => blocked)
    await settle()
    expect(getComputedStyle(node(container, '.product-sidebar')).width).toBe('240px')
    expect(getComputedStyle(node(container, '.composer textarea')).height).toBe('58px')
    expect(getComputedStyle(node(container, '.composer-toolbar')).minHeight).toBe('37px')
    expect(getComputedStyle(node(container, '.composer-context')).display).toBe('flex')
    expect(getComputedStyle(node(container, '.activity-unavailable')).minHeight).toBe('84px')
    expect(SAGE_DESKTOP_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|--[\w-]+\s*:|var\([^)]*,/i)
    const names = ['canvas', 'sidebar', 'surface', 'raised', 'overlay', 'ink', 'muted', 'faint', 'divider', 'border', 'brand', 'focus', 'success', 'warning', 'danger', 'radius', 'shadow', 'spacing', 'motion']
    const tokens = Array.from(SAGE_DESKTOP_CSS.matchAll(/var\(--([\w-]+)\)/g), match => match[1])
    expect(tokens.length).toBeGreaterThan(0)
    for (const token of tokens) expect(names.map(name => `sage-${name}`)).toContain(token)
  })

  it('mounts into the desktop root, injects CSS, and marks mounted only after React effects', async () => {
    const container = document.createElement('div')
    container.id = 'sage-desktop-root'
    document.body.append(container)
    const roots = vi.mocked(createRoot)
    const previousCount = roots.mock.results.length
    cleanups.push(() => {
      const result = roots.mock.results[previousCount]
      if (result?.type === 'return') act(() => result.value.unmount())
      container.remove()
      document.querySelector('[data-sage-desktop-styles]')?.remove()
    })
    requests.mockResolvedValue(new Response(JSON.stringify({ code: 'projection-read-unavailable', stage: 'read-policy', retryable: true, correlation: 'test' }), { status: 200 }))
    let beforeEffect: string | undefined
    await act(async () => {
      await import('../../src/product/app/desktop/main.js')
      beforeEffect = container.dataset.sageDesktopMounted
    })
    expect(beforeEffect).toBeUndefined()
    expect(container.dataset.sageDesktopMounted).toBe('true')
    expect(container.querySelector('textarea[aria-label="任务输入"]')).not.toBeNull()
    expect(document.head.querySelector('[data-sage-desktop-styles]')?.textContent).toContain('.product-sidebar')
    expect(document.documentElement.dataset.sageThemeEffective).toBe('unknown')
  })
})
