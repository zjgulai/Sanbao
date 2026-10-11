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
    const toggle = page.querySelector('[aria-label="视图切换"]')
    expect(toggle?.textContent).toContain('卡片')
    expect(toggle?.textContent).toContain('列表')
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

  it('keeps neither page carrying submit, create or generate action buttons', async () => {
    const container = await mount(async () => snapshot())
    await click(control(container, '知识中心'))
    const knowledge = section(container, '知识中心')
    expect(knowledge.querySelector('button[type="submit"]')).toBeNull()
    expect(knowledge.textContent).not.toContain('创建')
    expect(knowledge.textContent).not.toContain('生成')
    await click(control(container, '站点'))
    const sites = section(container, '站点')
    expect(sites.querySelector('button[type="submit"]')).toBeNull()
    expect(sites.textContent).not.toContain('创建站点')
  })
})
