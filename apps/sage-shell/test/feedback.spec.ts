import { describe, expect, it, vi } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createFeedback, type FeedbackPayload } from '../src/main/feedback.js'

/**
 * Ticket 048 (US-223/224) at the module and route seams.
 *
 * The acceptance lines: the payload handed to the sink is EXACTLY the user's text plus the
 * structured diagnostics (code/stage/correlation) — the store reads no log, no stack, no machine
 * path, no credential, and its key set is asserted so nothing can ride along; the receipt
 * distinguishes 已接收 from 结果未知; an unknown is verify-only and can never resubmit; and the
 * unwired production answers a named 缺项 instead of pretending a submission.
 */

function harness(sink?: (payload: FeedbackPayload) => unknown) {
  let counter = 0
  const captured: FeedbackPayload[] = []
  const calls: unknown[] = []
  const wrapped = sink === undefined ? undefined : (payload: FeedbackPayload): unknown => {
    captured.push(payload)
    calls.push(payload)
    return sink(payload)
  }
  const store = createFeedback({
    ...(wrapped === undefined ? {} : { sink: wrapped }),
    now: () => '2026-10-03T12:00:00.000Z',
    nextId: () => `fb-${String(++counter)}`,
  })
  return { store, captured, calls }
}

describe('the feedback store (ticket 048)', () => {
  it('hands over exactly {requestId, at, text, diagnostics{code,stage,correlation}} — nothing else exists to attach', async () => {
    const h = harness(() => ({ ok: true }))
    const receipt = await h.store.submit({ text: '保存按钮点了没反应', code: 'E-102', stage: 'draft-save', correlation: 'corr-1' })
    expect(receipt).toEqual({ state: 'accepted', requestId: 'fb-1', at: '2026-10-03T12:00:00.000Z', code: null })
    expect(h.captured).toHaveLength(1)
    const payload = h.captured[0]!
    // The payload's key set is closed: no log, no stack, no path, no credential, no ui field.
    expect(Object.keys(payload).sort()).toEqual(['at', 'diagnostics', 'requestId', 'text'])
    expect(Object.keys(payload.diagnostics).sort()).toEqual(['code', 'correlation', 'stage'])
    expect(payload).toEqual({
      requestId: 'fb-1',
      at: '2026-10-03T12:00:00.000Z',
      text: '保存按钮点了没反应',
      diagnostics: { code: 'E-102', stage: 'draft-save', correlation: 'corr-1' },
    })
  })

  it('a failed/unreadable hand-over is 结果未知 — verify reads the recorded receipt and NEVER resubmits', async () => {
    let count = 0
    const h = harness(() => {
      count += 1
      throw Object.assign(new Error('boom'), { code: 'feedback-transport-failed' })
    })
    const receipt = await h.store.submit({ text: '一次未知提交' })
    expect(receipt).toMatchObject({ state: 'unknown', requestId: 'fb-1', code: 'feedback-transport-failed' })
    expect(count).toBe(1)
    // Verify returns the SAME receipt; the sink is not reached again — no duplicate submission.
    expect(await h.store.verify({ requestId: 'fb-1' })).toEqual(receipt)
    expect(count).toBe(1)
    expect(h.store.status().receipts).toEqual([receipt])
    // An unreadable ack is unknown too — never claimed 已接收.
    const h2 = harness(() => ({ weird: true }))
    expect(await h2.store.submit({ text: 'x' })).toMatchObject({ state: 'unknown', code: 'feedback-ack-unreadable' })
  })

  it('a named sink refusal is refused and never recorded; the unwired production is a named 缺项', async () => {
    const refused = harness(() => ({ ok: false, code: 'feedback-rejected' }))
    expect(await refused.store.submit({ text: 'x' })).toEqual({ state: 'refused', requestId: null, at: null, code: 'feedback-rejected' })
    expect(refused.store.status().receipts).toEqual([])

    const bare = harness()
    expect(await bare.store.submit({ text: 'x' })).toEqual({ state: 'unavailable', requestId: null, at: null, code: 'feedback-sink-unavailable' })
    expect(await bare.store.verify({ requestId: 'fb-1' })).toMatchObject({ state: 'not-found', code: 'feedback-receipt-not-found' })
  })

  it('bounds the text and the diagnostics fields before anything is dispatched', async () => {
    const sink = vi.fn(() => ({ ok: true }))
    const h = harness(sink)
    expect(await h.store.submit({ text: '' })).toMatchObject({ state: 'refused', code: 'feedback-text-invalid' })
    expect(await h.store.submit({ text: 'x'.repeat(4001) })).toMatchObject({ state: 'refused', code: 'feedback-text-invalid' })
    expect(await h.store.submit({ text: 'ok', code: ' has space ' })).toMatchObject({ state: 'refused', code: 'feedback-diagnostics-invalid' })
    expect(await h.store.submit({ text: 'ok', stage: 'x'.repeat(129) })).toMatchObject({ state: 'refused', code: 'feedback-diagnostics-invalid' })
    expect(sink).not.toHaveBeenCalled()
  })
})

describe('the feedback route (ticket 048)', () => {
  it('parses exactly, forwards, and keeps an unwired provider honest', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      feedbackSubmit: async (request) => {
        seen.push({ submit: request })
        return { state: 'accepted', requestId: 'fb-1', at: 't', code: null }
      },
      feedbackVerify: async (request) => {
        seen.push({ verify: request })
        return { state: 'unknown', requestId: request.requestId, at: 't', code: 'x' }
      },
    })
    const post = (body: unknown, service = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-048' }, providers: service } as never,
    )
    expect(await (await post({ action: 'submit', text: '没反应' })).json()).toMatchObject({ state: 'accepted', requestId: 'fb-1' })
    expect(await (await post({ action: 'submit', text: '没反应', code: 'E1', stage: 's', correlation: 'c' })).json()).toMatchObject({ state: 'accepted' })
    expect(await (await post({ action: 'verify', requestId: 'fb-1' })).json()).toMatchObject({ state: 'unknown' })
    expect(seen).toEqual([
      { submit: { action: 'submit', text: '没反应' } },
      { submit: { action: 'submit', text: '没反应', code: 'E1', stage: 's', correlation: 'c' } },
      { verify: { action: 'verify', requestId: 'fb-1' } },
    ])

    // Exactly the declared members; nothing else may ride along.
    expect((await post({ action: 'submit', text: 'x', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'submit', text: 'x'.repeat(4001) })).status).toBe(400)
    expect((await post({ action: 'submit', text: '' })).status).toBe(400)
    expect((await post({ action: 'verify' })).status).toBe(400)
    expect((await post({ action: 'verify', requestId: 'x', text: 'y' })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post({ action: 'submit', text: 'x' }, unwired)).json()).toMatchObject({ code: 'feedback-sink-unavailable' })
    expect(await (await post({ action: 'verify', requestId: 'fb-1' }, unwired)).json()).toMatchObject({ code: 'feedback-sink-unavailable' })
  })
})
