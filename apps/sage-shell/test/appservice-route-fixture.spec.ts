import { describe, expect, it } from 'vitest'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createSageFixtureViewState } from '../src/product/view-state.js'
import { createTokenVault } from '../src/main/token-vault.js'

/**
 * WT-02D.1: the real request chain (route kernel + production provider assembly) in both
 * matter-slot modes. The Electron wire path is covered separately by the real-window probe.
 */

const viewState = { status: 'ready' as const, message: 'dsh probe', retryable: true }

function providers(fixture: boolean) {
  return createSageAppServiceProviders({
    viewState,
    vault: createTokenVault({ mintSessionRef: () => 'session-ref-fixture' }),
    adapter: { startLogin: async () => ({ ok: false as const, code: 'idp-unreachable' as const }) },
    ...(fixture ? { fixtureProjection: createSageFixtureViewState } : {}),
  })
}

describe('app service route with the production assembly (WT-02D.1)', () => {
  it('serves the fixture matter projection under the fixture switch', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state'), {
      callerBinding: { correlation: 'c-fixture' },
      providers: providers(true),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body.matter).toEqual(createSageFixtureViewState())
    expect((body.matter as { projectionSource: string }).projectionSource).toBe('fixture')
    expect(body.service).toMatchObject({ status: 'unavailable', auth: { status: 'signed-out' } })
    expect(body.runtime).toEqual(viewState)
  })

  it('keeps the matter slot null in production mode (no provider, no placeholder)', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state'), {
      callerBinding: { correlation: 'c-production' },
      providers: providers(false),
    })
    const body = await response.json() as Record<string, unknown>
    expect(body.matter).toBeNull()
    expect(body.service).toMatchObject({ status: 'unavailable', reason: 'identity-unavailable' })
  })

  it('keeps the blocked write path typed under the fixture switch (read-only surface)', async () => {
    const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'retry' }),
    }), {
      callerBinding: { correlation: 'c-actions' },
      providers: providers(true),
    })
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ code: 'identity-unavailable', stage: 'identity-policy' })
  })
})
