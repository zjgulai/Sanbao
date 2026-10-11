/** L1-C (ADR-0323): the draft-custody dispatch step — per-op payload guards, the live
 *  re-verification subset, and the store-result mapping over the family detail. */
import { describe, expect, it, vi } from 'vitest'

import { createDraftCustodyDispatchPort } from '../src/main/draft-custody-dispatch.js'
import type { DraftCustodyIntent } from '../src/appservice/draft-custody-admission.js'

const STATUS = { state: 'unlocked' as const, drafts: [] }
const CONTEXT = {
  scope: 'request' as const,
  callerBindingRef: 'caller:1',
  sessionRef: 'session:1',
  matterRef: 'matter:1',
  revisionRef: 'revision:1',
  generation: '1',
}

function harness(options: { readonly readContext?: () => unknown } = {}) {
  const create = vi.fn(() => STATUS)
  const update = vi.fn(() => STATUS)
  const cancel = vi.fn(() => STATUS)
  const reconcile = vi.fn(async () => ({ state: 'settled' as const, matterRef: 'receipt:9' }))
  const commitConversion = vi.fn()
  const noteAttempt = vi.fn()
  const port = createDraftCustodyDispatchPort({
    create: create as never,
    update: update as never,
    cancel: cancel as never,
    reconcile: reconcile as never,
    commitConversion,
    noteAttempt,
    readContext: (options.readContext ?? (() => ({
      sessionRef: 'session:1',
      matterRef: 'matter:1',
      revisionRef: 'revision:1',
      contextGeneration: 1,
      frameGeneration: 7,
    }))) as never,
    readIdentitySession: (() => ({ sessionRef: 'session:1' })) as never,
    readFrame: (() => ({ generation: 7, ready: true, contaminated: false })) as never,
  })
  const request = (intent: DraftCustodyIntent) => ({
    intent,
    correlation: 'caller:1',
    caller: { bindingRef: 'caller:1' },
    context: CONTEXT,
    candidate: { candidateRef: 'matter:1' },
    identityPolicy: { decisionRef: 'decision:1', actorScopeRef: 'actor:1' },
  })
  return { port, request, create, update, cancel, reconcile, commitConversion, noteAttempt }
}

const intent = (operation: string, payload: Readonly<Record<string, unknown>>): DraftCustodyIntent =>
  ({ family: 'draft-custody', requestId: 'fixture-1', operation, candidate: { kind: 'active-session' }, payload }) as DraftCustodyIntent

describe('the draft-custody dispatch step (ADR-0323)', () => {
  it('maps each custody command to its family detail', async () => {
    const h = harness()
    expect(await h.port(h.request(intent('draft.create', { rawInput: '需求' })) as never)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:draft-create',
      detail: { kind: 'draft-created', status: STATUS },
    })
    expect(h.create).toHaveBeenCalledWith({ rawInput: '需求' })

    expect(await h.port(h.request(intent('draft.update', { draftId: 'draft-1', fields: { goal: 'g' } })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'draft-updated', draftId: 'draft-1' } })
    expect(h.update).toHaveBeenCalledWith({ draftId: 'draft-1', fields: { goal: 'g' } })

    expect(await h.port(h.request(intent('draft.cancel', { draftId: 'draft-1' })) as never))
      .toMatchObject({ state: 'receipt', detail: { kind: 'draft-canceled', draftId: 'draft-1' } })

    // Reconcile settles through the custodian and writes the receipt back to the draft.
    expect(await h.port(h.request(intent('draft.reconcile', { draftId: 'draft-1' })) as never)).toEqual({
      state: 'receipt',
      receiptRef: 'receipt:draft-reconcile:draft-1',
      detail: { kind: 'draft-reconciled', draftId: 'draft-1', outcome: { state: 'settled', matterRef: 'receipt:9', draftId: 'draft-1' } },
    })
    expect(h.commitConversion).toHaveBeenCalledWith({ draftId: 'draft-1', matterRef: 'receipt:9' })

    // A failed verdict notes the attempt; an unknown verdict notes nothing.
    const failed = harness()
    failed.reconcile.mockResolvedValueOnce({ state: 'failed' as never, code: 'custodian-failed' } as never)
    expect(await failed.port(failed.request(intent('draft.reconcile', { draftId: 'draft-1' })) as never))
      .toMatchObject({ detail: { outcome: { state: 'failed', code: 'custodian-failed' } } })
    expect(failed.noteAttempt).toHaveBeenCalledWith({ draftId: 'draft-1', state: 'failed' })
    expect(failed.commitConversion).not.toHaveBeenCalled()
  })

  it('answers not-dispatched for every malformed payload and an unregistered operation', async () => {
    const h = harness()
    const bad: readonly [string, Readonly<Record<string, unknown>>][] = [
      ['draft.create', { rawInput: '   ' }],
      ['draft.create', { rawInput: 'x'.repeat(16_385) }],
      ['draft.update', { draftId: '' }],
      ['draft.update', { draftId: 'draft-1', fields: { nope: 'x' } }],
      ['draft.update', { draftId: 'draft-1', clarification: 7 }],
      ['draft.update', { draftId: 'draft-1', selectedEntryIds: [7] }],
      ['draft.cancel', { draftId: '' }],
      ['draft.reconcile', {}],
      ['draft.unknown', {}],
    ]
    for (const [operation, payload] of bad) {
      expect(await h.port(h.request(intent(operation, payload)) as never), operation).toEqual({ state: 'not-dispatched' })
    }
    expect(h.create).not.toHaveBeenCalled()
    expect(h.update).not.toHaveBeenCalled()
  })

  it('re-verifies the live facts and answers not-dispatched before the store on drift', async () => {
    const h = harness({ readContext: () => ({ sessionRef: 'session:1', matterRef: 'matter:other', revisionRef: 'revision:1', contextGeneration: 1, frameGeneration: 7 }) })
    expect(await h.port(h.request(intent('draft.cancel', { draftId: 'draft-1' })) as never)).toEqual({ state: 'not-dispatched' })
    expect(h.cancel).not.toHaveBeenCalled()
  })

  it('normalizes a thrown store call to the conservative unknown', async () => {
    const h = harness()
    h.create.mockImplementationOnce(() => { throw new Error('probe') })
    expect(await h.port(h.request(intent('draft.create', { rawInput: 'x' })) as never)).toEqual({ state: 'outcome-unknown' })
  })
})
