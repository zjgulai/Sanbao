/** @vitest-environment jsdom */
/** Loop-Q R9 (OBS02/OBS03): the knowledge-centre and sites page shells. The data area shows the
 *  named not-wired reason — "no provider" is never rendered as an empty list. */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { classifyDesktopState, type DesktopBootstrapRead, type DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
import { DesktopPage } from '../../src/product/app/desktop/page.js'
import { desktopSessionPayload } from '../support/desktop-session-fixture.js'

const cleanups: Array<() => void> = []
const unavailableBootstrap = async (): Promise<DesktopBootstrapRead> => ({ kind: 'unavailable', code: null })
const unavailablePreferences = { kind: 'unavailable' as const, code: null }
const inertPreferencesController: DevicePreferencesController = {
  snapshot: () => ({ read: unavailablePreferences, saving: false, lastSave: 'idle' }),
  subscribe: () => () => undefined,
  refresh: async () => unavailablePreferences,
  save: async () => ({ outcome: 'refused', read: unavailablePreferences }),
}
const snapshot = (): DesktopRead => classifyDesktopState(desktopSessionPayload())
async function mount(readState: () => Promise<DesktopRead>): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesktopPage, {
      readState,
      readBootstrap: unavailableBootstrap,
      preferencesController: inertPreferencesController,
    }))
  })
  cleanups.push(() => { act(() => { root.unmount() }); container.remove() })
  return container
}
const control = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `control ${label}`).not.toBeNull()
  return button!
}
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
const type = async (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
}
const section = (container: HTMLElement, label: string): HTMLElement => {
  const found = container.querySelector<HTMLElement>(`section[aria-label="${label}"]`)
  expect(found, `section ${label}`).not.toBeNull()
  return found!
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals() })

describe('knowledge-centre and sites page shells (Loop-Q R9)', () => {
  it('reaches both pages from the sidebar entries by their h1 titles', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    expect(container.querySelector('h1')?.textContent).toBe('知识中心')
    await click(control(container, '站点'))
    expect(container.querySelector('h1')?.textContent).toBe('站点')
  })

  it('shows the knowledge tab with its view toggle and the named not-wired reason, never an empty list (knowledge.empty)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    const tabs = page.querySelector('[role="tablist"][aria-label="知识视图"]')
    expect(tabs?.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(tabs?.querySelector('[role="tab"][aria-label="知识库"]')?.getAttribute('aria-selected')).toBe('true')
    expect(tabs?.querySelector('[role="tab"][aria-label="Repo Wiki"]')?.getAttribute('aria-selected')).toBe('false')
    const toggle = page.querySelector('[aria-label="知识库工具"]')
    expect(toggle?.textContent).toContain('卡片')
    expect(toggle?.textContent).toContain('列表')
    expect(toggle?.textContent).toContain('创建知识库')
    const note = page.querySelector('[role="status"]')
    expect(note?.textContent).toContain('知识库服务未接通（knowledge-store-unavailable）')
    expect(page.textContent).not.toContain('还没有知识库')
  })

  it('switches the Repo Wiki tab to its filter pair and search input with the named reason, never no-match (repo-wiki.search.empty)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    await click(control(page, 'Repo Wiki'))
    expect(page.querySelector('[role="tab"][aria-label="Repo Wiki"]')?.getAttribute('aria-selected')).toBe('true')
    const filter = page.querySelector('[aria-label="Repo Wiki 筛选"]')
    expect(filter?.textContent).toContain('全部')
    expect(filter?.textContent).toContain('已生成')
    const search = page.querySelector<HTMLInputElement>('input[aria-label="搜索 Repo Wiki 项目"]')
    expect(search?.placeholder).toBe('搜索项目')
    const note = page.querySelector('[role="status"]')
    expect(note?.textContent).toContain('知识库服务未接通（knowledge-store-unavailable）')
    expect(page.textContent).not.toContain('没有匹配')
    // Typing a query keeps the query and the named reason — no source to search, never a
    // fabricated no-match result (the observation typed a query into this exact input).
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'sanbao-fixture')
    await act(async () => { search!.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(search!.value).toBe('sanbao-fixture')
    expect(page.querySelector('[role="status"]')?.textContent).toContain('知识库服务未接通')
  })

  it('keeps the sites page on two tabs and the named not-wired reason on both, never an empty list (sites.empty / sites.shared.empty)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '站点'))
    const page = section(container, '站点')
    const tabs = page.querySelector('[role="tablist"][aria-label="站点视图"]')
    expect(tabs?.querySelectorAll('[role="tab"]')).toHaveLength(2)
    expect(tabs?.querySelector('[role="tab"][aria-label="我的站点"]')?.getAttribute('aria-selected')).toBe('true')
    expect(page.querySelector('[role="status"]')?.textContent).toContain('站点服务未接通（sites-store-unavailable）')
    expect(page.textContent).not.toContain('还没有站点')
    await click(control(page, '共享给我的'))
    expect(page.querySelector('[role="tab"][aria-label="共享给我的"]')?.getAttribute('aria-selected')).toBe('true')
    expect(page.querySelector('[role="status"]')?.textContent).toContain('站点服务未接通（sites-store-unavailable）')
    expect(page.textContent).not.toContain('还没有站点')
  })

  it('falls back to the default named reason when the read carries no readoutKnowledge slot', async () => {
    const read = classifyDesktopState(desktopSessionPayload())
    expect(read.kind === 'read' && 'readoutKnowledge' in read).toBe(false)
    const container = await mount(async () => read)
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    expect(page.querySelector('[role="status"]')?.textContent).toContain('知识库服务未接通（knowledge-store-unavailable）')
  })

  it('carries the wired readout reason from the state envelope into the note', async () => {
    const wired = classifyDesktopState({ ...desktopSessionPayload(), readout: { knowledge: { state: 'not-wired', reason: 'knowledge-store-unavailable' } } })
    expect(wired.kind === 'read' && wired.readoutKnowledge?.reason).toBe('knowledge-store-unavailable')
    const container = await mount(async () => wired)
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    expect(page.querySelector('[role="status"]')?.textContent).toContain('知识库服务未接通（knowledge-store-unavailable）')
  })

  it('keeps every action path fail-closed: no submit forms, no fabricated generate entries', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const knowledge = section(container, '知识中心')
    expect(knowledge.querySelector('button[type="submit"]')).toBeNull()
    // 创建知识库 opens the dialog (R10); its own 创建 answers the named refusal, never creates.
    await click(control(knowledge, '创建知识库'))
    expect(knowledge.querySelector('[role="dialog"]')).not.toBeNull()
    await click(control(knowledge, '取消'))
    expect(knowledge.querySelector('[role="dialog"]')).toBeNull()
    await click(control(container, '站点'))
    const sites = section(container, '站点')
    expect(sites.querySelector('button[type="submit"]')).toBeNull()
    expect(sites.textContent).not.toContain('创建站点')
    expect(sites.textContent).not.toContain('生成')
  })

  it('opens the create dialog with the observed shape and fail-closed create (knowledge.create.open)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    await click(control(page, '创建知识库'))
    const dialog = page.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.textContent).toContain('创建知识库')
    const name = dialog.querySelector<HTMLInputElement>('input[aria-label="知识库名称"]')!
    expect(name.placeholder).toBe('例如：工程手册')
    expect(name.value).toBe('')
    expect(name.maxLength).toBe(50)
    expect(dialog.textContent).toContain('0/50')
    expect(dialog.querySelector<HTMLInputElement>('input[aria-label="用户"]')?.checked).toBe(true)
    expect(dialog.textContent).toContain('当前用户的所有现有及未来工作区均可使用此知识库')
    expect(control(dialog, '创建').disabled).toBe(true)
    expect(control(dialog, '关闭')).not.toBeNull()
    expect(control(dialog, '取消')).not.toBeNull()
  })

  it('switches the create dialog to the workspace scope with selection chips (create.workspace / create.ready)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    await click(control(page, '创建知识库'))
    const dialog = page.querySelector('[role="dialog"]') as HTMLElement
    await click(dialog.querySelector('input[aria-label="工作区"]') as HTMLElement)
    expect(dialog.textContent).toContain('至少选择一个可以使用此知识库的工作区')
    expect(control(dialog, '创建').disabled).toBe(true)
    await click(control(dialog, '选择工作区'))
    // The fixture carries one workspace; picking it plus a name reaches the observed ready state.
    await click(control(dialog, '工作区选项 工作区'))
    expect(dialog.querySelector('[aria-label="已选工作区"]')?.textContent).toContain('工作区')
    await type(dialog.querySelector<HTMLInputElement>('input[aria-label="知识库名称"]')!, 'sanbao-fixture-kb')
    expect(dialog.textContent).toContain('17/50')
    const create = control(dialog, '创建')
    expect(create.disabled).toBe(false)
    // Ready is not created: the click answers the named T12 refusal.
    await click(create)
    expect(dialog.textContent).toContain('创建尚未接通')
    expect(dialog.textContent).not.toContain('已创建')
  })

  it('opens the workspace filter menu from the knowledge list tools (workspace-filter.open)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    await click(control(page, '全部工作区'))
    const menu = page.querySelector('[aria-label="工作区筛选"]') as HTMLElement
    expect(menu.textContent).toContain('全部工作区')
    expect(menu.textContent).toContain('工作区')
    await click(menu.querySelectorAll('[role="menuitemradio"]')[1] as HTMLElement)
    // The trigger keeps its stable label; its text names the picked scope.
    expect(control(page, '全部工作区').textContent).toBe('工作区')
    expect(page.querySelector('[aria-label="工作区筛选"]')).toBeNull()
  })

  it('shows the Repo Wiki default shape: three filters, view toggle, never a zero metric (repo-wiki.default / repo-wiki.list)', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const page = section(container, '知识中心')
    await click(control(page, 'Repo Wiki'))
    expect(page.textContent).toContain('将代码转化为 Repo Wiki／涵盖技术栈与架构')
    const filter = page.querySelector('[aria-label="Repo Wiki 筛选"]') as HTMLElement
    for (const label of ['全部', '已生成', '未生成']) {
      expect(filter.textContent).toContain(label)
    }
    const viewToggle = filter.querySelector('[aria-label="Repo Wiki 视图切换"]') as HTMLElement
    expect(viewToggle.textContent).toContain('卡片')
    expect(viewToggle.textContent).toContain('列表')
    // Both views stay on the named not-wired note — no fabricated card, no zero-metric row.
    await click((viewToggle.querySelectorAll('button')[1] as HTMLElement))
    expect(page.querySelector('[role="status"]')?.textContent).toContain('知识库服务未接通')
    expect(page.textContent).not.toContain('去生成')
  })
})
