/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopPage } from '../../src/product/app/desktop/page.js'
import { classifyDesktopState, type DesktopBootstrapRead, type DesktopRead } from '../../src/product/app/desktop/client.js'
import type { DevicePreferencesController } from '../../src/product/app/desktop/device-preferences.js'
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

async function mount(readState: () => Promise<DesktopRead>) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(DesktopPage, { readState, readBootstrap: unavailableBootstrap, preferencesController: inertPreferencesController }))
  })
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return container
}
const control = (container: HTMLElement, label: string) => {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button, `control ${label}`).not.toBeNull()
  return button!
}
const click = async (node: HTMLElement) => { await act(async () => { node.click() }) }
const fetcher = vi.fn(async () => Response.json({ state: 'accepted', sessionId: 'session:one', requestId: 'request:one', mode: 'queue' }))
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher) })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals() })

const SIDE_CHATS = {
  state: 'read', code: null,
  items: [{
    sideChatId: 'side:1', sessionId: 'session:one', atSeq: 12, createdAt: '2026-10-11T00:00:00Z',
    execution: 'idle', lastTurnEnd: null,
  }],
}

describe('the session side-chat roster (ADR-0316 R16/P15)', () => {
  it('renders read rows and names every action as unwired without posting anything', async () => {
    const read = classifyDesktopState({
      ...desktopSessionPayload(),
      sideChats: SIDE_CHATS,
    })
    const callsBefore = fetcher.mock.calls.length
    const container = await mount(async () => read)
    const section = container.querySelector('[aria-label="侧聊"]')
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain('侧聊（1）')
    expect(section?.textContent).toContain('side:1')
    expect(section?.textContent).toContain('空闲')
    expect(section?.textContent).toContain('派生自 session:one（锚点 12）')
    await click(control(container, '发送到侧聊 side:1'))
    expect(container.textContent).toContain('「发送到侧聊」尚未接通（写路径 admission 收口在独立批——本版不提交任何动作）。')
    await click(control(container, '带回主对话 side:1'))
    expect(container.textContent).toContain('「带回主对话」尚未接通')
    await click(control(container, '单独回看 side:1'))
    expect(container.textContent).toContain('「单独回看」尚未接通')
    await click(control(container, '新建侧聊'))
    expect(container.textContent).toContain('「新建侧聊（派生主对话）」尚未接通')
    // Nothing was posted for any action: the roster never rides the violation route.
    expect(fetcher.mock.calls.length).toBe(callsBefore)
  })

  it('names an unavailable read and keeps an empty read distinct from it', async () => {
    const unavailable = classifyDesktopState({
      ...desktopSessionPayload(),
      sideChats: { state: 'unavailable', code: 'side-chat-unavailable', items: [] },
    })
    const first = await mount(async () => unavailable)
    expect(first.querySelector('[aria-label="侧聊"]')?.textContent)
      .toContain('侧聊读取不可用（side-chat-unavailable）——不据此断言无侧聊。')
    const empty = classifyDesktopState({
      ...desktopSessionPayload(),
      sideChats: { state: 'read', code: null, items: [] },
    })
    const second = await mount(async () => empty)
    expect(second.querySelector('[aria-label="侧聊"]')?.textContent).toContain('当前没有侧聊。')
    // A malformed slot is omitted entirely — absence is not an empty roster.
    const malformed = classifyDesktopState({ ...desktopSessionPayload(), sideChats: { state: 'read', code: null, items: [{ sideChatId: '' }] } })
    const third = await mount(async () => malformed)
    expect(third.querySelector('[aria-label="侧聊"]')).toBeNull()
  })
})
