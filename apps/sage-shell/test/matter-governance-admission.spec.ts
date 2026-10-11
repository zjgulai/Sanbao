/** L1-A (ADR-0320): the matter-governance admission family — the five-step profile, the
 *  candidate pairing, the per-step failure vocabulary and the receipt-detail guard. */
import { describe, expect, it } from 'vitest'

import {
  admitMatterGovernanceEffect,
  isMatterGovernanceDispatchDetail,
  type MatterGovernanceAdmissionPorts,
  type MatterGovernanceDispatchDetail,
  type MatterGovernanceIntent,
} from '../src/appservice/matter-governance-admission.js'

const MATTER = 'matter:sage.matter-admin-1'

const intent: MatterGovernanceIntent = {
  family: 'matter-governance',
  requestId: 'matter-admin-fixture-1',
  operation: 'matter.admin.archive',
  candidate: { kind: 'matter', matterRef: MATTER },
  payload: { ground: 'completed' },
}

const STATUS = { state: 'read' as const, entries: [], trail: [], rename: null, batch: null }

function detail(overrides: Partial<MatterGovernanceDispatchDetail> = {}): MatterGovernanceDispatchDetail {
  return { kind: 'matter-archived', matterRef: MATTER, ground: 'completed', status: STATUS, ...overrides } as MatterGovernanceDispatchDetail
}

function ports(overrides: Partial<MatterGovernanceAdmissionPorts> = {}): MatterGovernanceAdmissionPorts {
  return {
    verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: 'caller:1' } }),
    resolveActiveContext: async () => ({
      state: 'allowed',
      value: {
        scope: 'request',
        callerBindingRef: 'caller:1',
        sessionRef: 'session:1',
        matterRef: MATTER,
        revisionRef: 'revision:1',
        generation: '1',
      },
    }),
    matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: MATTER } }),
    resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
    dispatch: async () => ({ state: 'receipt', receiptRef: 'receipt:matter-archive:1', detail: detail() }),
    ...overrides,
  }
}

const call = (overrides: Partial<MatterGovernanceAdmissionPorts> = {}, testIntent: MatterGovernanceIntent = intent) =>
  admitMatterGovernanceEffect({ intent: testIntent, correlation: 'correlation:1', ports: ports(overrides) })

describe('the matter-governance family (ADR-0320)', () => {
  it('runs the five-step profile and returns the receipt with its family detail', async () => {
    const result = await call()
    expect(result).toMatchObject({
      state: 'dispatched',
      correlation: 'correlation:1',
      receiptRef: 'receipt:matter-archive:1',
      detail: { kind: 'matter-archived', matterRef: MATTER },
    })
  })

  it('pairs the caller matter against the active context — the renderer ref is never authority', async () => {
    const drifted = await call({}, { ...intent, candidate: { kind: 'matter', matterRef: 'matter:other' } })
    expect(drifted).toMatchObject({ state: 'stale', code: 'protected-effect-stale', stage: 'candidate-match' })

    const activeKind = await call({}, { ...intent, candidate: { kind: 'active-session' } })
    expect(activeKind).toMatchObject({ state: 'dispatched' })
  })

  it('names a binding mismatch as denied and every moved step with its own stage', async () => {
    const binding = await call({
      resolveActiveContext: async () => ({
        state: 'allowed',
        value: {
          scope: 'request',
          callerBindingRef: 'caller:other',
          sessionRef: 'session:1',
          matterRef: MATTER,
          revisionRef: 'revision:1',
          generation: '1',
        },
      }),
    })
    expect(binding).toMatchObject({ state: 'denied', code: 'protected-effect-denied', stage: 'context' })

    const cases = [
      [{ verifyCaller: async () => ({ state: 'unavailable' as const }) }, 'caller', 'unavailable'],
      [{ resolveActiveContext: async () => ({ state: 'stale' as const }) }, 'context', 'stale'],
      [{ matchCandidate: async () => ({ state: 'stale' as const }) }, 'candidate-match', 'stale'],
      [{ resolveIdentityPolicy: async () => ({ state: 'denied' as const }) }, 'identity-policy', 'denied'],
    ] as const
    for (const [overrides, stage, state] of cases) {
      const result = await call(overrides)
      expect(result, stage).toMatchObject({ state, stage })
    }
  })

  it('keeps a missing dispatch port retryable and a thrown dispatch unknown', async () => {
    const noDispatch = await admitMatterGovernanceEffect({
      intent,
      correlation: 'correlation:1',
      ports: ports({ dispatch: undefined }),
    })
    expect(noDispatch).toMatchObject({ state: 'unavailable', code: 'protected-effect-unavailable', stage: 'dispatch', retryable: true })

    const thrown = await call({ dispatch: async () => { throw new Error('probe') } })
    expect(thrown).toMatchObject({ state: 'outcome-unknown', code: 'protected-effect-outcome-unknown' })
  })

  it('keeps determinate refusals, not-dispatched and malformed details distinct', async () => {
    expect(await call({ dispatch: async () => ({ state: 'refused', code: 'matter-unknown' }) }))
      .toMatchObject({ state: 'refused', code: 'matter-unknown' })

    expect(await call({ dispatch: async () => ({ state: 'not-dispatched' }) }))
      .toMatchObject({ state: 'unavailable', code: 'protected-effect-unavailable', stage: 'dispatch', retryable: true })

    const malformed = [
      { state: 'receipt' as const, receiptRef: 'receipt:1' },
      { state: 'receipt' as const, receiptRef: 'receipt:1', detail: { kind: 'matter-archived', matterRef: MATTER, ground: 'completed' } },
      { state: 'receipt' as const, receiptRef: 'receipt:1', detail: { kind: 'matter-archived', matterRef: MATTER, ground: 'maybe', status: STATUS } },
      { state: 'receipt' as const, receiptRef: 'receipt:1', detail: { kind: 'matter-renamed', matterRef: MATTER, title: '', status: STATUS } },
    ]
    for (const result of malformed) {
      expect(await call({ dispatch: async () => result as never }), JSON.stringify(result))
        .toMatchObject({ state: 'outcome-unknown', code: 'protected-effect-outcome-unknown' })
    }
  })

  it('validates the family detail guard per kind', () => {
    expect(isMatterGovernanceDispatchDetail(detail())).toBe(true)
    expect(isMatterGovernanceDispatchDetail({ kind: 'matter-batch', operation: 'restore', status: STATUS })).toBe(true)
    expect(isMatterGovernanceDispatchDetail({ kind: 'matter-restored', matterRef: MATTER, status: { state: 'unavailable' } })).toBe(true)
    expect(isMatterGovernanceDispatchDetail({ kind: 'matter-batch', operation: 'delete', status: STATUS })).toBe(false)
    expect(isMatterGovernanceDispatchDetail({ kind: 'matter-restored', matterRef: '', status: STATUS })).toBe(false)
    expect(isMatterGovernanceDispatchDetail({ kind: 'matter-renamed', matterRef: MATTER, title: 'x', status: { state: 'made-up' } })).toBe(false)
  })
})
