import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 029 on the shipped page (US-150~154).
 *
 * The D7 card carries the three-facts discipline in its own words; selection drives per-target
 * batch posts; the archived rows appear through the D0 filter with their own tag; and rename
 * displays what the service read back.
 */

const item = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'receipt:42', matterRef: 'receipt:42', title: '季度复盘', partition: 'in-progress',
  triggers: [], acceptanceCandidateCount: 0, lifecycle: 'active', updatedAt: 't1', ...overrides,
})

const list = (items: unknown[]) => ({ state: 'read', code: null, items, counts: { action: 0, inProgress: items.length, acceptance: 0 } })
const admin = (overrides: Record<string, unknown> = {}) => ({ state: 'read', entries: [], trail: [], rename: null, batch: null, ...overrides })

const payload = (items: unknown[], matterAdmin: unknown) => statePayload({
  matterList: list(items),
  matterAdmin,
})

const toggleOf = (row: FakeElement): FakeElement => row.querySelector('[data-matter-admin-toggle]')!
const selectRow = (harness: Awaited<ReturnType<typeof bootSagePage>>, index: number, on = true) => {
  const row = harness.node('matter-admin-rows').children[index]!
  const toggle = toggleOf(row)
  toggle.checked = on
  harness.node('matter-admin-rows').dispatch('click', { target: toggle })
}

describe('the matter-admin card (ticket 029)', () => {
  it('states the three-fact discipline and pins its static controls', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-matter-admin-card"'),
      // Ticket 049 added the sibling task-groups section right after this card; slice to its
      // start so the pin stays scoped to the admin card alone.
      document.indexOf('class="sage-matter-groups-section"'),
    )
    expect(card).toContain('归档≠停止执行（在跑的运行不受影响）、≠隐藏')
    expect(card).toContain('保留事实与回执')
    expect(card).toContain('真正删除是独立受控流程，这里没有入口')
    expect(card).toContain('回读的实际生效值')
    expect(card).toContain('逐项返回')
    expect(card).toContain('没有「整体成功」')
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual(['归档所选（逐项）', '恢复所选（逐项）', '重命名（服务裁决并回读）'])
  })

  it('renders one row per matter with its archive state, and posts a per-target archive batch', async () => {
    const harness = await bootSagePage(payload(
      [item(), item({ itemId: 'receipt:other', matterRef: 'receipt:other', title: '外部对齐' })],
      admin({ entries: [{ matterRef: 'receipt:other', archivedAt: 't', ground: 'completed' }] }),
    ))
    const rows = harness.node('matter-admin-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('活动')
    expect(rows[1]?.textContent).toContain('已归档（可恢复；≠停止执行）')

    harness.node('matter-admin-archive').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('matter-admin-note').textContent).toContain('先勾选')

    selectRow(harness, 0)
    selectRow(harness, 1)
    harness.node('matter-admin-ground').value = 'stopped'
    harness.node('matter-admin-archive').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{
      path: '/.sage/matter-admin',
      body: { action: 'batch', operation: 'archive', targets: ['receipt:42', 'receipt:other'], ground: 'stopped' },
    }])
  })

  it('posts a restore batch without a ground and renders row-by-row verdicts', async () => {
    const harness = await bootSagePage(payload([item()], admin()))
    selectRow(harness, 0)
    // 轮询会重渲行：重新勾选后再提交（页面自己的惯例）。
    harness.node('matter-admin-restore').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/matter-admin', body: { action: 'batch', operation: 'restore', targets: ['receipt:42'] } })

    harness.setPayload(payload([item()], admin({
      batch: {
        operation: 'restore',
        rows: [
          { matterRef: 'receipt:42', outcome: 'ok', code: null },
          { matterRef: 'receipt:ghost', outcome: 'refused', code: 'matter-unknown' },
        ],
        okCount: 1,
        refusedCount: 1,
      },
    })))
    await harness.refresh()
    const batchRows = harness.node('matter-admin-batch-rows').children
    expect(batchRows[0]?.textContent).toContain('共 2 项，成功 1、拒绝 1')
    expect(batchRows[0]?.textContent).toContain('无整体成功')
    expect(batchRows[1]?.textContent).toContain('该项成功')
    expect(batchRows[2]?.textContent).toContain('该项拒绝')
    expect(batchRows[2]?.textContent).toContain('查不到')
  })

  it('shows archived rows through the D0 filter with their own tag, and hides them by default', async () => {
    const harness = await bootSagePage(payload(
      [item(), item({ itemId: 'receipt:old', matterRef: 'receipt:old', title: '旧事项', lifecycle: 'archived' })],
      admin({ entries: [{ matterRef: 'receipt:old', archivedAt: 't', ground: 'stopped' }] }),
    ))
    expect(harness.node('matter-rows-progress').children).toHaveLength(1)

    harness.node('matter-list-all').checked = true
    harness.node('matter-list-all').dispatch('change')
    await harness.settle()
    const shown = harness.node('matter-rows-progress').children
    expect(shown).toHaveLength(2)
    expect(shown[1]?.textContent).toContain('已归档（可恢复；≠停止执行）')
  })

  it('renames exactly one selected matter and shows the service read-back, not the request', async () => {
    const harness = await bootSagePage(
      payload([item()], admin({ rename: { matterRef: 'receipt:42', requested: '季度复盘', effective: '季度复盘·财务口径', at: 't' } })),
      { '/.sage/matter-admin': { state: 'renamed', status: { rename: null } } },
    )
    expect(harness.node('matter-admin-rename-note').textContent).toContain('服务回读生效「季度复盘·财务口径」')
    expect(harness.node('matter-admin-rename-note').textContent).toContain('请求「季度复盘」')

    selectRow(harness, 0)
    harness.node('matter-admin-rename-title').value = '季度复盘（财务口径）'
    harness.node('matter-admin-rename').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({
      path: '/.sage/matter-admin',
      body: { action: 'rename', matterRef: 'receipt:42', title: '季度复盘（财务口径）' },
    })
  })

  it('words an unwired rename honestly and keeps the notice across the poll', async () => {
    const harness = await bootSagePage(
      payload([item()], admin()),
      { '/.sage/matter-admin': { state: 'refused', code: 'matter-rename-unavailable' } },
    )
    selectRow(harness, 0)
    harness.node('matter-admin-rename-title').value = 'x'
    harness.node('matter-admin-rename').dispatch('click')
    await harness.settle()
    expect(harness.node('matter-admin-rename-note').textContent).toContain('未接线')
    await harness.refresh()
    expect(harness.node('matter-admin-rename-note').textContent).toContain('未接线')
  })
})
