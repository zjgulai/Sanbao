import { describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import type { ActionConfirmationFacts } from '../src/appservice/action-confirmations.js'
import type { SageActionIntentV2 } from '../src/appservice/command-contracts.js'

/**
 * Ticket 025, the confirmation store (US-124~128).
 *
 * One card per external-effect action; one credential, consumed exactly once, at the dispatch it
 * gates. The record binds the exact intent and the facts the card asserted — a changed action,
 * revision, or prerequisite makes the old confirmation stale for good, because reusing an old
 * page state is exactly what US-126 rules out.
 */

const intent = (overrides: Partial<SageActionIntentV2> = {}): SageActionIntentV2 => ({
  matterId: 'matter:1',
  revisionId: 'revision:7',
  actionType: 'create-matter',
  actionScope: 'revision',
  payload: { goal: 'g', deliverable: 'd' },
  origin: 'renderer-action',
  ...overrides,
})

const facts = (environmentRef: string | null = null): ActionConfirmationFacts => ({ environmentRef })

function storeOf() {
  let tick = 0
  return createActionConfirmationStore({
    now: () => `2026-10-02T21:00:0${tick}.000Z`,
    nextId: () => `cf-${tick += 1}`,
  })
}

describe('the action confirmation store (ticket 025, US-124~128)', () => {
  it('prepares the single card: object, action, scope, resources, time, prerequisites, cost estimate', () => {
    const store = storeOf()
    const card = store.prepare(intent(), facts('ws:1'))
    expect(card).toMatchObject({
      confirmationId: 'cf-1',
      target: { matterRef: 'matter:1', revisionRef: 'revision:7' },
      action: { type: 'create-matter', scope: 'revision' },
      resources: [{ kind: 'execution-environment', ref: 'ws:1', state: 'selected' }],
      prerequisites: [{ name: 'execution-environment', state: 'met', note: 'environment-chosen' }],
    })
    // US-124: a cost estimate that is not obtainable says so instead of guessing.
    expect(card.costEstimate).toEqual({ state: 'unavailable', note: 'estimate-unavailable' })
    // US-127: the card carries the machine marker — confirming is not the effect.
    expect(card.effect).toBe('not-yet-happened')
    expect(typeof card.preparedAt).toBe('string')
    // No approval-routing vocabulary anywhere on the card (US-128): it is a card, not a step.
    const text = JSON.stringify(card)
    for (const banned of ['approver', 'approval', 'queue', 'delegate']) expect(text).not.toContain(banned)
  })

  it('reads an unchosen environment as not-selected / unknown — never invents a resource', () => {
    const store = storeOf()
    const card = store.prepare(intent(), facts(null))
    expect(card.resources).toEqual([{ kind: 'execution-environment', ref: null, state: 'not-selected' }])
    expect(card.prerequisites).toEqual([{ name: 'execution-environment', state: 'unknown', note: 'no-environment-chosen' }])
  })

  it('mints a fresh credential per prepare — two cards never share an id', () => {
    const store = storeOf()
    const first = store.prepare(intent(), facts())
    const second = store.prepare(intent(), facts())
    expect(first.confirmationId).not.toBe(second.confirmationId)
  })

  it('spends exactly once, and an id this run never minted was never confirmed', () => {
    const store = storeOf()
    const card = store.prepare(intent(), facts())
    expect(store.consume(intent(), card.confirmationId, facts())).toEqual({ ok: true, confirmationId: card.confirmationId })
    expect(store.consume(intent(), card.confirmationId, facts())).toEqual({ ok: false, code: 'confirmation-consumed' })
    expect(store.consume(intent(), 'cf-never-minted', facts())).toEqual({ ok: false, code: 'confirmation-required' })
    expect(store.consume(intent(), undefined, facts())).toEqual({ ok: false, code: 'confirmation-required' })
  })

  it('refuses an out-of-scope action with the old card: a changed payload, action, matter or revision is stale', () => {
    const store = storeOf()
    const variants: Array<Partial<SageActionIntentV2>> = [
      { payload: { goal: 'g2', deliverable: 'd' } },
      { actionType: 'approve-delivery' },
      { matterId: 'matter:2' },
      { revisionId: 'revision:8' },
      { actionScope: 'matter' },
    ]
    for (const variant of variants) {
      const card = store.prepare(intent(), facts())
      expect(store.consume(intent(variant), card.confirmationId, facts()), JSON.stringify(variant)).toEqual({ ok: false, code: 'confirmation-stale' })
    }
  })

  it('invalidates for good on a prerequisite change — restoring the old facts does not restore the confirmation', () => {
    const store = storeOf()
    const card = store.prepare(intent(), facts('ws:1'))
    expect(store.consume(intent(), card.confirmationId, facts('ws:2'))).toEqual({ ok: false, code: 'confirmation-stale' })
    // The environment came back exactly as the card showed it — the confirmation still does not.
    expect(store.consume(intent(), card.confirmationId, facts('ws:1'))).toEqual({ ok: false, code: 'confirmation-stale' })
  })

  it('binds the action identity, not the transport origin: the same action stays the same action', () => {
    const store = storeOf()
    const card = store.prepare(intent({ origin: 'renderer-retry' }), facts())
    expect(store.consume(intent({ origin: 'renderer-action' }), card.confirmationId, facts())).toEqual({ ok: true, confirmationId: card.confirmationId })
  })
})
