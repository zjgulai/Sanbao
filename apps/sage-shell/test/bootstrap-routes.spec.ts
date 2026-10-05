import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_DISPLAY_PREFERENCE_VALUES } from '../src/appservice/contracts.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'

const caller = { correlation: 'read:one' } as const

const call = (url: string, providers: ReturnType<typeof createUnavailableFirstService>, init: RequestInit = {}) =>
  handleSageServiceRequest(new Request(`dsh-app://app${url}`, init), { callerBinding: caller, providers })

const jsonPost = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const preferences = () => ({
  requested: { ...DEFAULT_DISPLAY_PREFERENCE_VALUES, theme: 'dark' as const },
  savedAt: null,
  effectiveTheme: 'dark' as const,
  systemDark: null,
  applies: 'live' as const,
})

/** The production assembly path with fake main-owned facts; every fact the runner may use
 *  (caller, frame, vault, preferences, view state) is injected so the tests exercise the real
 *  runner instead of a hand-built provider. */
function assemble(overrides: {
  readonly callerBinding?: { readonly correlation: string } | null
  readonly frame?: { readonly ready: boolean, readonly contaminated: boolean, readonly generation: number }
  readonly statusSequence?: readonly ('signed-out' | 'pending' | 'signed-in')[]
  readonly displayName?: string | null
  readonly preferences?: () => unknown
} = {}) {
  const frame = overrides.frame ?? { ready: true, contaminated: false, generation: 7 }
  const statuses = [...(overrides.statusSequence ?? ['signed-out' as const])]
  const status = vi.fn(() => (statuses.length > 1 ? statuses.shift()! : statuses[0]!))
  const preferencesSpy = vi.fn(overrides.preferences ?? preferences)
  const providers = createSageAppServiceProviders({
    viewState: { status: 'ready', message: 'private-runtime-message', retryable: false },
    vault: {
      status,
      snapshot: () => ({ status: 'signed-in' as const, displayName: overrides.displayName ?? null }),
      identitySession: () => null,
      signOut: () => undefined,
    } as never,
    adapter: { startLogin: async () => ({ ok: false as const, code: 'probe' }) } as never,
    callerBinding: overrides.callerBinding === undefined ? caller : overrides.callerBinding,
    framePolicySnapshot: () => frame as never,
    preferences: preferencesSpy as never,
  })
  return { providers, preferencesSpy, frame, status }
}

describe('the local-system bootstrap route', () => {
  it('terminates without a verified caller before any provider runs', async () => {
    const bootstrapRead = vi.fn()
    const providers = createUnavailableFirstService(null, { bootstrapRead })
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/bootstrap'),
      { callerBinding: null, providers },
    )
    expect(response.status).toBe(403)
    expect(bootstrapRead).not.toHaveBeenCalled()
  })

  it('answers its stable denial when no runner is assembled — never invented facts', async () => {
    const providers = createUnavailableFirstService(null, {})
    const response = await call('/.sage/bootstrap', providers)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Object.keys(body).sort()).toEqual(['code', 'correlation', 'retryable', 'stage'])
    expect(body.code).toBe('bootstrap-unavailable')
    expect(body.stage).toBe('local-system')
    expect(body.retryable).toBe(true)
  })

  it('rejects non-GET before the provider runs', async () => {
    const bootstrapRead = vi.fn()
    const providers = createUnavailableFirstService(null, { bootstrapRead })
    const response = await call('/.sage/bootstrap', providers, jsonPost({}))
    expect(response.status).toBe(405)
    expect(bootstrapRead).not.toHaveBeenCalled()
  })

  it('stays a device entry: signed-out facts remain readable while state and search keep refusing', async () => {
    const providers = createUnavailableFirstService(null, {
      bootstrapRead: async () => Response.json({ runtime: { status: 'ready' }, auth: { status: 'signed-out' }, display: { theme: 'system', density: 'comfortable' } }),
    })
    const bootstrap = await call('/.sage/bootstrap', providers)
    expect(bootstrap.status).toBe(200)
    expect(await bootstrap.json()).toEqual({
      runtime: { status: 'ready' },
      auth: { status: 'signed-out' },
      display: { theme: 'system', density: 'comfortable' },
    })
    const state = await call('/.sage/state', providers)
    expect((await state.json()).code).toBe('projection-read-unavailable')
    const search = await call('/.sage/search', providers, jsonPost({ query: 'x' }))
    expect(await search.json()).toEqual({ state: 'refused', code: 'search-unavailable' })
  })
})

describe('the local-system bootstrap runner over the production assembly', () => {
  it('returns the closed device DTO and never the raw runtime message', async () => {
    const { providers } = assemble()
    const response = await providers.bootstrapRead()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      runtime: { status: 'ready' },
      auth: { status: 'signed-out' },
      display: { theme: 'dark', density: DEFAULT_DISPLAY_PREFERENCE_VALUES.density },
    })
    expect(Object.keys(body.runtime)).toEqual(['status'])
    expect(JSON.stringify(body)).not.toContain('private-runtime-message')
  })

  it('fails closed before any read when the request-scoped caller is missing', async () => {
    const { providers, preferencesSpy } = assemble({ callerBinding: null })
    const body = await (await providers.bootstrapRead()).json()
    expect(body.code).toBe('bootstrap-unavailable')
    expect(preferencesSpy).not.toHaveBeenCalled()
  })

  it('fails closed before any read while the frame is not ready or contaminated', async () => {
    const notReady = assemble({ frame: { ready: false, contaminated: false, generation: 7 } })
    expect((await (await notReady.providers.bootstrapRead()).json()).code).toBe('bootstrap-unavailable')
    expect(notReady.preferencesSpy).not.toHaveBeenCalled()

    const contaminated = assemble({ frame: { ready: true, contaminated: true, generation: 7 } })
    expect((await (await contaminated.providers.bootstrapRead()).json()).code).toBe('bootstrap-unavailable')
    expect(contaminated.preferencesSpy).not.toHaveBeenCalled()
  })

  it('discards the read when the frame generation moves during it', async () => {
    const frame = { ready: true, contaminated: false, generation: 7 }
    const { providers } = assemble({
      frame,
      preferences: () => { frame.generation += 1; return preferences() },
    })
    const body = await (await providers.bootstrapRead()).json()
    expect(body.code).toBe('bootstrap-unavailable')
    expect(JSON.stringify(body)).not.toContain('dark')
    expect(frame.generation).toBe(8)
  })

  it('discards the read when the identity status moves during it', async () => {
    const { providers } = assemble({ statusSequence: ['signed-out', 'pending'] })
    const body = await (await providers.bootstrapRead()).json()
    expect(body.code).toBe('bootstrap-unavailable')
  })

  it('never carries a display name even when the vault has one', async () => {
    const { providers } = assemble({ statusSequence: ['signed-in'], displayName: 'canary-private-name' })
    const response = await providers.bootstrapRead()
    const body = await response.json()
    expect(body.auth).toEqual({ status: 'signed-in' })
    expect(JSON.stringify(body)).not.toContain('canary-private-name')
    expect(JSON.stringify(body)).not.toContain('displayName')
  })
})
