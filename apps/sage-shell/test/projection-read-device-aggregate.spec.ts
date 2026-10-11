/** CTX-01C (ADR-0324): the pre-selection device aggregation read — the session-scoped admission
 *  profile, its stage vocabulary, the post-read echo against identity/frame drift, and the
 *  fail-closed shape of every missing or malformed port. */
import { describe, expect, it, vi } from 'vitest'

import {
  admitDeviceAggregateRead,
  type DeviceAggregateReadPorts,
} from '../src/appservice/projection-read-admission.js'

const OK_CALLER = { state: 'allowed' as const, value: { bindingRef: 'caller:one' } }
const OK_SESSION = { state: 'allowed' as const, value: { sessionRef: 'session:one' } }
const OK_FRAME = { state: 'allowed' as const, value: { frameGeneration: 7 } }

function ports(overrides: Partial<DeviceAggregateReadPorts<Response>> = {}): DeviceAggregateReadPorts<Response> {
  return {
    verifyCaller: async () => OK_CALLER,
    verifyIdentitySession: async () => OK_SESSION,
    verifyFrame: async () => OK_FRAME,
    read: async () => ({ state: 'allowed', value: Response.json({ aggregate: true }) }),
    validatesReadValue: (value: unknown): value is Response => value instanceof Response,
    ...overrides,
  }
}

const call = (overrides: Partial<DeviceAggregateReadPorts<Response>> = {}, operation = 'state.read') =>
  admitDeviceAggregateRead<Response>({ operation: operation as never, correlation: 'caller:one', ports: ports(overrides) })

describe('admitDeviceAggregateRead (ADR-0324)', () => {
  it('admits the read for a verified caller, a signed-in session and a ready frame', async () => {
    const read = vi.fn(async () => ({ state: 'allowed' as const, value: Response.json({ aggregate: true }) }))
    const session = vi.fn(async () => OK_SESSION)
    const result = await call({ read, verifyIdentitySession: session })

    expect(result.state).toBe('read')
    expect(result).toMatchObject({ correlation: 'caller:one' })
    // The identity session is observed again after the read; no drift may escape as current.
    expect(session).toHaveBeenCalledTimes(2)
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('names the failing stage for every refused or missing front port', async () => {
    const cases = [
      [{ verifyCaller: undefined }, 'caller'],
      [{ verifyCaller: async () => ({ state: 'unavailable' as const }) }, 'caller'],
      [{ verifyIdentitySession: undefined }, 'initial-context'],
      [{ verifyIdentitySession: async () => ({ state: 'unavailable' as const }) }, 'initial-context'],
      [{ verifyFrame: undefined }, 'fresh-scope'],
      [{ verifyFrame: async () => ({ state: 'unavailable' as const }) }, 'fresh-scope'],
    ] as const
    for (const [override, stage] of cases) {
      expect(await call(override as never), stage).toMatchObject({
        state: 'unavailable', code: 'projection-read-unavailable', stage, retryable: true, correlation: 'caller:one',
      })
    }
  })

  it('keeps a thrown, malformed or unvalidated read at the read stage', async () => {
    const raw = vi.fn()
    expect(await call({ read: () => { throw new Error('probe') } })).toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(await call({ read: undefined })).toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(await call({ validatesReadValue: undefined })).toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(await call({ read: async () => ({ state: 'allowed' as const, value: 'not-a-response' as never }) }))
      .toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(raw).not.toHaveBeenCalled()
  })

  it('discards the value when identity or frame moves during the read', async () => {
    let session = 'session:one'
    const sessionFlip = await call({
      verifyIdentitySession: async () => ({ state: 'allowed' as const, value: { sessionRef: session } }),
      read: async () => {
        session = 'session:two'
        return { state: 'allowed' as const, value: Response.json({ aggregate: true }) }
      },
    })
    expect(sessionFlip).toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(sessionFlip).not.toHaveProperty('value')

    let frame = 7
    const frameFlip = await call({
      verifyFrame: async () => ({ state: 'allowed' as const, value: { frameGeneration: frame } }),
      read: async () => {
        frame = 8
        return { state: 'allowed' as const, value: Response.json({ aggregate: true }) }
      },
    })
    expect(frameFlip).toMatchObject({ state: 'unavailable', stage: 'read' })
    expect(frameFlip).not.toHaveProperty('value')
  })

  it('rejects an unregistered operation before any port runs', async () => {
    const read = vi.fn(async () => ({ state: 'allowed' as const, value: Response.json({}) }))
    const result = await call({ read }, 'state.write')
    expect(result).toMatchObject({ state: 'unavailable', stage: 'caller' })
    expect(read).not.toHaveBeenCalled()
  })
})
