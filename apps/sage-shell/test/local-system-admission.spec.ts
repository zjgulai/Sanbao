import { describe, expect, it, vi } from 'vitest'
import { admitLocalSystemRead, type LocalSystemReadPorts } from '../src/appservice/local-system-admission.js'

type Value = { readonly ok: true }
const value: Value = { ok: true }
const validates = (candidate: unknown): candidate is Value =>
  candidate !== null && typeof candidate === 'object' && (candidate as { readonly ok?: unknown }).ok === true

function buildPorts(overrides: Partial<LocalSystemReadPorts> = {}) {
  const spies = {
    verifyCaller: vi.fn<LocalSystemReadPorts['verifyCaller']>(async () => ({ state: 'allowed' as const, value: { bindingRef: 'corr-1' } })),
    verifyFrame: vi.fn<LocalSystemReadPorts['verifyFrame']>(async () => ({ state: 'allowed' as const, value: { frameGeneration: 7 } })),
    read: vi.fn<LocalSystemReadPorts['read']>(async () => ({ state: 'allowed' as const, value })),
    checkPostReadFreshness: vi.fn<LocalSystemReadPorts['checkPostReadFreshness']>(async () => ({ state: 'allowed' as const })),
  }
  const ports: LocalSystemReadPorts = { ...spies, ...overrides }
  return { ports, spies }
}

const admit = (overrides: Partial<LocalSystemReadPorts> = {}) => {
  const { ports, spies } = buildPorts(overrides)
  return { result: admitLocalSystemRead<Value>({ correlation: 'corr-1', ports, validatesReadValue: validates }), spies }
}

const unavailable = { state: 'unavailable', code: 'bootstrap-unavailable', stage: 'local-system', retryable: true, correlation: 'corr-1' }

describe('local-system admission kernel', () => {
  it('returns the read value only when caller, frame, read and post-freshness all pass', async () => {
    const { result, spies } = admit()
    expect(await result).toEqual({ state: 'read', correlation: 'corr-1', value })
    expect(spies.read).toHaveBeenCalledTimes(1)
    expect(spies.read).toHaveBeenCalledWith(7)
  })

  it('fails closed before any frame or data read when the caller is missing or mismatched', async () => {
    const missing = admit({ verifyCaller: async () => ({ state: 'unavailable' as const }) })
    expect(await missing.result).toEqual(unavailable)
    expect(missing.spies.verifyFrame).not.toHaveBeenCalled()
    expect(missing.spies.read).not.toHaveBeenCalled()

    const mismatched = admit({ verifyCaller: async () => ({ state: 'allowed' as const, value: { bindingRef: 'other' } }) })
    expect(await mismatched.result).toEqual(unavailable)
    expect(mismatched.spies.read).not.toHaveBeenCalled()
  })

  it('fails closed before the data read when the frame is not ready or contaminated', async () => {
    const { result, spies } = admit({ verifyFrame: async () => ({ state: 'unavailable' as const }) })
    expect(await result).toEqual(unavailable)
    expect(spies.read).not.toHaveBeenCalled()
  })

  it('fails closed when the read itself is unavailable', async () => {
    const { result } = admit({ read: async () => ({ state: 'unavailable' as const }) })
    expect(await result).toEqual(unavailable)
  })

  it('discards the read value when the post-read freshness check goes stale', async () => {
    const { result } = admit({ checkPostReadFreshness: async () => ({ state: 'stale' as const }) })
    expect(await result).toEqual(unavailable)
  })

  it('rejects a value that fails the closed-shape validator', async () => {
    const { result } = admit({ read: async () => ({ state: 'allowed' as const, value: { ok: false } }) })
    expect(await result).toEqual(unavailable)
  })

  it('turns a thrown port error into the stable unavailable result', async () => {
    const { result } = admit({ read: async () => { throw new Error('private-provider-path') } })
    const settled = await result
    expect(settled).toEqual(unavailable)
    expect(JSON.stringify(settled)).not.toContain('private-provider-path')
  })

  it('uses the closed route-specific unavailable code without changing admission order', async () => {
    const { ports, spies } = buildPorts({ verifyFrame: async () => ({ state: 'unavailable' as const }) })
    const result = await admitLocalSystemRead<Value>({
      correlation: 'corr-1',
      ports,
      validatesReadValue: validates,
      unavailableCode: 'device-preferences-unavailable',
    })
    expect(result).toEqual({
      state: 'unavailable',
      code: 'device-preferences-unavailable',
      stage: 'local-system',
      retryable: true,
      correlation: 'corr-1',
    })
    expect(spies.read).not.toHaveBeenCalled()
  })
})
