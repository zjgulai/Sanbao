import { describe, expect, it } from 'vitest'

import { createActionItems } from '../src/main/action-items.js'
import type { ActionItemSendOutcome } from '../src/main/action-items.js'

/**
 * Ticket 028, the action items and their corrections (US-146~149).
 *
 * The acceptance lives here as data assertions: a record freezes the basis it was registered
 * against; 完成 is a state change that sends nothing and touches nothing; a correction is exactly
 * one send of the NEW text (the original is never re-sent), and its receipt only upgrades on the
 * queue's own readings.
 */

function harness(overrides: {
  readonly outcomes?: ActionItemSendOutcome[]
  readonly pending?: Map<string, 'pending' | 'submitted' | 'consumed'>
} = {}) {
  const sends: Array<{ matterRef: string, workspaceRoot: string, text: string }> = []
  const outcomes = [...(overrides.outcomes ?? [])]
  let tick = 0
  const store = createActionItems({
    now: () => `2026-10-03T09:00:0${tick}.000Z`,
    nextId: () => `id-${tick += 1}`,
    send: async (request) => {
      sends.push(request)
      return outcomes.shift() ?? { state: 'accepted', requestId: 'rq-default' }
    },
    pendingStateOf: (matterRef, itemId) => overrides.pending?.get(`${matterRef}:${itemId}`) ?? (undefined as never),
  })
  return { store, sends, pending: overrides.pending ?? new Map() }
}

const createOne = (store: ReturnType<typeof createActionItems>) => {
  const outcome = store.createItem({ matterRef: 'matter:1', title: '补齐季度数据', note: '先对账再做图' })
  if (outcome.state !== 'ok') throw new Error('expected item')
  return outcome.item
}

describe('action items are work under a matter — nothing else (US-146/147)', () => {
  it('starts open; 登记一次执行 freezes the basis, and later edits never rewrite old records', () => {
    const h = harness()
    const item = createOne(h.store)
    expect(item).toMatchObject({ state: 'open', revision: 1, records: [] })
    // The view is a pinned shape: no delivery/receipt/tool/run vocabulary anywhere.
    expect(Object.keys(item).sort()).toEqual([
      'actionId', 'createdAt', 'matterRef', 'note', 'records', 'revision', 'state', 'title', 'updatedAt',
    ])
    const text = JSON.stringify(item)
    for (const banned of ['receipt', 'delivery', 'toolCall', 'toolInvocation', 'sessionRun', 'attempt']) {
      expect(text, banned).not.toContain(banned)
    }

    const started = h.store.start({ actionId: item.actionId })
    if (started.state !== 'ok') throw new Error('expected start')
    expect(started.item.state).toBe('in-progress')
    expect(started.item.records).toEqual([
      { recordNo: 1, at: '2026-10-03T09:00:01.000Z', basis: { revision: 1, title: '补齐季度数据', note: '先对账再做图' } },
    ])

    const edited = h.store.updateItem({ actionId: item.actionId, note: '对账口径改为财务版' })
    if (edited.state !== 'ok') throw new Error('expected update')
    expect(edited.item.revision).toBe(2)

    const second = h.store.start({ actionId: item.actionId })
    if (second.state !== 'ok') throw new Error('expected second start')
    expect(second.item.records).toHaveLength(2)
    expect(second.item.records[0]?.basis.revision).toBe(1)
    expect(second.item.records[1]?.basis).toEqual({ revision: 2, title: '补齐季度数据', note: '对账口径改为财务版' })
    // No step of the item's own lifecycle ever sent anything.
    expect(h.sends).toEqual([])
  })

  it('完成 is a state change only: no record is appended, nothing is sent', () => {
    const h = harness()
    const item = createOne(h.store)
    const done = h.store.complete({ actionId: item.actionId })
    if (done.state !== 'ok') throw new Error('expected complete')
    expect(done.item.state).toBe('done')
    expect(done.item.records).toEqual([])
    expect(h.sends).toEqual([])
    // A finished item has no reopen path in v1, and a record must not pretend otherwise.
    expect(h.store.start({ actionId: item.actionId })).toEqual({ state: 'refused', code: 'action-done' })
  })

  it('refuses malformed or unknown operations with their own codes', () => {
    const h = harness()
    expect(h.store.createItem({ matterRef: 'matter:1', title: '   ' })).toEqual({ state: 'refused', code: 'item-title-invalid' })
    expect(h.store.createItem({ matterRef: 'matter:1', title: 'ok', note: 'x'.repeat(2001) })).toEqual({ state: 'refused', code: 'item-note-too-large' })
    expect(h.store.updateItem({ actionId: 'nope', title: 'x' })).toEqual({ state: 'refused', code: 'action-not-found' })
    expect(h.store.updateItem({ actionId: createOne(h.store).actionId })).toEqual({ state: 'refused', code: 'item-update-empty' })
    expect(h.store.start({ actionId: 'nope' })).toEqual({ state: 'refused', code: 'action-not-found' })
    expect(h.store.complete({ actionId: 'nope' })).toEqual({ state: 'refused', code: 'action-not-found' })
  })
})

describe('corrections link, never overwrite and never replay (US-148, D-057)', () => {
  it('sends exactly one new linked message; the original is neither re-sent nor rewritten', async () => {
    const h = harness({ outcomes: [{ state: 'accepted', requestId: 'rq-9' }] })
    const outcome = await h.store.submitCorrection({
      matterRef: 'matter:1',
      workspaceRoot: '/Users/someone/project',
      originalText: '原要求：先出季度对账单',
      originalAt: '2026-10-03T08:00:00.000Z',
      text: '更正副本：先出季度对账单（对账口径按财务版）',
    })
    expect(outcome.state).toBe('created')
    if (outcome.state !== 'created') return
    expect(h.sends).toEqual([{
      matterRef: 'matter:1',
      workspaceRoot: '/Users/someone/project',
      text: '更正副本：先出季度对账单（对账口径按财务版）',
    }])
    expect(outcome.correction.original).toEqual({ text: '原要求：先出季度对账单', at: '2026-10-03T08:00:00.000Z' })
    expect(outcome.correction.receipt).toEqual({ state: 'received', requestId: 'rq-9' })
    // 受理≠生效 stays literal: even when the queue later reports a consumption for some item,
    // a `received` correction has no item to look up and keeps its received receipt.
    expect(h.store.list().corrections[0]?.receipt).toEqual({ state: 'received', requestId: 'rq-9' })
  })

  it("upgrades the receipt only on the queue's own readings — queued is 待应用, consumed is 已生效", async () => {
    const pending = new Map<string, 'pending' | 'submitted' | 'consumed'>()
    const h = harness({ outcomes: [{ state: 'deferred', itemId: 'p-1' }], pending })
    const outcome = await h.store.submitCorrection({
      matterRef: 'matter:1', workspaceRoot: '/w', originalText: '原要求', text: '更正',
    })
    if (outcome.state !== 'created') throw new Error('expected correction')
    pending.set('matter:1:p-1', 'pending')
    expect(h.store.list().corrections[0]?.receipt).toEqual({ state: 'pending-application', reason: 'deferred' })
    pending.set('matter:1:p-1', 'submitted')
    expect(h.store.list().corrections[0]?.receipt).toEqual({ state: 'pending-application', reason: 'queued' })
    pending.set('matter:1:p-1', 'consumed')
    expect(h.store.list().corrections[0]?.receipt).toEqual({ state: 'effective' })
    // No reading at all never manufactures an upgrade either.
    pending.delete('matter:1:p-1')
    expect(h.store.list().corrections[0]?.receipt).toEqual({ state: 'pending-application', reason: 'unobserved' })
  })

  it('records a refused send as refused and never retries it', async () => {
    const h = harness({ outcomes: [{ state: 'refused', code: 'session-send-unavailable' }] })
    const outcome = await h.store.submitCorrection({
      matterRef: 'matter:1', workspaceRoot: '/w', originalText: '原要求', text: '更正',
    })
    if (outcome.state !== 'created') throw new Error('expected correction')
    expect(outcome.correction.receipt).toEqual({ state: 'refused', code: 'session-send-unavailable' })
    expect(h.sends).toHaveLength(1)
    // A second correction is its own one-send submission; the first is never replayed.
    await h.store.submitCorrection({ matterRef: 'matter:1', workspaceRoot: '/w', originalText: '原要求', text: '再更正' })
    expect(h.sends.map((call) => call.text)).toEqual(['更正', '再更正'])
  })

  it('refuses empty or oversized correction bodies before any send', async () => {
    const h = harness()
    expect(await h.store.submitCorrection({ matterRef: 'matter:1', workspaceRoot: '/w', originalText: '  ', text: 'x' }))
      .toEqual({ state: 'refused', code: 'correction-original-invalid' })
    expect(await h.store.submitCorrection({ matterRef: 'matter:1', workspaceRoot: '/w', originalText: 'x', text: '  ' }))
      .toEqual({ state: 'refused', code: 'correction-text-invalid' })
    expect(await h.store.submitCorrection({ matterRef: 'matter:1', workspaceRoot: '/w', originalText: 'x', text: 'x'.repeat(16_385) }))
      .toEqual({ state: 'refused', code: 'correction-text-invalid' })
    expect(h.sends).toEqual([])
  })
})
