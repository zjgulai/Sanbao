import { describe, expect, it } from 'vitest'

import { createActionConfirmationStore } from '../src/appservice/action-confirmations.js'
import { createUnavailableFirstService, PRODUCTION_FAIL_CLOSED_PORTS } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'

/**
 * Ticket 025 on the draft path (US-124~128): 确认建项 now first asks for the single pre-execution
 * card; the convert that follows carries the one-time credential, and main re-checks the exact
 * custody intent — fields included — before the attempt is even opened.
 */

function harness(options: { readonly wired?: boolean } = {}) {
  const calls: string[] = []
  let payload: Record<string, string> = { goal: 'g', deliverable: 'd', responsibleParty: 'r' }
  let tick = 0
  const providers = createUnavailableFirstService(null, {
    ...(options.wired === false ? {} : {
      actionConfirmations: {
        store: createActionConfirmationStore({ now: () => '2026-10-02T21:00:00.000Z', nextId: () => `cf-${tick += 1}` }),
        facts: () => ({ environmentRef: null }),
      },
    }),
    draftPrepareConversion: (request) => ({
      state: 'ready',
      request: { draftId: request.draftId, matterId: `draft:${request.draftId}`, revisionId: 'draft-revision:1', payload },
    }),
    draftBeginAttempt: () => { calls.push('begin') },
    draftCommitConversion: ({ matterRef }) => { calls.push(`commit:${matterRef}`) },
    commandPorts: {
      ...PRODUCTION_FAIL_CLOSED_PORTS,
      resolveIdentityPolicy: () => ({ kind: 'authorized' as const, actor: {}, authoritySnapshot: {} }),
      createMatter: () => {
        calls.push('custody')
        return { receiptRef: 'receipt:42' }
      },
    },
  })
  const post = (path: string, body: unknown) => handleSageServiceRequest(
    new Request(`dsh-app://app${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    { callerBinding: { correlation: 'c-025' }, providers } as never,
  )
  return {
    calls,
    prepare: (body: unknown = { draftId: 'draft-1' }) => post('/.sage/draft/prepare-confirm', body),
    convert: (body: unknown) => post('/.sage/draft/convert', body),
    setFields: (next: Record<string, string>) => { payload = next },
  }
}

describe('the draft confirm path with the single-card gate (ticket 025)', () => {
  it('prepares the card from the draft the same way convert will rebuild it', async () => {
    const h = harness()
    const response = await h.prepare()
    expect(await response.json()).toMatchObject({
      state: 'prepared',
      draftId: 'draft-1',
      card: {
        confirmationId: 'cf-1',
        target: { matterRef: 'draft:draft-1', revisionRef: 'draft-revision:1' },
        action: { type: 'create-matter', scope: 'revision' },
        costEstimate: { state: 'unavailable', note: 'estimate-unavailable' },
      },
    })
    // The prepare body is exact: an extra key is refused, not ignored.
    expect((await h.prepare({ draftId: 'draft-1', extra: true })).status).toBe(400)
  })

  it('denies a convert without a valid confirmation before the attempt is opened', async () => {
    const h = harness()
    const response = await h.convert({ draftId: 'draft-1' })
    expect(await response.json()).toEqual({ state: 'denied', draftId: 'draft-1', code: 'confirmation-required', stage: 'confirmation', retryable: false })
    expect(h.calls).toEqual([])
    // A malformed credential is a transport-level invalid body, not a denial.
    expect((await h.convert({ draftId: 'draft-1', confirmationId: '' })).status).toBe(400)
  })

  it('converts exactly once behind the card: the receipt settles the draft, a second use is spent', async () => {
    const h = harness()
    const card = (await (await h.prepare()).json() as { card: { confirmationId: string } }).card
    const converted = await h.convert({ draftId: 'draft-1', confirmationId: card.confirmationId })
    expect(await converted.json()).toEqual({ state: 'converted', draftId: 'draft-1', matterRef: 'receipt:42' })
    expect(h.calls).toEqual(['begin', 'custody', 'commit:receipt:42'])
    const replay = await h.convert({ draftId: 'draft-1', confirmationId: card.confirmationId })
    expect(await replay.json()).toEqual({ state: 'denied', draftId: 'draft-1', code: 'confirmation-consumed', stage: 'confirmation', retryable: false })
    expect(h.calls).toEqual(['begin', 'custody', 'commit:receipt:42'])
  })

  it('invalidates the card when the fields changed between prepare and confirm (US-126)', async () => {
    const h = harness()
    const card = (await (await h.prepare()).json() as { card: { confirmationId: string } }).card
    h.setFields({ goal: '改过的目标', deliverable: 'd', responsibleParty: 'r' })
    const response = await h.convert({ draftId: 'draft-1', confirmationId: card.confirmationId })
    expect(await response.json()).toEqual({ state: 'denied', draftId: 'draft-1', code: 'confirmation-stale', stage: 'confirmation', retryable: false })
    expect(h.calls).toEqual([])
  })

  it('keeps the pre-025 behavior while the store is unwired, and says so on the prepare route', async () => {
    const h = harness({ wired: false })
    expect(await (await h.prepare()).json()).toEqual({ state: 'refused', draftId: 'draft-1', code: 'confirmation-unavailable' })
    const converted = await h.convert({ draftId: 'draft-1' })
    expect(await converted.json()).toEqual({ state: 'converted', draftId: 'draft-1', matterRef: 'receipt:42' })
    expect(h.calls).toEqual(['begin', 'custody', 'commit:receipt:42'])
  })

  it('prepares nothing for a draft the convert gate would refuse', async () => {
    const providers = createUnavailableFirstService(null, {
      actionConfirmations: {
        store: createActionConfirmationStore({ now: () => 't', nextId: () => 'cf-1' }),
        facts: () => ({ environmentRef: null }),
      },
      draftPrepareConversion: () => ({ state: 'incomplete' }),
    })
    const response = await handleSageServiceRequest(
      new Request('dsh-app://app/.sage/draft/prepare-confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ draftId: 'draft-1' }) }),
      { callerBinding: { correlation: 'c-025' }, providers } as never,
    )
    expect(await response.json()).toEqual({ state: 'refused', draftId: 'draft-1', code: 'draft-incomplete' })
  })
})
