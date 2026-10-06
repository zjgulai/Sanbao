import { describe, expect, it } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import type { RuntimeEffectiveObservation } from '../src/protocol.js'
import { withProjectionReadTestAdmission } from './support/projection-read-test-runner.js'

/**
 * Ticket 030 (US-155~158), projection side: the capability roster is classified once by main into
 * 已配置 / 已启用 / 可用 three separate statements and never turns "not wired" or "could not read"
 * into "已停用". The view itself is rendered by React after batch 26 — its words and affordances are
 * pinned in `capability-model-bridge.spec.ts` and `product-app/capability-model.spec.tsx`.
 */

const observedRoster: RuntimeEffectiveObservation = {
  kind: 'observed',
  defaultPresetId: 'standard',
  presets: [
    { id: 'standard', isDefault: true },
    { id: 'cordis', isDefault: false },
    { id: 'legacy-broken', isDefault: false, broken: 'failed to import /Users/someone/secret/entry.js' },
  ],
}

async function stateWith(reader: (() => RuntimeEffectiveObservation | undefined) | undefined) {
  const providers = withProjectionReadTestAdmission(
    createUnavailableFirstService(null, reader === undefined ? {} : { runtimeEffective: reader }),
  )
  const response = await handleSageServiceRequest(new Request('dsh-app://app/.sage/state', { method: 'GET' }), {
    providers,
    callerBinding: { correlation: 'c-30' },
  } as never)
  return await response.json() as Record<string, unknown>
}

describe('capability projection is classified once by main', () => {
  it('separates configured, enabled and not-enabled rows and keeps the codes machine-only', async () => {
    const state = await stateWith(() => observedRoster)
    expect(state.capability).toEqual({
      source: 'runtime-effective',
      observed: true,
      reason: null,
      agentPresets: [
        { id: 'standard', state: 'enabled', reason: null },
        { id: 'cordis', state: 'enabled', reason: null },
        { id: 'legacy-broken', state: 'configured-not-enabled', reason: 'preset-failed-to-activate' },
      ],
      external: { state: 'not-wired', reason: 'capability-registry-unavailable' },
    })
  })

  it('never lets the base text (paths, secrets) ride along on the surface', async () => {
    const state = await stateWith(() => observedRoster)
    const serialized = JSON.stringify(state.capability)
    expect(serialized).not.toContain('/Users')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('failed to import')
  })

  it('keeps an unread roster unverified instead of inventing rows', async () => {
    const state = await stateWith(undefined)
    expect(state.capability).toMatchObject({ observed: false, reason: 'observation-not-read', agentPresets: [] })
  })

  it('propagates the reason when the runtime cannot produce a roster', async () => {
    const state = await stateWith(() => ({ kind: 'unavailable', reason: 'registry-service-absent' }))
    expect(state.capability).toMatchObject({ observed: false, reason: 'registry-service-absent', agentPresets: [] })
  })
})
