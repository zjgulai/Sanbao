import { describe, expect, it } from 'vitest'

import { createSearch, matchMatters, type MatterSearchFact } from '../src/main/search.js'

/**
 * Ticket 021 (US-085~089): one query, two sections — local matters and the base's session search.
 *
 * The acceptance lines that live here: search writes nothing (its bridge traffic is exactly the one
 * `session/search` read); a missing query engine is `unavailable` while local matching still
 * answers — never disguised as "no results"; the base's answer shape is validated, not trusted.
 */

const facts: MatterSearchFact[] = [
  { matterRef: 'receipt:1', goal: '稳定订单增长', deliverable: '渠道月报', responsibility: '运营', projectRef: 'q3' },
  { matterRef: 'receipt:2', goal: '新品冷启动', deliverable: '样品验证', responsibility: '产品', projectRef: 'q3-launch' },
  { matterRef: 'receipt:3', goal: '', deliverable: '', responsibility: '', projectRef: 'receipt:3' },
  // A second record for the same matter (e.g. a re-converted draft) must not double the card.
  { matterRef: 'receipt:1', goal: '稳定订单增长（副本）', deliverable: '', responsibility: '', projectRef: '' },
]

function searcher(bridge: (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>) {
  const calls: Array<{ readonly endpoint: string, readonly payload: readonly unknown[] }> = []
  const instance = createSearch({
    callBridge: async (endpoint, payload = []) => {
      calls.push({ endpoint, payload })
      return bridge(endpoint, payload)
    },
    listMatterFacts: () => facts,
  })
  return { instance, calls }
}

describe('matters match locally (US-085)', () => {
  it('matches title and key attributes case-insensitively, one hit per matter', () => {
    const hits = matchMatters(facts, 'Q3')
    expect(hits.map((hit) => [hit.matterRef, hit.matchedField])).toEqual([['receipt:1', 'projectRef'], ['receipt:2', 'projectRef']])
    // Deduped by matterRef: the duplicate record never adds a second row.
    expect(hits.filter((hit) => hit.matterRef === 'receipt:1')).toHaveLength(1)
    const byTitle = matchMatters(facts, '订单')
    expect(byTitle).toEqual([{ matterRef: 'receipt:1', title: '稳定订单增长', matchedField: 'goal' }])
    // An empty goal falls back to the matter reference as the display title.
    expect(matchMatters(facts, 'receipt:3')).toEqual([{ matterRef: 'receipt:3', title: 'receipt:3', matchedField: 'projectRef' }])
    expect(matchMatters(facts, '不存在')).toEqual([])
  })
})

describe('the query is read-only and layered (US-086/087/088)', () => {
  it('calls exactly the one session/search read and returns both sections', async () => {
    const { instance, calls } = searcher(async (endpoint) => {
      expect(endpoint).toBe('session/search')
      return { ok: true, result: { items: [{ sessionId: 's-1', snippet: '…订单…' }], hasMore: true } }
    })
    const outcome = await instance.search('  订单 ')
    expect(outcome).toEqual({
      state: 'read',
      query: '订单',
      matters: [{ matterRef: 'receipt:1', title: '稳定订单增长', matchedField: 'goal' }],
      sessions: { state: 'available', items: [{ sessionId: 's-1', snippet: '…订单…' }], hasMore: true },
    })
    // US-088: the only traffic is that read — no create, prompt, follow, page, stat, read.
    expect(calls).toEqual([{ endpoint: 'session/search', payload: [{ query: '订单' }] }])
  })

  it('keeps the missing engine its own state while local matching still answers (US-087)', async () => {
    const { instance } = searcher(async () => ({ ok: false, code: 'bridge-search-unavailable' }))
    const outcome = await instance.search('订单')
    expect(outcome).toMatchObject({ state: 'read', sessions: { state: 'unavailable', code: 'bridge-search-unavailable' } })
    if (outcome.state !== 'read') throw new Error('refused')
    expect(outcome.matters).toHaveLength(1)
  })

  it('separates an empty result from the unavailable engine', async () => {
    const { instance } = searcher(async () => ({ ok: true, result: { items: [], hasMore: false } }))
    const outcome = await instance.search('订单')
    expect(outcome).toMatchObject({ sessions: { state: 'available', items: [], hasMore: false } })
  })

  it('refuses an invalid query before any bridge call, and reports other failures as failures', async () => {
    const { instance, calls } = searcher(async () => ({ ok: false, code: 'bridge-provider-failed' }))
    await expect(instance.search('   ')).resolves.toEqual({ state: 'refused', code: 'search-query-invalid' })
    await expect(instance.search('x'.repeat(501))).resolves.toEqual({ state: 'refused', code: 'search-query-invalid' })
    await expect(instance.search('a\u0000b')).resolves.toEqual({ state: 'refused', code: 'search-query-invalid' })
    expect(calls).toEqual([])
    await expect(instance.search('订单')).resolves.toMatchObject({ sessions: { state: 'failed', code: 'bridge-provider-failed' } })
  })

  it('validates the base answer shape instead of trusting it', async () => {
    const bad = searcher(async () => ({ ok: true, result: { items: [{ sessionId: 's-1' }], hasMore: false } }))
    await expect(bad.instance.search('订单')).resolves.toMatchObject({ sessions: { state: 'failed', code: 'bridge-answer-unrecognised' } })
    const notPage = searcher(async () => ({ ok: true, result: { items: [] } }))
    await expect(notPage.instance.search('订单')).resolves.toMatchObject({ sessions: { state: 'failed', code: 'bridge-answer-unrecognised' } })
  })

  it('reports a bridge that cannot answer at all as a failure with its code', async () => {
    const { instance } = searcher(async () => { throw Object.assign(new Error('not ready'), { code: 'bridge-host-not-ready' }) })
    await expect(instance.search('订单')).resolves.toMatchObject({ sessions: { state: 'failed', code: 'bridge-host-not-ready' } })
  })
})
