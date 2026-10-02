import { describe, expect, it } from 'vitest'
import { observeRuntimeEffective } from '../src/host/runtime-effective.js'

function ctxWith(service: unknown): unknown {
  return { get: (name: string) => (name === 'agentPresets' ? service : undefined) }
}

/** Method-style registry: `remoteExportList` reads `this`, so a detached call must fail
 * and a correctly bound call must succeed (regression for the lost-receiver bug). */
function registryWith(roster: unknown, defaultId = 'standard'): unknown {
  return {
    defaultId,
    async remoteExportList(): Promise<unknown> {
      return await this.list()
    },
    async list(): Promise<unknown> {
      return roster
    },
  }
}

describe('host runtime-effective observation (WT-02C.2E.3)', () => {
  it('reports registry-service-absent when the live context cannot serve agentPresets', async () => {
    for (const ctx of [null, undefined, {}, { get: () => undefined }]) {
      await expect(observeRuntimeEffective(ctx)).resolves.toEqual({ kind: 'unavailable', reason: 'registry-service-absent' })
    }
    const throwing = { get: () => { throw new Error('no service') } }
    await expect(observeRuntimeEffective(throwing)).resolves.toEqual({ kind: 'unavailable', reason: 'registry-service-absent' })
    const incomplete = ctxWith({ defaultId: 'standard' })
    await expect(observeRuntimeEffective(incomplete)).resolves.toEqual({ kind: 'unavailable', reason: 'registry-service-absent' })
  })

  it('reports observation-failed when the registry read rejects', async () => {
    const registry = { defaultId: 'standard', remoteExportList: async () => { throw new Error('registry broken') } }
    await expect(observeRuntimeEffective(ctxWith(registry))).resolves.toEqual({ kind: 'unavailable', reason: 'observation-failed' })
  })

  it('observes the roster, dropping display metadata and freezing the rows', async () => {
    const registry = registryWith({ presets: [
      { id: 'standard', isDefault: true, name: 'Standard', description: 'd', order: 1 },
      { id: 'cordis', isDefault: false, broken: 'row 2 (x): never started' },
    ] })
    const observation = await observeRuntimeEffective(ctxWith(registry))
    expect(observation).toEqual({
      kind: 'observed',
      defaultPresetId: 'standard',
      presets: [
        { id: 'standard', isDefault: true },
        { id: 'cordis', isDefault: false, broken: 'row 2 (x): never started' },
      ],
    })
    expect(Object.isFrozen(observation)).toBe(true)
    if (observation.kind !== 'observed') throw new Error('expected observed')
    expect(Object.isFrozen(observation.presets)).toBe(true)
    expect(Object.isFrozen(observation.presets[0])).toBe(true)
  })

  it('reports invalid-roster for a dangling or malformed roster instead of guessing', async () => {
    const cases: ReadonlyArray<readonly [string, unknown, string]> = [
      ['empty roster', { presets: [] }, 'standard'],
      ['missing presets array', {}, 'standard'],
      ['duplicate ids', { presets: [
        { id: 'standard', isDefault: true },
        { id: 'standard', isDefault: false },
      ] }, 'standard'],
      ['two flagged defaults', { presets: [
        { id: 'standard', isDefault: true },
        { id: 'cordis', isDefault: true },
      ] }, 'standard'],
      ['default not in roster', { presets: [{ id: 'cordis', isDefault: false }] }, 'standard'],
      ['flagged row disagrees with defaultId', { presets: [{ id: 'cordis', isDefault: true }] }, 'standard'],
      ['non-object row', { presets: ['standard'] }, 'standard'],
      ['wrong broken type', { presets: [{ id: 'standard', isDefault: true, broken: 7 }] }, 'standard'],
      ['oversized id', { presets: [{ id: 'x'.repeat(65), isDefault: true }] }, 'x'.repeat(65)],
    ]
    for (const [label, roster, defaultId] of cases) {
      await expect(observeRuntimeEffective(ctxWith(registryWith(roster, defaultId))), label)
        .resolves.toEqual({ kind: 'unavailable', reason: 'invalid-roster' })
    }
  })
})
