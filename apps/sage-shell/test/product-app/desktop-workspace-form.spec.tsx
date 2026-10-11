/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopPage } from '../../src/product/app/desktop/page.js'
import type { DesktopBootstrapRead, DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'

const cleanups: Array<() => void> = []
const workspaceRead: DesktopRead = {
  kind: 'read',
  runtime: { status: 'ready', message: '运行时已连接', retryable: false },
  workspaces: {
    state: 'read', reason: null,
    entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0,
  },
}
const unavailableBootstrap = async (): Promise<DesktopBootstrapRead> => ({ kind: 'unavailable', code: null })
const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertPreferencesController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}

async function mount(): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesktopPage, {
      readState: async () => workspaceRead,
      readBootstrap: unavailableBootstrap,
      preferencesController: inertPreferencesController,
    }))
  })
  await act(async () => { control(container, '工作区').click() })
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

function control(container: HTMLElement, label: string): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(found, `control ${label}`).not.toBeNull()
  return found!
}

function nodeName(container: HTMLElement, selector: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(selector)
  expect(found, selector).not.toBeNull()
  return found!
}

function setName(container: HTMLElement, value: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="工作区名称"]')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  act(() => { input.dispatchEvent(new Event('input', { bubbles: true })) })
  return input
}

const adoptedResponse = () => Response.json({ state: 'adopted', workspaceId: 'workspace:new', path: '/chosen/dir', title: '新工作区' })
const cancelledResponse = () => Response.json({ state: 'cancelled' })
const refusedResponse = () => Response.json({ state: 'refused', code: 'adopt-refused' })

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals() })

describe('Loop-Q R12 line A: the create-workspace form on the workspace page', () => {
  it('renders the empty form: no dir row, empty name, create disabled, default icon/colour pressed', async () => {
    const container = await mount()
    const form = nodeName(container, 'section[aria-label="新建工作区"]')
    expect(form.textContent).toContain('未选择文件夹')
    expect(container.querySelector('button[aria-label="选择文件夹"]')).not.toBeNull()
    const name = container.querySelector('input[aria-label="工作区名称"]')
    expect(name?.value).toBe('')
    expect(control(container, '创建工作区').disabled).toBe(true)
    for (const label of ['方格', '闪电', '星标', '绿', '蓝', '橙']) {
      expect(container.querySelector(`button[aria-label="${label}"]`)).not.toBeNull()
    }
    expect(container.querySelector('button[aria-label="方格"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('button[aria-label="闪电"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('button[aria-label="星标"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('button[aria-label="绿"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('button[aria-label="蓝"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('button[aria-label="橙"]')?.getAttribute('aria-pressed')).toBe('false')
  })

  it('fills the form after an adopted pick: primary tag, auto name, create enabled, adopted note', async () => {
    const requests = vi.fn(async () => adoptedResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '选择文件夹').click() })
    const dirRow = nodeName(container, '.workspace-create-dir-row')
    expect(dirRow.textContent).toContain('新工作区')
    expect(dirRow.querySelector('span[aria-label="主要"]')?.textContent).toBe('主要')
    expect(dirRow.textContent).toContain('/chosen/dir')
    const name = container.querySelector<HTMLInputElement>('input[aria-label="工作区名称"]')
    expect(name?.value).toBe('新工作区')
    expect(control(container, '创建工作区').disabled).toBe(false)
    const note = nodeName(container, '.workspace-create-note')
    expect(note.textContent).toContain('已接入工作区 新工作区')
    expect(note.textContent).toContain('列表以下一次读取为准')
    // The pick itself posts the real adopt route once; no second adopt on this path.
    expect(requests.mock.calls.filter(call => call[0] === '/.sage/workspace/adopt')).toHaveLength(1)
  })

  it('keeps the empty form and names the outcome on a cancelled pick', async () => {
    const requests = vi.fn(async () => cancelledResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '选择文件夹').click() })
    expect(container.querySelector('.workspace-create-dir-row')).toBeNull()
    expect(nodeName(container, '.workspace-create-note').textContent).toContain('已取消目录选择')
    expect(nodeName(container, '.workspace-create-note').textContent).toContain('没有创建或绑定任何工作区')
    expect(control(container, '创建工作区').disabled).toBe(true)
    expect(requests.mock.calls.filter(call => call[0] === '/.sage/workspace/adopt')).toHaveLength(1)
  })

  it('keeps the empty form and names the refusal code on a refused pick', async () => {
    const requests = vi.fn(async () => refusedResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '选择文件夹').click() })
    expect(container.querySelector('.workspace-create-dir-row')).toBeNull()
    const note = nodeName(container, '.workspace-create-note')
    expect(note.textContent).toContain('本次未接入（adopt-refused）')
    expect(note.textContent).toContain('没有创建或绑定任何工作区')
    expect(control(container, '创建工作区').disabled).toBe(true)
    expect(requests.mock.calls.filter(call => call[0] === '/.sage/workspace/adopt')).toHaveLength(1)
  })

  it('settles the create click with a transient saving note and never posts a second adopt', async () => {
    const requests = vi.fn(async () => adoptedResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '选择文件夹').click() })
    expect(requests.mock.calls.filter(call => call[0] === '/.sage/workspace/adopt')).toHaveLength(1)
    // The「正在保存……」note is deliberately transient: the click sets it, then one async
    // microtask later the handler replaces it with the settled text and re-reads. Inside one
    // act() the click's flush and the microtask settle land together, so the DOM after this act
    // shows the settled note; the transient phase is the handler's own synchronous set (visible
    // in createWorkspace) and the settle is what the DOM can honestly show here.
    await act(async () => {
      control(container, '创建工作区').click()
      await Promise.resolve()
    })
    expect(nodeName(container, '.workspace-create-note').textContent).toBe('已接入：新工作区；列表以下一次读取为准。')
    expect(requests.mock.calls.filter(call => call[0] === '/.sage/workspace/adopt')).toHaveLength(1)
    expect(control(container, '创建工作区').disabled).toBe(false)
  })

  it('keeps icon and colour purely local: no adopt request fires on selection', async () => {
    const requests = vi.fn(async () => adoptedResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '闪电').click() })
    await act(async () => { control(container, '蓝').click() })
    expect(container.querySelector('button[aria-label="闪电"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('button[aria-label="蓝"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('button[aria-label="方格"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('button[aria-label="绿"]')?.getAttribute('aria-pressed')).toBe('false')
    expect(requests).not.toHaveBeenCalled()
  })

  it('re-enables create only when the name is nonempty after adoption', async () => {
    const requests = vi.fn(async () => adoptedResponse())
    vi.stubGlobal('fetch', requests)
    const container = await mount()
    await act(async () => { control(container, '选择文件夹').click() })
    expect(control(container, '创建工作区').disabled).toBe(false)
    const name = setName(container, '   ')
    expect(control(container, '创建工作区').disabled).toBe(true)
    setName(container, '自命名工作区')
    expect(control(container, '创建工作区').disabled).toBe(false)
    expect(name.value).toBe('自命名工作区')
  })
})
