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

async function mount(controller: ReturnType<typeof createDevicePreferencesController>) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => { root.render(createElement(DesktopSettingsView, { controller })) })
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
