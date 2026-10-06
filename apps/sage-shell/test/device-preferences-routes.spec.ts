import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_DISPLAY_PREFERENCE_VALUES, type DevicePreferencesState } from '../src/appservice/contracts.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'

const caller = { correlation: 'prefs-read:one' } as const
const state: DevicePreferencesState = {
  requested: { ...DEFAULT_DISPLAY_PREFERENCE_VALUES, theme: 'dark', density: 'compact' },
  savedAt: '2026-10-05T08:00:00.000Z',
  effectiveTheme: 'dark',
}

const storedPreferences = (savedAt: string | null = state.savedAt) => ({
  ...state,
  savedAt,
  systemDark: false,
  applies: 'live' as const,
})

function assemble(overrides: {
  readonly callerBinding?: typeof caller | null
  readonly frame?: { readonly ready: boolean, readonly contaminated: boolean, generation: number }
  readonly statuses?: readonly ('signed-in' | 'signed-out' | 'pending')[]
  readonly preferences?: () => ReturnType<typeof storedPreferences>
} = {}) {
  const frame = overrides.frame ?? { ready: true, contaminated: false, generation: 7 }
  const statuses = [...(overrides.statuses ?? ['signed-out' as const])]
  const status = vi.fn(() => statuses.length > 1 ? statuses.shift()! : statuses[0]!)
  const preferences = vi.fn(overrides.preferences ?? storedPreferences)
  const providers = createSageAppServiceProviders({
    viewState: { status: 'ready', message: 'private-runtime-message', retryable: false },
    vault: {
      status,
      snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
      identitySession: () => null,
      signOut: () => undefined,
    } as never,
    adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
    callerBinding: overrides.callerBinding === undefined ? caller : overrides.callerBinding,
    framePolicySnapshot: () => frame as never,
    preferences,
  })
  return { frame, preferences, providers, status }
}

function call(
  providers: ReturnType<typeof createUnavailableFirstService>,
  init: RequestInit = {},
  callerBinding: typeof caller | null = caller,
) {
  return handleSageServiceRequest(
    new Request('dsh-app://app/.sage/device-preferences', init),
    { callerBinding, providers },
  )
}

describe('GET /.sage/device-preferences', () => {
  it('denies an unverified caller before invoking the provider', async () => {
    const devicePreferencesRead = vi.fn(async () => Response.json(state))
    const response = await call(createUnavailableFirstService(null, { devicePreferencesRead }), {}, null)
    expect(response.status).toBe(403)
    expect(devicePreferencesRead).not.toHaveBeenCalled()
  })

  it('rejects non-GET methods before invoking the provider', async () => {
    const devicePreferencesRead = vi.fn(async () => Response.json(state))
    const response = await call(createUnavailableFirstService(null, { devicePreferencesRead }), { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
    expect(devicePreferencesRead).not.toHaveBeenCalled()
  })

  it('answers the route-specific stable denial when the main runner is absent', async () => {
    const response = await call(createUnavailableFirstService(null))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['code', 'correlation', 'retryable', 'stage'])
    expect(body).toMatchObject({
      code: 'device-preferences-unavailable',
      stage: 'local-system',
      retryable: true,
    })
    expect(typeof body.correlation).toBe('string')
  })

  it('passes through only the response produced by the injected main-owned runner', async () => {
    const devicePreferencesRead = vi.fn(async () => Response.json(state, {
      headers: { 'cache-control': 'no-store' },
    }))
    const response = await call(createUnavailableFirstService(null, { devicePreferencesRead }))
    expect(devicePreferencesRead).toHaveBeenCalledTimes(1)
    expect(await response.json()).toEqual(state)
  })
})

describe('the main-owned device preference runner', () => {
  it('reads while signed out and emits only the exact device DTO', async () => {
    const { providers } = assemble()
    const response = await providers.devicePreferencesRead()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual(state)
    expect(Object.keys(body).sort()).toEqual(['effectiveTheme', 'requested', 'savedAt'])
    expect(JSON.stringify(body)).not.toMatch(/systemDark|applies|private-runtime-message|displayName/u)
  })

  it('fails before the preference read without caller/frame admission and discards freshness races', async () => {
    const noCaller = assemble({ callerBinding: null })
    expect(await noCaller.providers.devicePreferencesRead().then(response => response.json()))
      .toMatchObject({ code: 'device-preferences-unavailable' })
    expect(noCaller.preferences).not.toHaveBeenCalled()

    const notReady = assemble({ frame: { ready: false, contaminated: false, generation: 7 } })
    expect(await notReady.providers.devicePreferencesRead().then(response => response.json()))
      .toMatchObject({ code: 'device-preferences-unavailable' })
    expect(notReady.preferences).not.toHaveBeenCalled()

    const frame = { ready: true, contaminated: false, generation: 7 }
    const moved = assemble({ frame, preferences: () => { frame.generation += 1; return storedPreferences() } })
    expect(await moved.providers.devicePreferencesRead().then(response => response.json()))
      .toMatchObject({ code: 'device-preferences-unavailable' })

    const identityMoved = assemble({ statuses: ['signed-out', 'pending'] })
    expect(await identityMoved.providers.devicePreferencesRead().then(response => response.json()))
      .toMatchObject({ code: 'device-preferences-unavailable' })
  })

  it.each(['2026-10-05', 'Sun, 05 Oct 2026 08:00:00 GMT', 'not-a-date'])
  ('rejects non-canonical savedAt %j before it can reach the renderer', async (savedAt) => {
    const { providers } = assemble({ preferences: () => storedPreferences(savedAt) })
    const body = await providers.devicePreferencesRead().then(response => response.json())
    expect(body).toMatchObject({ code: 'device-preferences-unavailable', stage: 'local-system' })
    expect(JSON.stringify(body)).not.toContain(savedAt)
  })
})
