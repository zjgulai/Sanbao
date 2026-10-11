/** L1-C (ADR-0323): the draft-custody admission family — the five-step profile, the
 *  active-session candidate rule, the per-step failure vocabulary and the detail guard. */
import { describe, expect, it } from 'vitest'

import {
  admitDraftCustodyEffect,
  isDraftCustodyDispatchDetail,
  type DraftCustodyAdmissionPorts,
  type DraftCustodyIntent,
} from '../src/appservice/draft-custody-admission.js'

const intent: DraftCustodyIntent = {
  family: 'draft-custody',
  requestId: 'draft-fixture-1',
  operation: 'draft.create',
  candidate: { kind: 'active-session' },
  payload: { rawInput: '把季度复盘整理成对外说明' },
}

const STATUS = { state: 'unlocked' as const, drafts: [] }

function ports(overrides: Partial<DraftCustodyAdmissionPorts> = {}): DraftCustodyAdmissionPorts {
  return {
    verifyCaller: async () => ({ state: 'allowed', value: { bindingRef: 'caller:1' } }),
    resolveActiveContext: async () => ({
      state: 'allowed',
      value: {
        scope: 'request',
        callerBindingRef: 'caller:1',
        sessionRef: 'session:1',
        matterRef: 'matter:1',
        revisionRef: 'revision:1',
        generation: '1',
      },
    }),
    matchCandidate: async () => ({ state: 'allowed', value: { candidateRef: 'matter:1' } }),
    resolveIdentityPolicy: async () => ({ state: 'allowed', value: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' } }),
    dispatch: async () => ({
      state: 'receipt',
      receiptRef: 'receipt:draft-create',
      detail: { kind: 'draft-created', status: STATUS },
    }),
    ...overrides,
  }
}

const call = (overrides: Partial<DraftCustodyAdmissionPorts> = {}, testIntent: DraftCustodyIntent = intent) =>
  admitDraftCustodyEffect({ intent: testIntent, correlation: 'correlation:1', ports: ports(overrides) })

describe('the draft-custody family (ADR-0323)', () => {
  it('runs the five-step profile and returns the receipt with its family detail', async () => {
    const result = await call()
    expect(result).toMatchObject({
      state: 'dispatched',
      correlation: 'correlation:1',
      receiptRef: 'receipt:draft-create',
      detail: { kind: 'draft-created' },
    })
  })

  it('rejects a non-active-session candidate as stale and names every moved step', async () => {
    const drifted = await call({}, { ...intent, candidate: { kind: 'matter', matterRef: 'matter:1' } } as never)
    expect(drifted).toMatchObject({ state: 'stale', code: 'protected-effect-stale', stage: 'candidate-match' })

    const cases = [
      [{ verifyCaller: async () => ({ state: 'unavailable' as const }) }, 'caller', 'unavailable'],
      [{ resolveActiveContext: async () => ({ state: 'stale' as const }) }, 'context', 'stale'],
      [{ resolveIdentityPolicy: async () => ({ state: 'denied' as const }) }, 'identity-policy', 'denied'],
    ] as const
    for (const [overrides, stage, state] of cases) {
      expect(await call(overrides), stage).toMatchObject({ state, stage })
    }
  })

  it('keeps a missing dispatch port retryable and a thrown dispatch unknown', async () => {
    const noDispatch = await admitDraftCustodyEffect({ intent, correlation: 'correlation:1', ports: ports({ dispatch: undefined }) })
    expect(noDispatch).toMatchObject({ state: 'unavailable', stage: 'dispatch', retryable: true })

    expect(await call({ dispatch: async () => { throw new Error('probe') } }))
      .toMatchObject({ state: 'outcome-unknown', code: 'protected-effect-outcome-unknown' })

    expect(await call({ dispatch: async () => ({ state: 'refused', code: 'draft-create-refused' }) }))
      .toMatchObject({ state: 'refused', code: 'draft-create-refused' })
  })

  it('validates the family detail guard per kind', () => {
    const outcome = { state: 'settled' as const, draftId: 'draft-1', matterRef: 'receipt:1' }
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-created', status: STATUS })).toBe(true)
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-updated', draftId: 'draft-1', status: STATUS })).toBe(true)
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-canceled', draftId: '', status: STATUS })).toBe(false)
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-reconciled', draftId: 'draft-1', outcome })).toBe(true)
    // The reconcile outcome's identity must equal the detail's draftId — no drifted receipts.
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-reconciled', draftId: 'draft-2', outcome })).toBe(false)
    expect(isDraftCustodyDispatchDetail({ kind: 'draft-reconciled', draftId: 'draft-1', outcome: { state: 'made-up', draftId: 'draft-1' } })).toBe(false)
  })
})
