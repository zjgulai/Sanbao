import { describe, expect, it, vi } from 'vitest'

import {
  applyDevicePreferencesToRoot,
  classifyDevicePreferences,
  createDevicePreferencesController,
  readDevicePreferences,
  type DevicePreferenceValues,
  type DevicePreferencesState,
} from '../src/product/app/desktop/device-preferences.js'

const requested: DevicePreferenceValues = {
  theme: 'dark',
  language: 'en',
  density: 'compact',
  fontStyle: 'serif',
  contentWidth: 'wide',
  terminalTheme: 'manual',
  fileIcons: 'material',
  iconAppearance: 'light',
}
const state: DevicePreferencesState = {
  requested,
  savedAt: '2026-10-05T08:00:00.000Z',
  effectiveTheme: 'dark',
}
const signal = () => new AbortController().signal

function rootRecorder() {
  const attributes: Record<string, string> = {}
  return {
    attributes,
    root: { setAttribute: (name: string, value: string) => { attributes[name] = value } },
  }
}

describe('device preference DTO classification', () => {
  it('accepts only the exact eight-value DTO', () => {
    expect(classifyDevicePreferences(state)).toEqual({ kind: 'read', value: state })
    expect(classifyDevicePreferences({ ...state, systemDark: false })).toEqual({ kind: 'unavailable', code: null })
    expect(classifyDevicePreferences({ ...state, requested: { ...requested, density: 'spacious' } }))
      .toEqual({ kind: 'unavailable', code: null })
    expect(classifyDevicePreferences({ ...state, savedAt: 'not-a-canonical-time' }))
      .toEqual({ kind: 'unavailable', code: null })
    const missing = { ...requested } as Partial<DevicePreferenceValues>
    delete missing.iconAppearance
    expect(classifyDevicePreferences({ ...state, requested: missing })).toEqual({ kind: 'unavailable', code: null })
  })

  it('recognizes only the closed route-specific denial', () => {
    expect(classifyDevicePreferences({
      code: 'device-preferences-unavailable', stage: 'local-system', retryable: true, correlation: 'prefs:1',
    })).toEqual({ kind: 'unavailable', code: 'device-preferences-unavailable' })
    expect(classifyDevicePreferences({
      code: 'bootstrap-unavailable', stage: 'local-system', retryable: true, correlation: 'prefs:1',
    })).toEqual({ kind: 'unavailable', code: null })
  })

  it('reads the exact GET path without cache and fails closed on transport errors', async () => {
    const fetcher = vi.fn(async () => Response.json(state))
    expect(await readDevicePreferences(fetcher, signal)).toEqual({ kind: 'read', value: state })
    expect(fetcher).toHaveBeenCalledWith('/.sage/device-preferences', expect.objectContaining({ method: 'GET', cache: 'no-store' }))
    expect(await readDevicePreferences(async () => { throw new Error('private-device-path') }, signal))
      .toEqual({ kind: 'unavailable', code: null })
  })
})

describe('device preference controller', () => {
  it('projects only an authoritative GET to the root and clears stale attributes on malformed reads', async () => {
    const { root, attributes } = rootRecorder()
    let payload: unknown = state
    const controller = createDevicePreferencesController({
      root,
      createSignal: signal,
      fetcher: async () => Response.json(payload),
    })
    expect(attributes).toEqual({
      'data-sage-theme-requested': 'unknown',
      'data-sage-theme-effective': 'unknown',
      'data-sage-density': 'unknown',
    })
    await controller.refresh()
    expect(attributes).toEqual({
      'data-sage-theme-requested': 'dark',
      'data-sage-theme-effective': 'dark',
      'data-sage-density': 'compact',
    })
    payload = { ...state, applies: 'live' }
    await controller.refresh()
    expect(controller.snapshot().read).toEqual({ kind: 'unavailable', code: null })
    expect(attributes).toEqual({
      'data-sage-theme-requested': 'unknown',
      'data-sage-theme-effective': 'unknown',
      'data-sage-density': 'unknown',
    })
  })

  it('posts the patch, ignores receipt values, and updates from the mandatory GET readback', async () => {
    const { root, attributes } = rootRecorder()
    const calls: Array<{ path: string, init?: RequestInit }> = []
    let authoritative = state
    const controller = createDevicePreferencesController({
      root,
      createSignal: signal,
      fetcher: async (input, init) => {
        const path = String(input)
        calls.push({ path, init })
        if (path === '/.sage/preferences') {
          const patch = JSON.parse(String(init?.body)) as Partial<DevicePreferenceValues>
          authoritative = {
            requested: { ...authoritative.requested, ...patch },
            savedAt: '2026-10-05T09:00:00.000Z',
            effectiveTheme: patch.theme === 'light' ? 'light' : authoritative.effectiveTheme,
          }
          return Response.json({ state: 'saved', preferences: { requested: { ...requested, theme: 'system' } } })
        }
        return Response.json(authoritative)
      },
    })
    await controller.refresh()
    const result = await controller.save({ theme: 'light', density: 'comfortable' })
    expect(result).toEqual({ outcome: 'saved', read: { kind: 'read', value: authoritative } })
    expect(calls.map(call => call.path)).toEqual([
      '/.sage/device-preferences', '/.sage/preferences', '/.sage/device-preferences',
    ])
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ theme: 'light', density: 'comfortable' })
    expect(attributes['data-sage-theme-requested']).toBe('light')
    expect(attributes['data-sage-density']).toBe('comfortable')
  })

  it.each(['refused', 'timeout'] as const)('re-reads after a %s POST and never applies the attempted value', async (mode) => {
    const { root, attributes } = rootRecorder()
    let getCount = 0
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === '/.sage/preferences') {
        if (mode === 'timeout') throw new Error('post-timeout')
        return Response.json({ state: 'refused', code: 'preferences-write-failed' })
      }
      getCount += 1
      return Response.json(state)
    })
    const controller = createDevicePreferencesController({ root, createSignal: signal, fetcher })
    await controller.refresh()
    const result = await controller.save({ theme: 'light' })
    expect(result.outcome).toBe('refused')
    expect(getCount).toBe(2)
    expect(controller.snapshot().read).toEqual({ kind: 'read', value: state })
    expect(attributes['data-sage-theme-requested']).toBe('dark')
  })

  it('coalesces repeated save calls while one POST plus authoritative readback is in flight', async () => {
    let releasePost: (() => void) | undefined
    const postGate = new Promise<void>(resolve => { releasePost = resolve })
    let posts = 0
    const controller = createDevicePreferencesController({
      root: null,
      createSignal: signal,
      fetcher: async (input) => {
        if (String(input) === '/.sage/preferences') {
          posts += 1
          await postGate
          return Response.json({ state: 'saved' })
        }
        return Response.json(state)
      },
    })
    await controller.refresh()
    const first = controller.save({ theme: 'light' })
    const second = controller.save({ theme: 'dark' })
    expect(second).toBe(first)
    await vi.waitFor(() => expect(posts).toBe(1))
    releasePost?.()
    await first
    expect(posts).toBe(1)
  })
})

describe('root projection helper', () => {
  it('keeps an unresolved followed theme explicitly unknown', () => {
    const { root, attributes } = rootRecorder()
    applyDevicePreferencesToRoot(root, {
      kind: 'read',
      value: { ...state, requested: { ...requested, theme: 'system' }, effectiveTheme: null },
    })
    expect(attributes['data-sage-theme-requested']).toBe('system')
    expect(attributes['data-sage-theme-effective']).toBe('unknown')
  })
})
