import { describe, expect, it } from 'vitest'

import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Ticket 022: the matter list card. The view groups by main's `partition` field and decides nothing
 * itself; every 待我处理 row shows its trigger; 待验收 is a count line only; archived rows stay out of
 * the default view; without a derivable list the card says 未核验 and renders no fixture rows.
 */

const item = (over: Record<string, unknown> = {}) => ({
  itemId: 'receipt:1',
  matterRef: 'receipt:1',
  title: '稳定订单增长',
  partition: 'action',
  triggers: [{ kind: 'pending-inputs', ref: 'receipt:1', count: 2 }],
  acceptanceCandidateCount: 0,
  lifecycle: 'active',
  updatedAt: '2026-10-02T12:00:00.000Z',
  ...over,
})

const matterList = (over: Record<string, unknown> = {}) => ({
  state: 'read',
  code: null,
  items: [item()],
  counts: { action: 1, inProgress: 0, acceptance: 0 },
  ...over,
})

describe('the matter list card (022)', () => {
  it('shows each action row with its trigger, groups only by main\'s partition field', async () => {
    const harness = await bootSagePage(statePayload({
      matterList: matterList({
        items: [
          item({ itemId: 'receipt:1', triggers: [{ kind: 'pending-inputs', ref: 'receipt:1', count: 2 }] }),
          item({
            itemId: 'draft:d-2', matterRef: null, title: '结果未知的创建', partition: 'action',
            triggers: [{ kind: 'attempt-unknown', ref: 'c-unknown' }], updatedAt: '2026-10-02T11:00:00.000Z',
          }),
          item({ itemId: 'receipt:5', title: '普通进行中', partition: 'in-progress', triggers: [], updatedAt: '2026-10-02T07:00:00.000Z' }),
          item({ itemId: 'receipt:4', title: '有候选交付', partition: 'acceptance', triggers: [], acceptanceCandidateCount: 2, updatedAt: '2026-10-02T06:00:00.000Z' }),
          // A partition the view does not know: no row anywhere, no count inflation.
          item({ itemId: 'receipt:9', title: '未知分区', partition: 'mystery', triggers: [] }),
        ],
        counts: { action: 2, inProgress: 1, acceptance: 1 },
      }),
    }))
    const actionRows = harness.node('matter-rows-action').children
    expect(actionRows).toHaveLength(2)
    expect(actionRows[0]!.dataset.matterItem).toBe('receipt:1')
    expect(actionRows[0]!.textContent).toContain('触发：待继续输入 2 条（点「继续」才派发）')
    expect(actionRows[1]!.textContent).toContain('触发：建项结果未知（核对同一请求）— c-unknown')
    expect(harness.node('matter-rows-progress').children).toHaveLength(1)
    expect(harness.node('matter-rows-progress').children[0]!.textContent).toContain('最近更新 2026-10-02T07:00:00.000Z')
    // 待验收 is a count, never a row list (US-094).
    expect(harness.node('matter-count-acceptance').textContent).toBe('1')
    expect(harness.node('matter-acceptance-note').textContent).toContain('待验收只显示计数：1 项有观察到的产物候选；分项验收与整体完成语义未收口，本版不定义。')
    expect(harness.node('matter-rows-action').textContent).not.toContain('有候选交付')
    // No row for the unknown partition, and the counts are main's numbers.
    expect(harness.node('matter-count-action').textContent).toBe('2')
    expect(harness.node('matter-count-progress').textContent).toBe('1')
    expect(harness.node('matter-list-note').textContent).toContain('默认不展开归档/完成；分区由 main 每次读取重新推导。')
  })

  it('keeps archived rows out of the default view and reveals them only through the filter (US-095)', async () => {
    const archived = item({ itemId: 'receipt:old', title: '已归档的事项', lifecycle: 'archived', triggers: [] })
    const harness = await bootSagePage(statePayload({
      matterList: matterList({ items: [item(), archived], counts: { action: 1, inProgress: 0, acceptance: 0 } }),
    }))
    expect(harness.node('matter-rows-action').children.map((row) => row.dataset.matterItem)).toEqual(['receipt:1'])
    harness.node('matter-list-all').checked = true
    harness.node('matter-list-all').dispatch('change')
    await harness.settle()
    expect(harness.node('matter-rows-action').children.map((row) => row.dataset.matterItem)).toEqual(['receipt:1', 'receipt:old'])
    expect(harness.node('matter-list-note').textContent).toContain('显示全部（含归档/完成——本版还没有这类事实来源，与默认一致）。')
  })

  it('says 未核验 without rows when the list cannot be derived — a fixture matter is no stand-in (US-096)', async () => {
    const harness = await bootSagePage(statePayload({
      matter: { id: 'matter-sage-shopify-abi-fixture', revisionId: 'revision-sage-shopify-abi-fixture-1', goal: '在现金约束下稳定订单增长', stage: 'awaiting-clarification', actionability: 'blocked', denialReason: 'fixture-only' },
      matterList: matterList({ state: 'unavailable', code: 'matter-list-locked', items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } }),
    }))
    expect(harness.node('matter-list-note').textContent).toContain('列表未核验：matter-list-locked（不显示仿造行——fixture 不当列表数据）。')
    expect(harness.node('matter-rows-action').children).toHaveLength(0)
    expect(harness.node('matter-rows-progress').children).toHaveLength(0)
    expect(harness.node('matter-count-action').textContent).toBe('—')
    expect(harness.node('matter-count-acceptance').textContent).toBe('—')
  })

  it('says 还没有任何事项记录 for a readable but empty list', async () => {
    const harness = await bootSagePage(statePayload({
      matterList: matterList({ items: [], counts: { action: 0, inProgress: 0, acceptance: 0 } }),
    }))
    expect(harness.node('matter-list-note').textContent).toContain('还没有任何事项记录（草案建项或出现待处理事实后才会出现在这里）。')
    expect(harness.node('matter-count-action').textContent).toBe('0')
  })
})
