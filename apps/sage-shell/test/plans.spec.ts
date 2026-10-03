import { describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createPlans } from '../src/main/plans.js'
import type { PlanPremiseReading } from '../src/main/plans.js'

/**
 * Ticket 032, the plan deliverable (US-165~167).
 *
 * Accepting a plan never dispatches; readiness blocks on unknown; and a step runs only through
 * its own prepared card, consumed exactly once via the shared store. The counters below make
 * "nothing else happened" a machine fact.
 */

function harness(options: { premises?: PlanPremiseReading, execute?: Parameters<typeof createPlans>[0]['executeStep'] } = {}) {
  let preparedCount = 0
  let consumedCount = 0
  let tick = 0
  const baseStore = createActionConfirmationStore({ now: () => '2026-10-03T11:00:00.000Z', nextId: () => `cf-${tick += 1}` })
  const store = {
    prepare: (intent: never, facts: never) => { preparedCount += 1; return baseStore.prepare(intent, facts) },
    consume: (intent: never, confirmationId: never, facts: never) => { consumedCount += 1; return baseStore.consume(intent, confirmationId, facts) },
    retire: (confirmationId: string) => { baseStore.retire(confirmationId) },
  }
  const holder: { execute?: Parameters<typeof createPlans>[0]['executeStep'] } = { execute: options.execute }
  const premiseHolder: { current: PlanPremiseReading } = {
    current: options.premises ?? { state: 'read', environmentRef: null, environmentPresent: null, reason: null },
  }
  const plans = createPlans({
    now: () => `2026-10-03T11:00:0${tick}.000Z`,
    nextId: () => `plan-${tick += 1}`,
    premises: () => premiseHolder.current,
    confirmations: { store: store as never, facts: () => ({ environmentRef: null }) },
    get executeStep() { return holder.execute },
  })
  return { plans, prepared: () => preparedCount, consumed: () => consumedCount, holder, setPremises: (next: PlanPremiseReading) => { premiseHolder.current = next } }
}

const created = (h: ReturnType<typeof harness>) => {
  const outcome = h.plans.create({ matterRef: 'matter:1', title: '上架方案', steps: ['备料', '试产', '投放'] })
  if (outcome.state !== 'ok') throw new Error('expected plan')
  return outcome.planId
}

describe('the plan deliverable (US-165/166)', () => {
  it('accepting records the receipt and dispatches nothing — no card, no executor, no consume', async () => {
    const h = harness({ execute: async () => ({ receiptRef: 'r-never' }) })
    const planId = created(h)
    const accepted = h.plans.accept({ planId })
    expect(accepted.state).toBe('ok')
    if (accepted.state !== 'ok') return
    expect(accepted.plans.plans[0]).toMatchObject({ state: 'accepted', acceptedAt: '2026-10-03T11:00:01.000Z' })
    expect(h.prepared()).toBe(0)
    expect(h.consumed()).toBe(0)
    // The executor was never reachable through acceptance.
    void h.holder
  })

  it('readiness is per premise: chosen+present is ready, absent is not-ready, unread is unknown', () => {
    const cases: Array<[PlanPremiseReading, string]> = [
      [{ state: 'read', environmentRef: null, environmentPresent: null, reason: null }, 'ready'],
      [{ state: 'read', environmentRef: 'ws-1', environmentPresent: true, reason: null }, 'ready'],
      [{ state: 'read', environmentRef: 'ws-1', environmentPresent: false, reason: null }, 'not-ready'],
      [{ state: 'read', environmentRef: 'ws-1', environmentPresent: null, reason: 'workspace-fold-not-read' }, 'unknown'],
      [{ state: 'unavailable', environmentRef: 'ws-1', environmentPresent: null, reason: 'workspace-fold-unreadable' }, 'unknown'],
    ]
    for (const [premises, expected] of cases) {
      const h = harness({ premises })
      created(h)
      const step = h.plans.list().plans[0]?.steps[0]
      expect(step?.readiness, JSON.stringify(premises)).toBe(expected)
    }
    // The unknown note says blocked, not failed.
    const h = harness({ premises: { state: 'unavailable', environmentRef: null, environmentPresent: null, reason: 'workspace-fold-unreadable' } })
    created(h)
    expect(h.plans.list().plans[0]?.steps[0]?.readinessNote).toContain('按阻断处理，不派发')
    expect(h.plans.list().plans[0]?.steps[0]?.readinessNote).not.toContain('失败')
  })

  it('a not-ready or unknown step refuses prepare before any card exists (US-167)', () => {
    for (const [premises, code] of [
      [{ state: 'unavailable', environmentRef: null, environmentPresent: null, reason: 'fold' }, 'step-premise-unknown'],
      [{ state: 'read', environmentRef: 'ws-1', environmentPresent: false, reason: null }, 'step-not-ready'],
    ] as Array<[PlanPremiseReading, string]>) {
      const h = harness({ premises })
      const planId = created(h)
      expect(h.plans.prepareStep({ planId, stepNo: 2 })).toMatchObject({ state: 'refused', code })
      expect(h.prepared()).toBe(0)
    }
    expect(harness().plans.prepareStep({ planId: 'nope', stepNo: 1 })).toMatchObject({ state: 'refused', code: 'plan-step-not-found' })
  })

  it('a ready step mints its card; the credential is consumed exactly once through the shared store', async () => {
    const h = harness()
    const planId = created(h)
    const prepared = h.plans.prepareStep({ planId, stepNo: 1 })
    expect(prepared.state).toBe('prepared')
    if (prepared.state !== 'prepared') return
    expect(prepared.card.action.type).toBe('plan-step')
    expect(prepared.card.target).toMatchObject({ matterRef: 'matter:1', revisionRef: `plan:${planId}:step:1` })
    expect(h.prepared()).toBe(1)

    // No executor: the honest not-ready, and the confirmation stays unconsumed.
    expect(await h.plans.executeStep({ planId, stepNo: 1, confirmationId: prepared.card.confirmationId }))
      .toMatchObject({ state: 'not-ready', code: 'step-execution-unavailable' })
    expect(h.consumed()).toBe(0)

    h.holder.execute = async () => ({ receiptRef: 'step-receipt:1' })
    const settled = await h.plans.executeStep({ planId, stepNo: 1, confirmationId: prepared.card.confirmationId })
    expect(settled).toMatchObject({ state: 'settled', receiptRef: 'step-receipt:1' })
    if (settled.state !== 'settled') return
    expect(settled.plans.lastStepRun).toMatchObject({ planId, stepNo: 1, state: 'settled', code: null })
    expect(await h.plans.executeStep({ planId, stepNo: 1, confirmationId: prepared.card.confirmationId }))
      .toMatchObject({ state: 'refused', code: 'confirmation-consumed' })
    expect(h.consumed()).toBe(2)
  })

  it('a premise change between prepare and execute blocks, retires the card, and restoring the facts does not revive it', async () => {
    const h = harness({ execute: async () => ({ receiptRef: 'step-receipt:9' }) })
    const planId = created(h)
    const prepared = h.plans.prepareStep({ planId, stepNo: 1 })
    if (prepared.state !== 'prepared') throw new Error('expected prepared')

    // The premise turns unknown before the confirm: blocked before the credential is spent.
    h.setPremises({ state: 'unavailable', environmentRef: null, environmentPresent: null, reason: 'workspace-fold-unreadable' })
    expect(await h.plans.executeStep({ planId, stepNo: 1, confirmationId: prepared.card.confirmationId }))
      .toMatchObject({ state: 'refused', code: 'step-premise-unknown' })
    expect(h.consumed()).toBe(0)

    // The facts come back identical — the retired card stays dead (US-126 discipline).
    h.setPremises({ state: 'read', environmentRef: null, environmentPresent: null, reason: null })
    expect(await h.plans.executeStep({ planId, stepNo: 1, confirmationId: prepared.card.confirmationId }))
      .toMatchObject({ state: 'refused', code: 'confirmation-stale' })
    expect(h.consumed()).toBe(1)
  })
})

describe('the plan shape is pinned', () => {
  it('no approval/dispatch vocabulary, keys exact', () => {
    const h = harness()
    created(h)
    const plan = h.plans.list().plans[0]!
    expect(Object.keys(plan).sort()).toEqual(['acceptedAt', 'createdAt', 'matterRef', 'planId', 'state', 'steps', 'title'])
    expect(Object.keys(plan.steps[0]!).sort()).toEqual(['readiness', 'readinessNote', 'stepNo', 'title'])
    const text = JSON.stringify(h.plans.list())
    for (const banned of ['approved', 'approval', 'dispatched', 'auto-run']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('refuses malformed creations before anything exists', () => {
    const h = harness()
    expect(h.plans.create({ matterRef: 'matter:1', title: '  ', steps: ['a'] })).toMatchObject({ state: 'refused', code: 'plan-title-invalid' })
    expect(h.plans.create({ matterRef: 'matter:1', title: 'p', steps: ['  '] })).toMatchObject({ state: 'refused', code: 'plan-steps-invalid' })
    expect(h.plans.create({ matterRef: 'matter:1', title: 'p', steps: Array.from({ length: 13 }, () => 'x') })).toMatchObject({ state: 'refused', code: 'plan-steps-invalid' })
    expect(h.plans.list().plans).toEqual([])
  })
})
