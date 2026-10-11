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
const ack = () => Response.json({ state: 'accepted', sessionId: 'session:one', requestId: 'request:one', mode: 'queue' })

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
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', vi.fn(async () => ack())) })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); vi.unstubAllGlobals() })

const MATTER_PAYLOAD = {
  matterList: {
    state: 'read', code: null,
    items: [
      { itemId: 'matter:one', matterRef: 'matter:one', title: '走查事项', partition: 'action', triggers: [{ kind: 'pending-inputs', ref: 'p1', count: 2 }], acceptanceCandidateCount: 0, lifecycle: 'active', updatedAt: '2026-10-11T00:00:00Z' },
      { itemId: 'matter:two', matterRef: 'matter:two', title: '已归档事项', partition: 'in-progress', triggers: [], acceptanceCandidateCount: 0, lifecycle: 'archived', updatedAt: '2026-10-11T00:00:00Z' },
    ],
    counts: { action: 1, inProgress: 1, acceptance: 0 },
  },
  matterAdmin: {
    state: 'read',
    entries: [{ matterRef: 'matter:two', archivedAt: '2026-10-11T00:00:00Z', ground: 'completed' }],
    trail: [{ at: '2026-10-11T00:00:00Z', action: 'archive', matterRef: 'matter:two', ground: 'completed' }],
    rename: { matterRef: 'matter:one', requested: '旧名', effective: '走查事项', at: '2026-10-11T00:00:00Z' },
    batch: { operation: 'archive', rows: [{ matterRef: 'matter:two', outcome: 'ok', code: null }], okCount: 1, refusedCount: 0 },
  },
  matterGroups: {
    state: 'read', code: null,
    groups: [{ groupId: 'group:1', name: '走查组', memberIds: ['matter:one'], createdAt: '2026-10-11T00:00:00Z', updatedAt: '2026-10-11T00:00:00Z' }],
    trail: [{ at: '2026-10-11T00:00:00Z', action: 'create', groupId: 'group:1', name: '走查组', count: 1 }],
    rename: null,
    batch: { operation: 'add', groupId: 'group:1', rows: [{ itemId: 'matter:one', outcome: 'ok', code: null }], okCount: 1, unchangedCount: 0, refusedCount: 0 },
  },
}

describe('the workspace matter section (ADR-0316 R16/O04; L1-A.2 ADR-0320)', () => {
  it('renders the roster, the administration read-backs and the real action entries for the current matter', async () => {
    const read = classifyDesktopState({ ...desktopSessionPayload(), ...MATTER_PAYLOAD })
    const container = await mount(async () => read)
    await click(control(container, '工作区'))
    const section = container.querySelector('[aria-label="事项"]')
    expect(section).not.toBeNull()
    expect(section?.textContent).toContain('待我处理 1 · 进行中 1 · 验收 0')
    expect(section?.textContent).toContain('走查事项')
    expect(section?.textContent).toContain('触发：待继续输入×2')
    expect(section?.textContent).toContain('已归档')
    expect(section?.textContent).toContain('已完成归档')
    expect(section?.textContent).toContain('最近重命名：旧名 → 走查事项（以服务回读为准）')
    expect(section?.textContent).toContain('最近批量（归档）：共 1 · 受理 1 / 拒绝 0')
    expect(section?.textContent).toContain('走查组')
    expect(section?.textContent).toContain('1 项')
    expect(section?.textContent).toContain('最近成员批量（加入）：受理 1 / 未变 0 / 拒绝 0')
    expect(section?.textContent).toContain('批量与分组写路径尚未接通（L1-B 与选择态）')
    expect(section?.textContent).toContain('建立/改名/移除/成员变更尚未接通（写路径 admission 收口在独立批——本版不提供动作入口）。')
    // L1-A.2: the current matter (fixture session context = matter:one) carries the real entries —
    // rename + the two archive grounds; matter:two is archived but NOT current, so no restore here.
    expect(section?.querySelector('button[aria-label="重命名当前事项"]')).not.toBeNull()
    expect(section?.querySelector('button[aria-label="归档当前事项（已完成）"]')).not.toBeNull()
    expect(section?.querySelector('button[aria-label="归档当前事项（已停止）"]')).not.toBeNull()
    expect(section?.querySelector('button[aria-label="恢复当前事项"]')).toBeNull()
  })

  it('posts the admitted actions with the current matter ref and re-reads the read-backs', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/.sage/matter-admin') return Response.json({ state: 'renamed', status: MATTER_PAYLOAD.matterAdmin })
      return ack()
    })
    vi.stubGlobal('fetch', fetcher)
    const read = classifyDesktopState({ ...desktopSessionPayload(), ...MATTER_PAYLOAD })
    const readState = vi.fn(async () => read)
    const container = await mount(readState)
    await click(control(container, '工作区'))

    const input = container.querySelector<HTMLInputElement>('input[aria-label="事项新名称"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '  新名称  ')
    await act(async () => { input.dispatchEvent(new Event('input', { bubbles: true })) })
    const clicksBefore = readState.mock.calls.length
    await click(control(container, '重命名当前事项'))
    const rename = fetcher.mock.calls.find(([url]) => url === '/.sage/matter-admin')
    expect(JSON.parse(String(rename?.[1]?.body))).toEqual({ action: 'rename', matterRef: 'matter:one', title: '新名称' })
    expect(container.textContent).toContain('重命名已提交（以服务回读为准）。')
    expect(readState.mock.calls.length).toBeGreaterThan(clicksBefore)

    await click(control(container, '归档当前事项（已停止）'))
    const archive = fetcher.mock.calls.filter(([url]) => url === '/.sage/matter-admin').at(-1)
    expect(JSON.parse(String(archive?.[1]?.body))).toEqual({ action: 'archive', matterRef: 'matter:one', ground: 'stopped' })
  })

  it('names a refusal with the shared protection vocabulary and offers restore for an archived current matter', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url === '/.sage/matter-admin') return Response.json({ state: 'refused', code: 'protected-effect-denied' })
      return ack()
    })
    vi.stubGlobal('fetch', fetcher)
    const payload = {
      ...MATTER_PAYLOAD,
      matterAdmin: {
        ...MATTER_PAYLOAD.matterAdmin,
        entries: [
          { matterRef: 'matter:two', archivedAt: '2026-10-11T00:00:00Z', ground: 'completed' },
          { matterRef: 'matter:one', archivedAt: '2026-10-11T00:00:00Z', ground: 'completed' },
        ],
      },
    }
    const read = classifyDesktopState({ ...desktopSessionPayload(), ...payload })
    const container = await mount(async () => read)
    await click(control(container, '工作区'))

    // The current matter is archived: the restore entry replaces the archive pair.
    expect(container.querySelector('button[aria-label="恢复当前事项"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="归档当前事项（已完成）"]')).toBeNull()
    await click(control(container, '恢复当前事项'))
    const restore = fetcher.mock.calls.find(([url]) => url === '/.sage/matter-admin')
    expect(JSON.parse(String(restore?.[1]?.body))).toEqual({ action: 'restore', matterRef: 'matter:one' })
    expect(container.textContent).toContain('当前没有执行该操作的授权；未记录任何改动。')
  })

  it('names each unavailable slot and omits malformed ones instead of claiming emptiness', async () => {
    const unavailable = classifyDesktopState({
      ...desktopSessionPayload(),
      matterList: { state: 'unavailable', code: 'matter-list-unavailable', items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } },
      matterGroups: { state: 'unavailable', code: 'matter-groups-unavailable', groups: [], trail: [], rename: null, batch: null },
    })
    const container = await mount(async () => unavailable)
    await click(control(container, '工作区'))
    const section = container.querySelector('[aria-label="事项"]')
    expect(section?.textContent).toContain('事项名册读取不可用（原因码 matter-list-unavailable）；不据此断言无事项。')
    expect(section?.textContent).toContain('事项分组读取不可用（matter-groups-unavailable）。')

    const malformed = classifyDesktopState({ ...desktopSessionPayload(), matterList: { state: 'read' } })
    expect('matterList' in malformed).toBe(false)
    const second = await mount(async () => malformed)
    await click(control(second, '工作区'))
    expect(second.querySelector('[aria-label="事项"]')).toBeNull()
  })
})
