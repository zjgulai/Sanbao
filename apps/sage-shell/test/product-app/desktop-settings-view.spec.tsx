/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEVICE_PREFERENCE_KEYS,
  createDevicePreferencesController,
  type DevicePreferenceValues,
  type DevicePreferencesState,
} from '../../src/product/app/desktop/device-preferences.js'
import { DesktopSettingsView } from '../../src/product/app/desktop/settings-view.js'
import { classifyDesktopState, type DesktopSettingsLeaf } from '../../src/product/app/desktop/client.js'
import { desktopSessionPayload } from '../support/desktop-session-fixture.js'

const stored: DevicePreferenceValues = {
  theme: 'dark',
  language: 'en',
  density: 'compact',
  fontStyle: 'serif',
  contentWidth: 'wide',
  terminalTheme: 'manual',
  fileIcons: 'material',
  iconAppearance: 'light',
}
const alternate: DevicePreferenceValues = {
  theme: 'light',
  language: 'zh',
  density: 'comfortable',
  fontStyle: 'sans',
  contentWidth: 'standard',
  terminalTheme: 'follow',
  fileIcons: 'product',
  iconAppearance: 'dark',
}
const initial: DevicePreferencesState = {
  requested: stored,
  savedAt: '2026-10-05T08:00:00.000Z',
  effectiveTheme: 'dark',
}
const signal = () => new AbortController().signal
const mounted: Array<() => void> = []

afterEach(() => {
  mounted.splice(0).forEach(dispose => dispose())
  vi.unstubAllGlobals()
})

async function mount(
  controller: ReturnType<typeof createDevicePreferencesController>,
  leaves?: readonly DesktopSettingsLeaf[],
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DesktopSettingsView, { controller, ...(leaves === undefined ? {} : { leaves }) })) })
  await act(async () => {
    await vi.waitFor(() => expect(controller.snapshot().read.kind).not.toBe('unavailable'))
  })
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

describe('desktop settings appearance view', () => {
  it('renders the eight authoritative values once, with native labelled controls and honest scope copy', async () => {
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async () => Response.json(initial),
    })
    const container = await mount(controller)
    const selects = [...container.querySelectorAll<HTMLSelectElement>('select')]
    expect(selects).toHaveLength(8)
    expect(selects.map(select => select.name)).toEqual(DEVICE_PREFERENCE_KEYS)
    expect(Object.fromEntries(selects.map(select => [select.name, select.value]))).toEqual(stored)
    for (const select of selects) {
      expect(container.querySelector(`label[for="${select.id}"]`)).not.toBeNull()
      expect(select.disabled).toBe(false)
    }
    expect(container.textContent).toContain('主题与密度在保存并完成权威回读后立即生效')
    expect(container.textContent).toContain('其余六项仅保存，尚未接入产品显示')
    expect(container.querySelector('[role="status"]')?.textContent).toContain(initial.savedAt)
  })

  it('submits all eight values, then displays only the GET readback', async () => {
    let authority = initial
    const posts: DevicePreferenceValues[] = []
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async (input, init) => {
        if (String(input) === '/.sage/preferences') {
          const patch = JSON.parse(String(init?.body)) as DevicePreferenceValues
          posts.push(patch)
          authority = {
            requested: patch,
            savedAt: '2026-10-05T09:00:00.000Z',
            effectiveTheme: patch.theme === 'system' ? null : patch.theme,
          }
          // This conflicting receipt value must never be rendered.
          return Response.json({ state: 'saved', preferences: initial })
        }
        return Response.json(authority)
      },
    })
    const container = await mount(controller)
    act(() => {
      for (const [key, value] of Object.entries(alternate)) {
        const select = container.querySelector<HTMLSelectElement>(`select[name="${key}"]`)
        if (select === null) throw new Error(`missing ${key}`)
        select.value = value
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(controller.snapshot().lastSave).toBe('saved'))
    })
    expect(posts).toEqual([alternate])
    expect(Object.fromEntries([...container.querySelectorAll<HTMLSelectElement>('select')]
      .map(select => [select.name, select.value]))).toEqual(alternate)
    expect(container.querySelector('[role="status"]')?.textContent).toContain('2026-10-05T09:00:00.000Z')
  })

  it('shows no invented defaults while GET is unavailable', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async () => Response.json({ effectiveTheme: 'dark' }),
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => { root.render(createElement(DesktopSettingsView, { controller })) })
    await act(async () => {
      await vi.waitFor(() => expect(container.querySelectorAll('select')).toHaveLength(8))
    })
    mounted.push(() => { act(() => root.unmount()); container.remove() })
    for (const select of container.querySelectorAll<HTMLSelectElement>('select')) {
      expect(select.disabled).toBe(true)
      expect(select.value).toBe('')
      expect(select.selectedOptions[0]?.textContent).toBe('未核验')
    }
    expect(container.querySelector('[role="status"]')?.textContent).toContain('未核验')
    expect(container.textContent).not.toContain('已保存到本设备')
  })

  it('keeps unsaved edits when an authoritative refresh lands mid-edit (acceptance finding)', async () => {
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async () => Response.json(initial),
    })
    const container = await mount(controller)
    const theme = container.querySelector<HTMLSelectElement>('select[name="theme"]')!
    act(() => {
      theme.value = 'light'
      theme.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(theme.value).toBe('light')
    // A late authoritative read (the mount refresh resolving mid-interaction) must not clobber
    // the unsaved draft — the acceptance caught this wiping user edits (2026-10-11).
    await act(async () => { await controller.refresh() })
    expect(theme.value).toBe('light')
    // Submitting re-arms adoption: the refusal path still restores the authoritative form
    // (covered by the refusal case above).
  })

  it('restores the authoritative form and says no save was confirmed after refusal', async () => {
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async (input) => String(input) === '/.sage/preferences'
        ? Response.json({ state: 'refused', code: 'preferences-write-failed' })
        : Response.json(initial),
    })
    const container = await mount(controller)
    const theme = container.querySelector<HTMLSelectElement>('select[name="theme"]')!
    act(() => {
      theme.value = 'light'
      theme.dispatchEvent(new Event('change', { bubbles: true }))
      container.querySelector<HTMLButtonElement>('button[type="submit"]')?.click()
    })
    await act(async () => {
      await vi.waitFor(() => expect(controller.snapshot().lastSave).toBe('refused'))
    })
    expect(theme.value).toBe('dark')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('保存未确认')
  })
})

describe('the settings leaf region (ADR-0312)', () => {
  const LEAVES: readonly DesktopSettingsLeaf[] = [
    { leafId: 'connection', title: '连接', state: 'read', source: '运行时启动观察', note: 'Host 本次启动处于活跃世代；连接细节以运行时清单页为准。' },
    { leafId: 'desktop-pet', title: '桌面宠物', state: 'unavailable', source: 'provider-not-wired', note: '未核验：这一版还没有桌面宠物 provider。' },
  ]

  it('renders every leaf row with its honest state, source and note', async () => {
    const controller = createDevicePreferencesController({ root: null, createSignal: signal, fetcher: async () => Response.json(initial) })
    const container = await mount(controller, LEAVES)
    const region = container.querySelector('[aria-label="本机设置叶"]')
    expect(region).not.toBeNull()
    const rows = container.querySelectorAll('.settings-leaf')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.querySelector('strong')?.textContent).toBe('连接')
    expect(rows[0]?.querySelector('.settings-leaf-state')?.textContent).toBe('已读')
    expect(rows[0]?.textContent).toContain('来源：运行时启动观察')
    expect(rows[1]?.querySelector('strong')?.textContent).toBe('桌面宠物')
    expect(rows[1]?.querySelector('.settings-leaf-state')?.textContent).toBe('未核验')
    expect(rows[1]?.textContent).toContain('provider-not-wired')
    expect(rows[1]?.getAttribute('data-leaf-state')).toBe('unavailable')
    // No write entry exists on any leaf row.
    expect(region?.querySelectorAll('button, input, select')).toHaveLength(0)
  })

  it('renders no leaf region when the slot is absent', async () => {
    const controller = createDevicePreferencesController({ root: null, createSignal: signal, fetcher: async () => Response.json(initial) })
    const container = await mount(controller)
    expect(container.querySelector('[aria-label="本机设置叶"]')).toBeNull()
  })

  it('omits the whole slot when the envelope carries a malformed leaf list', () => {
    const payload = desktopSessionPayload()
    const malformed = classifyDesktopState({ ...payload, settingsLeaves: [{ leafId: 'x' }] })
    expect('settingsLeaves' in malformed).toBe(false)
    const missingState = classifyDesktopState({ ...payload, settingsLeaves: [{ leafId: 'x', title: 'X', state: 'weird', source: 's', note: 'n' }] })
    expect('settingsLeaves' in missingState).toBe(false)
  })
})
