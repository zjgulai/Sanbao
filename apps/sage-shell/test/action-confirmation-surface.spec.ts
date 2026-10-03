import { describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * Ticket 025 at the S1 route (§N, US-124~128).
 *
 * `/.sage/actions/prepare` mints the single card; the dispatch that follows carries the one-time
 * credential beside the intent, and the confirmation gate runs before the pipeline — a missing,
 * stale or already-spent confirmation never reaches a step, and the transport retry probe (which
 * has no external effect) never needs one.
 */

const intent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  matterId: 'matter:1',
  revisionId: 'revision:7',
  actionType: 'create-matter',
  actionScope: 'revision',
  payload: { goal: 'g', deliverable: 'd' },
  origin: 'renderer-action',
  ...overrides,
})

function harness(options: { readonly wired?: boolean } = {}) {
  const steps: string[] = []
  let environmentRef: string | null = 'ws:1'
  let tick = 0
  const wiring = {
    store: createActionConfirmationStore({ now: () => '2026-10-02T21:00:00.000Z', nextId: () => `cf-${tick += 1}` }),
    facts: () => ({ environmentRef }),
  }
  const providers = createUnavailableFirstService(null, {
    ...(options.wired === false ? {} : { actionConfirmations: wiring }),
    commandPorts: {
      ...PRODUCTION_FAIL_CLOSED_PORTS,
      checkAuthorizationAvailability: () => ({ ok: true as const }),
      resolveIdentityPolicy: () => {
        steps.push('identity')
        return { kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }
      },
      createMatter: () => {
        steps.push('create')
        return undefined
      },
    },
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-025' }, providers } as never,
  )
  return {
    steps,
    prepare: (body: unknown) => post('/.sage/actions/prepare', body),
    dispatch: (body: unknown) => post('/.sage/actions', body),
    setEnvironment: (value: string | null) => { environmentRef = value },
    wiring,
  }
}

describe('the actions-prepare route and the dispatch gate (ticket 025)', () => {
  it('prepares the single card for one exact intent', async () => {
    const h = harness()
    const response = await h.prepare(intent())
    expect(response.status).toBe(200)
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({
      state: 'prepared',
      card: {
        confirmationId: 'cf-1',
        target: { matterRef: 'matter:1', revisionRef: 'revision:7' },
        action: { type: 'create-matter', scope: 'revision' },
        costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
      },
    })
    // The transport retry probe is not confirmable: it has no external effect to confirm.
    expect((await h.prepare({ type: 'retry' })).status).toBe(400)
    // And the prepare body is the exact intent shape — extra keys are refused, not ignored.
    expect((await h.prepare(intent({ extra: true }))).status).toBe(400)
  })

  it('refuses to mint anything while the store is unwired, instead of guessing', async () => {
    const h = harness({ wired: false })
    expect(await (await h.prepare(intent())).json()).toEqual({ state: 'refused', code: 'confirmation-unavailable' })
  })

  it('denies a bare dispatch before any step runs: the confirmation is the necessary condition', async () => {
    const h = harness()
    const response = await h.dispatch(intent())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ code: 'confirmation-required', stage: 'confirmation', retryable: false })
    expect(h.steps).toEqual([])
  })

  it('a prepared credential gates exactly one pipeline run: consumed once, a second click never dispatches twice', async () => {
    const h = harness()
    const card = (await (await h.prepare(intent())).json() as { card: { confirmationId: string } }).card
    const first = await h.dispatch({ intent: intent(), confirmationId: card.confirmationId })
    // The gate passed: the pipeline ran (and answered with its own fail-closed step).
    expect(await first.json()).toMatchObject({ code: 'persistence-unavailable', stage: 'create' })
    expect(h.steps).toEqual(['identity', 'create'])
    const replay = await h.dispatch({ intent: intent(), confirmationId: card.confirmationId })
    expect(await replay.json()).toMatchObject({ code: 'confirmation-consumed', stage: 'confirmation', retryable: false })
    expect(h.steps).toEqual(['identity', 'create'])
  })

  it('refuses an out-of-scope action with the old card, and the card stays dead afterwards', async () => {
    const h = harness()
    const card = (await (await h.prepare(intent())).json() as { card: { confirmationId: string } }).card
    const outOfScope = await h.dispatch({ intent: intent({ payload: { goal: 'g2', deliverable: 'd' } }), confirmationId: card.confirmationId })
    expect(await outOfScope.json()).toMatchObject({ code: 'confirmation-stale', stage: 'confirmation', retryable: false })
    expect(h.steps).toEqual([])
    // The intended action cannot ride the same card afterwards either — it is stale for good.
    const replay = await h.dispatch({ intent: intent(), confirmationId: card.confirmationId })
    expect(await replay.json()).toMatchObject({ code: 'confirmation-stale' })
    expect(h.steps).toEqual([])
  })

  it('re-checks prerequisites per dispatch: a changed fact invalidates the card before any step', async () => {
    const h = harness()
    const card = (await (await h.prepare(intent())).json() as { card: { confirmationId: string } }).card
    h.setEnvironment('ws:2')
    const response = await h.dispatch({ intent: intent(), confirmationId: card.confirmationId })
    expect(await response.json()).toMatchObject({ code: 'confirmation-stale', stage: 'confirmation', retryable: false })
    expect(h.steps).toEqual([])
  })

  it('lets the retry probe through untouched: an availability check is not an external effect', async () => {
    const h = harness()
    const response = await h.dispatch({ type: 'retry' })
    expect(await response.json()).toMatchObject({ availability: 'available' })
  })

  it('keeps the pre-025 shape while the store is unwired (unknown remains unknown)', async () => {
    const h = harness({ wired: false })
    const response = await h.dispatch(intent())
    expect(await response.json()).toMatchObject({ code: 'persistence-unavailable', stage: 'create' })
    expect(h.steps).toEqual(['identity', 'create'])
  })

  it('parses the credential envelope exactly: a malformed pair is invalid-intent', async () => {
    const h = harness()
    expect((await h.dispatch({ intent: intent(), confirmationId: '' })).status).toBe(400)
    expect((await h.dispatch({ intent: intent(), confirmationId: 7 })).status).toBe(400)
    expect((await h.dispatch({ intent: { type: 'retry' }, confirmationId: 'cf-1' })).status).toBe(400)
  })
})
