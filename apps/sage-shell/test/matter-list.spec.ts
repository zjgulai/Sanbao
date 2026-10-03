import { describe, expect, it } from 'vitest'

import { createMatterList, type MatterListDeps, type MatterListDraftFact } from '../src/main/matter-list.js'

/**
 * Ticket 022 (FW-015, US-090~096): the action-need derivation.
 *
 * What these tests bind: every 待我处理 item names its triggering fact; the acceptance partition is
 * a count with no acceptance semantics; a fact change moves the item on the next read (no cached
 * partition); and an unreadable record gate is `unavailable` — never fixture rows.
 */

const fact = (over: Partial<MatterListDraftFact> = {}): MatterListDraftFact => ({
  draftId: 'draft-1',
  matterRef: 'receipt:1',
  title: '稳定订单增长',
  attempt: null,
  updatedAt: '2026-10-02T10:00:00.000Z',
  ...over,
})

function list(deps: Partial<MatterListDeps> = {}) {
  return createMatterList({
    listDraftFacts: () => ({ state: 'ready', facts: [fact()] }),
    pendingCount: () => 0,
    acceptanceCandidateCount: () => 0,
    ...deps,
  })
}

describe('the action-need derivation (US-090/092/093)', () => {
  it('partitions from the facts and names the trigger of every 待我处理 item', () => {
    const instance = list({
      listDraftFacts: () => ({
        state: 'ready',
        facts: [
          fact({ draftId: 'd-1', matterRef: 'receipt:1', title: '待继续两项', updatedAt: '2026-10-02T12:00:00.000Z' }),
          fact({ draftId: 'd-2', matterRef: null, title: '结果未知的创建', attempt: { correlation: 'c-unknown', state: 'unknown' }, updatedAt: '2026-10-02T11:00:00.000Z' }),
          fact({ draftId: 'd-3', matterRef: null, title: '确认失败的创建', attempt: { correlation: 'c-failed', state: 'failed' }, updatedAt: '2026-10-02T09:00:00.000Z' }),
          fact({ draftId: 'd-4', matterRef: 'receipt:4', title: '有候选交付', updatedAt: '2026-10-02T08:00:00.000Z' }),
          fact({ draftId: 'd-5', matterRef: 'receipt:5', title: '普通进行中', updatedAt: '2026-10-02T07:00:00.000Z' }),
          fact({ draftId: 'd-6', matterRef: 'receipt:6', title: '又待办又有候选', updatedAt: '2026-10-02T06:00:00.000Z' }),
        ],
      }),
      pendingCount: (matterRef) => (matterRef === 'receipt:1' ? 2 : matterRef === 'receipt:6' ? 1 : 0),
      acceptanceCandidateCount: (matterRef) => (matterRef === 'receipt:4' ? 2 : matterRef === 'receipt:6' ? 3 : 0),
    })
    const state = instance.derive()
    expect(state.state).toBe('read')
    expect(state.counts).toEqual({ action: 4, inProgress: 1, acceptance: 1 })
    const byId = new Map(state.items.map((item) => [item.itemId, item]))
    // Each action item carries the fact that put it there — a pending action outranks acceptance.
    expect(byId.get('receipt:1')).toMatchObject({ partition: 'action', triggers: [{ kind: 'pending-inputs', ref: 'receipt:1', count: 2 }] })
    expect(byId.get('draft:d-2')).toMatchObject({ partition: 'action', triggers: [{ kind: 'attempt-unknown', ref: 'c-unknown' }] })
    expect(byId.get('draft:d-3')).toMatchObject({ partition: 'action', triggers: [{ kind: 'attempt-failed', ref: 'c-failed' }] })
    expect(byId.get('receipt:6')).toMatchObject({ partition: 'action', acceptanceCandidateCount: 3 })
    // Acceptance is a count over candidates — no triggers, no acceptance semantics.
    expect(byId.get('receipt:4')).toMatchObject({ partition: 'acceptance', triggers: [], acceptanceCandidateCount: 2 })
    expect(byId.get('receipt:5')).toMatchObject({ partition: 'in-progress', triggers: [], acceptanceCandidateCount: 0 })
    // Recent first inside a partition.
    expect(state.items.filter((item) => item.partition === 'action').map((item) => item.itemId))
      .toEqual(['receipt:1', 'draft:d-2', 'draft:d-3', 'receipt:6'])
  })

  it('re-derives on every read: a fact change moves the item, nothing is cached', () => {
    let attempt: MatterListDraftFact['attempt'] = { correlation: 'c-1', state: 'unknown' }
    const instance = list({
      listDraftFacts: () => ({ state: 'ready', facts: [fact({ matterRef: null, attempt })] }),
    })
    expect(instance.derive().counts).toEqual({ action: 1, inProgress: 0, acceptance: 0 })
    attempt = null
    expect(instance.derive().counts).toEqual({ action: 0, inProgress: 1, acceptance: 0 })
  })

  it('one item per matter: the newest record titles it, an open attempt anywhere still triggers', () => {
    const instance = list({
      listDraftFacts: () => ({
        state: 'ready',
        facts: [
          fact({ draftId: 'old', matterRef: 'receipt:1', title: '旧标题', updatedAt: '2026-10-02T08:00:00.000Z', attempt: { correlation: 'c-old', state: 'failed' } }),
          fact({ draftId: 'new', matterRef: 'receipt:1', title: '新标题', updatedAt: '2026-10-02T12:00:00.000Z' }),
        ],
      }),
    })
    const state = instance.derive()
    expect(state.items).toHaveLength(1)
    expect(state.items[0]).toMatchObject({ itemId: 'receipt:1', title: '新标题' })
    expect(state.items[0]!.triggers).toEqual([{ kind: 'attempt-failed', ref: 'c-old' }])
  })

  it('keeps the list unavailable-first when the record gate cannot answer (US-096)', () => {
    const instance = list({ listDraftFacts: () => ({ state: 'unavailable', code: 'matter-list-locked' }) })
    expect(instance.derive()).toEqual({
      state: 'unavailable',
      code: 'matter-list-locked',
      items: [],
      counts: { action: 0, inProgress: 0, acceptance: 0 },
    })
  })
})
