import { describe, expect, it } from 'vitest'

import { createActionConfirmationStore, type ActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createPlans, type PlanPremiseReading, type PlansDeps } from '../src/main/plans.js'

/**
 * Ticket 032 at the S1 route (US-165~168).
 *
 * Create/accept are receipts — acceptance mints no card, consumes nothing and records no run.
 * Readiness comes from the premise reading fresh per request (unknown blocks, not-ready refuses);
 * prepare only ever answers a card for a ready step; the unwired executor answers not-ready
 * without consuming the one-time credential (replayable, nothing fabricated); and the wired
 * path re-checks freshness before spending the confirmation, then lets it be spent exactly once.
 */

const ready = (environmentRef: string | null = 'ws-1', environmentPresent: boolean | null = true): PlanPremiseReading =>
  ({ state: 'read', environmentRef, environmentPresent, reason: null })

function harness(options: { readonly wired?: boolean, readonly executor?: PlansDeps['executeStep'] } = {}) {
  let premises: PlanPremiseReading = ready()
  let planTick = 0
  let cardTick = 0
  const counts = { prepared: 0, consumeAttempts: 0, consumed: 0, retired: 0, calls: 0 }
  const store = createActionConfirmationStore({ now: () => '2026-10-03T09:00:00.000Z', nextId: () => `cf-${cardTick += 1}` })
  const counted: ActionConfirmationStore = {
    prepare: (intent, facts) => { counts.prepared += 1; return store.prepare(intent, facts) },
    consume: (intent, confirmationId, facts) => {
      counts.consumeAttempts += 1
      const verdict = store.consume(intent, confirmationId, facts)
      if (verdict.ok) counts.consumed += 1
      return verdict
    },
    retire: (confirmationId) => { counts.retired += 1; store.retire(confirmationId) },
  }
  const executor = options.executor
  const plans = createPlans({
    now: () => '2026-10-03T09:00:00.000Z',
    nextId: () => `plan-${planTick += 1}`,
    premises: () => premises,
    confirmations: { store: counted, facts: () => ({ environmentRef: 'ws-1' }) },
    ...(executor === undefined ? {} : { executeStep: (intent) => { counts.calls += 1; return executor(intent) } }),
  })
  const providers = createUnavailableFirstService(null, options.wired === false ? {} : {
    plans: plans.list,
    planCreate: plans.create,
    planAccept: plans.accept,
    planPrepareStep: plans.prepareStep,
    planExecuteStep: plans.executeStep,
  })
  const request = (path: string, init?: RequestInit) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, init),
    { callerBinding: { correlation: 'c-032' }, providers } as never,
  )
  const post = (path: string, body: unknown) => request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const readState = async () => (await (await providers.readState()).json()) as Record<string, unknown>
  return { post, request, readState, counts, setPremises: (next: PlanPremiseReading) => { premises = next } }
}

const createPlan = async (h: ReturnType<typeof harness>, steps: string[] = ['备料', '试产']) => {
  const created = await (await h.post('/.sage/plans', { action: 'create', matterRef: 'matter:1', title: '上架方案', steps })).json() as {
    state: string, planId: string, plans: { plans: Array<Record<string, unknown>> }
  }
  expect(created.state).toBe('ok')
  return created
}

describe('the plans routes (ticket 032)', () => {
  it('accepts a plan as a receipt only: no card, no consume, no run (US-165/166)', async () => {
    const h = harness()
    const created = await createPlan(h)
    expect(created.plans.plans[0]).toMatchObject({ planId: created.planId, matterRef: 'matter:1', state: 'draft', acceptedAt: null })

    const accepted = await (await h.post('/.sage/plans', { action: 'accept', planId: created.planId })).json() as {
      state: string, plans: { plans: Array<{ planId: string, state: string, acceptedAt: string | null }>, lastStepRun: unknown }
    }
    expect(accepted.state).toBe('ok')
    const view = accepted.plans.plans.find((entry) => entry.planId === created.planId)!
    expect(view.state).toBe('accepted')
    expect(view.acceptedAt).toBe('2026-10-03T09:00:00.000Z')
    // The receipt-only discipline is structural: nothing was minted, spent or run.
    expect(h.counts).toEqual({ prepared: 0, consumeAttempts: 0, consumed: 0, retired: 0, calls: 0 })
    expect(accepted.plans.lastStepRun).toBeNull()

    const again = await (await h.post('/.sage/plans', { action: 'accept', planId: created.planId })).json() as typeof accepted
    expect(again.state).toBe('ok')
    expect(again.plans.plans.find((entry) => entry.planId === created.planId)!.acceptedAt).toBe('2026-10-03T09:00:00.000Z')
  })

  it('judges readiness per premise and refuses blocked steps before any card exists (US-167)', async () => {
    const h = harness()
    const created = await createPlan(h, ['备料'])

    const readyView = (await h.readState()).plans as { plans: Array<{ steps: Array<Record<string, unknown>> }> }
    expect(readyView.plans[0]?.steps[0]).toMatchObject({ stepNo: 1, readiness: 'ready', readinessNote: '执行环境 ws-1 存在（逐次核验）' })
    const prepared = await (await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })).json() as Record<string, unknown>
    expect(prepared).toMatchObject({ state: 'prepared', planId: created.planId, stepNo: 1 })
    expect(h.counts.prepared).toBe(1)
    expect((prepared.card as { target: { revisionRef: string } }).target.revisionRef).toBe(`plan:${created.planId}:step:1`)

    // The environment vanished from the fold: not-ready, refused before any new card.
    h.setPremises({ state: 'read', environmentRef: 'ws-9', environmentPresent: false, reason: null })
    const notReadyView = (await h.readState()).plans as { plans: Array<{ steps: Array<{ readiness: string, readinessNote: string }> }> }
    expect(notReadyView.plans[0]?.steps[0]?.readiness).toBe('not-ready')
    expect(notReadyView.plans[0]?.steps[0]?.readinessNote).toContain('不存在')
    expect(await (await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })).json())
      .toMatchObject({ state: 'refused', planId: created.planId, stepNo: 1, code: 'step-not-ready' })

    // The premise cannot be read at all: unknown — blocked, and never phrased as a failure.
    h.setPremises({ state: 'unavailable', environmentRef: null, environmentPresent: null, reason: 'workspace-fold-unreadable' })
    const unknownView = (await h.readState()).plans as { plans: Array<{ steps: Array<{ readiness: string, readinessNote: string }> }> }
    expect(unknownView.plans[0]?.steps[0]?.readiness).toBe('unknown')
    expect(unknownView.plans[0]?.steps[0]?.readinessNote).toContain('按阻断处理')
    expect(unknownView.plans[0]?.steps[0]?.readinessNote).not.toContain('失败')
    const refusedUnknown = await (await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })).json() as Record<string, unknown>
    expect(refusedUnknown).toMatchObject({ state: 'refused', code: 'step-premise-unknown' })
    // Still exactly one card ever minted: blocked steps never reach the store.
    expect(h.counts.prepared).toBe(1)
  })

  it('answers the unwired executor not-ready without consuming; the credential stays replayable (US-168)', async () => {
    const h = harness()
    const created = await createPlan(h, ['备料'])
    await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })

    const first = await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-1' })).json() as {
      state: string, code: string, plans: { state: string, lastStepRun: Record<string, unknown> }
    }
    expect(first).toMatchObject({ state: 'not-ready', code: 'step-execution-unavailable' })
    // The refusal rides the same projection the poll serves — and records the run.
    expect(first.plans.state).toBe('read')
    expect(first.plans.lastStepRun).toMatchObject({ planId: created.planId, stepNo: 1, state: 'not-ready', code: 'step-execution-unavailable' })
    // No fabrication anywhere and no consume: the confirmation was not even offered to the store.
    expect(h.counts).toMatchObject({ consumeAttempts: 0, consumed: 0, retired: 0, calls: 0 })
    expect(JSON.stringify(first)).not.toContain('receiptRef')

    // Replay: still not spent, still not pretending — the same honest answer.
    const second = await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-1' })).json() as typeof first
    expect(second).toMatchObject({ state: 'not-ready', code: 'step-execution-unavailable' })
    expect(h.counts.consumeAttempts).toBe(0)

    // The run fact lives in the state projection, not only in the response.
    const state = (await h.readState()).plans as { lastStepRun: Record<string, unknown> | null }
    expect(state.lastStepRun).toMatchObject({ planId: created.planId, stepNo: 1, state: 'not-ready' })
  })

  it('re-checks freshness before spending the confirmation, then spends it exactly once (US-168)', async () => {
    const h = harness({ executor: async () => ({ receiptRef: 'receipt:9' }) })
    const created = await createPlan(h, ['备料'])
    await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })

    // The premise moved on between prepare and execute: the old card is retired, nothing runs,
    // and the credential is never even offered to the store.
    h.setPremises({ state: 'read', environmentRef: 'ws-9', environmentPresent: false, reason: null })
    expect(await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-1' })).json())
      .toMatchObject({ state: 'refused', code: 'step-not-ready' })
    expect(h.counts).toMatchObject({ consumeAttempts: 0, consumed: 0, calls: 0 })
    expect(h.counts.retired).toBe(1)

    // The old facts coming back do not revive the card: it was retired, and consume calls it stale.
    h.setPremises(ready())
    expect(await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-1' })).json())
      .toMatchObject({ state: 'refused', code: 'confirmation-stale' })
    expect(h.counts).toMatchObject({ consumeAttempts: 1, consumed: 0, calls: 0 })

    // A fresh preparation mints a new single card; executing with the credential settles once.
    expect(await (await h.post('/.sage/plans', { action: 'prepare-step', planId: created.planId, stepNo: 1 })).json())
      .toMatchObject({ state: 'prepared', planId: created.planId, stepNo: 1 })
    const settled = await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-2' })).json() as {
      state: string, receiptRef: string, plans: { lastStepRun: Record<string, unknown> }
    }
    expect(settled).toMatchObject({ state: 'settled', receiptRef: 'receipt:9' })
    expect(settled.plans.lastStepRun).toMatchObject({ planId: created.planId, stepNo: 1, state: 'settled' })
    expect(h.counts).toMatchObject({ consumeAttempts: 2, consumed: 1, calls: 1 })

    // One confirmation, one dispatch: the replay is refused without a second run.
    expect(await (await h.post('/.sage/plans', { action: 'execute-step', planId: created.planId, stepNo: 1, confirmationId: 'cf-2' })).json())
      .toMatchObject({ state: 'refused', code: 'confirmation-consumed' })
    expect(h.counts).toMatchObject({ consumeAttempts: 3, consumed: 1, calls: 1 })
  })

  it('keeps an unwired family honest and parses bodies exactly', async () => {
    const unwired = harness({ wired: false })
    expect(await (await unwired.post('/.sage/plans', { action: 'create', matterRef: 'matter:1', title: 't', steps: ['a'] })).json())
      .toMatchObject({ state: 'refused', code: 'plans-unavailable' })
    expect(await (await unwired.post('/.sage/plans', { action: 'execute-step', planId: 'plan-1', stepNo: 1 })).json())
      .toMatchObject({ state: 'not-ready', code: 'plans-unavailable', plans: { state: 'unavailable', lastStepRun: null } })
    expect((await unwired.readState()).plans).toEqual({ state: 'unavailable', plans: [], lastStepRun: null })

    const h = harness()
    expect((await h.request('/.sage/plans')).status).toBe(405)
    const bad: unknown[] = [
      { action: 'create', matterRef: 'matter:1', title: ' ', steps: ['a'] },
      { action: 'create', matterRef: 'matter:1', title: 't', steps: [] },
      { action: 'create', matterRef: 'matter:1', title: 't', steps: ['a'], extra: 1 },
      { action: 'create', matterRef: '', title: 't', steps: ['a'] },
      { action: 'accept', planId: '' },
      { action: 'prepare-step', planId: 'plan-1', stepNo: 0 },
      { action: 'prepare-step', planId: 'plan-1', stepNo: 13 },
      { action: 'execute-step', planId: 'plan-1', stepNo: 13 },
      { action: 'execute-step', planId: 'plan-1', stepNo: 1, confirmationId: '' },
      { action: 'toggle', planId: 'plan-1' },
    ]
    for (const body of bad) {
      expect((await h.post('/.sage/plans', body)).status, JSON.stringify(body)).toBe(400)
    }
  })
})
