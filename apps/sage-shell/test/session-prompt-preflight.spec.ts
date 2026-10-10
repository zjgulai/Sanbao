/** T05-mid step 8 (ADR-0287): the preflight step over the live runtime-effective observation of
 *  the Host epoch — fresh availability, no side effects, no denied / stale at this step. */
import { describe, expect, it, vi } from 'vitest'

import { createSageAppServiceProviders } from '../src/main/app-service.js'
import { createActiveMatterContext } from '../src/main/active-matter-context.js'
import { createSessionPromptPreflightPort } from '../src/main/session-prompt-preflight.js'
import { loadSessionPromptRequirementBundle } from '../src/main/publication-bundle.js'
import type { RuntimeEffectiveObservation } from '../src/protocol.js'

const MAPPING_REF = 'mapping:urn:sage:capability-registry:sha256:f2df5963780c0868769343cf94147a02e49527e83f8ef49e32a277830aacb411'
  + ':sha256:0b6e398d0a88bf9a82dcfd00c2753cee99b5fd5e6dca64b950f917add7087c25'

function realBundle() {
  const load = loadSessionPromptRequirementBundle()
  if (!load.ok) throw new Error(load.reason)
  return load
}

const OBSERVED: RuntimeEffectiveObservation = {
  kind: 'observed',
  defaultPresetId: 'preset:sage-default',
  presets: [
    { id: 'preset:sage-default', isDefault: true },
    { id: 'preset:sage-alt', isDefault: false },
  ],
}

function port(options: {
  readonly requirementBundle?: unknown
  readonly runtimeEffective?: () => unknown
}) {
  return createSessionPromptPreflightPort({
    requirementBundle: ('requirementBundle' in options ? options.requirementBundle : realBundle()) as never,
    runtimeEffective: ('runtimeEffective' in options ? options.runtimeEffective : (() => OBSERVED)) as never,
  })
}

const request = {
  intent: { operation: 'session.send' },
  target: { targetRef: 'target:probe' },
  registry: { mappingRef: MAPPING_REF },
} as never

describe('the real preflight port', () => {
  it('answers allowed from the live observed roster with a deterministic, roster-bound ref', async () => {
    const first = await port({})(request)
    const second = await port({})(request)
    expect(first).toEqual(second)
    if (first.state !== 'allowed') throw new Error('expected allowed')
    expect(first.value.preflightRef).toMatch(/^urn:sage:preflight:v1:[0-9a-f]{64}$/u)

    // A moved roster moves the ref by construction (fresh availability, not standing authority).
    const moved = await port({
      runtimeEffective: () => ({ ...OBSERVED, presets: [{ id: 'preset:other', isDefault: true }], defaultPresetId: 'preset:other' }),
    })(request)
    if (moved.state !== 'allowed') throw new Error('expected allowed')
    expect(moved.value.preflightRef).not.toBe(first.value.preflightRef)

    // No clock: the same live read twice must reproduce the ref byte for byte.
    const reader = vi.fn(() => OBSERVED)
    const repeated = await port({ runtimeEffective: reader })(request)
    expect(reader).toHaveBeenCalledTimes(1)
    expect(repeated).toEqual(first)
  })

  it('answers unavailable for every non-observed runtime face', async () => {
    expect(await port({ runtimeEffective: undefined })(request)).toEqual({ state: 'unavailable' })
    expect(await port({ runtimeEffective: () => undefined })(request)).toEqual({ state: 'unavailable' })
    expect(await port({ runtimeEffective: () => { throw new Error('probe') } })(request)).toEqual({ state: 'unavailable' })
    expect(await port({ runtimeEffective: () => ({ kind: 'observed', defaultPresetId: 'x', presets: [] }) })(request))
      .toEqual({ state: 'unavailable' })
    for (const reason of ['registry-service-absent', 'invalid-roster', 'observation-failed'] as const) {
      expect(await port({ runtimeEffective: () => ({ kind: 'unavailable', reason }) })(request))
        .toEqual({ state: 'unavailable' })
    }
  })

  it('refuses a broken chain before touching the Host, and never denies or stales', async () => {
    const reader = vi.fn(() => OBSERVED)
    expect(await port({ requirementBundle: { ok: false, reason: 'probe' }, runtimeEffective: reader })(request))
      .toEqual({ state: 'unavailable' })
    const bogusRef = { ...(request as object), registry: { mappingRef: 'not-a-mapping' } } as never
    expect(await port({ runtimeEffective: reader })(request)).toEqual(expect.objectContaining({ state: 'allowed' }))
    expect(await port({ runtimeEffective: reader })(bogusRef)).toEqual({ state: 'unavailable' })

    const bundle = realBundle()
    const entry = bundle.snapshot.entries[0]!
    const noDeclarer = {
      ok: true as const,
      snapshotId: bundle.snapshotId,
      snapshot: { ...bundle.snapshot, entries: [{ ...entry, actionRequirements: [] }] },
    }
    const untouched = vi.fn(() => OBSERVED)
    expect(await port({ requirementBundle: noDeclarer, runtimeEffective: untouched })(request))
      .toEqual({ state: 'unavailable' })
    expect(untouched).not.toHaveBeenCalled()
  })
})

describe('the production assembly wires the preflight step on its own switch', () => {
  const vault = {
    status: () => 'signed-out' as const,
    snapshot: () => ({ status: 'signed-out' as const, displayName: null }),
    signOut: () => undefined,
    identitySession: () => ({
      sessionRef: 'session:active',
      identityHandle: 'actor:local',
      issuer: 'https://issuer.invalid',
      authenticatedAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
    }),
  }
  const adapter = { startLogin: async () => ({ ok: false as const, code: 'probe' }) }
  const callerBinding = { correlation: 'caller:session-core' }

  function assembleWith(options: { readonly requirementBundle?: unknown, readonly runtimeEffective?: () => unknown }) {
    let gateRead = false
    const bundleOption = options.requirementBundle === undefined
      ? undefined
      : Object.defineProperty({ reason: 'probe' }, 'ok', {
          get() {
            gateRead = true
            return false
          },
        })
    createSageAppServiceProviders({
      viewState: null,
      vault: vault as never,
      adapter: adapter as never,
      callerBinding,
      activeMatterContext: createActiveMatterContext(),
      framePolicySnapshot: () => ({ generation: 7, ready: true, contaminated: false, contaminationReasons: [] }),
      matterRehydrate: (() => ({ matter: {} as never, current: true })) as never,
      matterLinks: () => ({ state: 'read', links: [], trail: [] }),
      workspaceList: async () => ({
        source: 'workspace-follow', state: 'read', reason: null,
        entries: [], order: [], archivedSessions: 0, frames: 0, unapplied: 0,
      }),
      sessionSend: vi.fn(async () => ({ state: 'accepted' as const, sessionId: 's', requestId: 'r', mode: 'queue' as const })),
      ...(bundleOption === undefined ? {} : { requirementBundle: bundleOption as never }),
      ...(options.runtimeEffective === undefined ? {} : { runtimeEffective: options.runtimeEffective as never }),
    })
    return gateRead
  }

  it('constructs the preflight port only when the bundle and the live read both exist', () => {
    // Only the preflight merge can fire here: authority / registry / observation inputs are
    // absent, so target / compatibility / registry stay unwired even with the bundle present.
    expect(assembleWith({ requirementBundle: true, runtimeEffective: () => OBSERVED })).toBe(true)
    expect(assembleWith({ requirementBundle: true })).toBe(false)
    expect(assembleWith({ runtimeEffective: () => OBSERVED })).toBe(false)
  })
})
