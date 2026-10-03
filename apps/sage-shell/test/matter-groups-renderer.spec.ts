import { describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload, type FakeElement } from './support/sage-page.js'

/**
 * Ticket 049 on the shipped page (US-225/226).
 *
 * The D12 card carries the organization-only discipline in its own words; the four named commands
 * each post their own exact body; membership batches render row by row (with an explicit
 * no-overall-success line); rename displays the read-back value, never the request; and an unwired
 * store is worded as a named 缺项 instead of a fabricated group.
 */

const item = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'm-1', matterRef: 'm-1', title: '季度复盘', partition: 'in-progress',
  triggers: [], acceptanceCandidateCount: 0, lifecycle: 'active', updatedAt: 't1', ...overrides,
})

const list = (items: unknown[]) => ({ state: 'read', code: null, items, counts: { action: 0, inProgress: items.length, acceptance: 0 } })
const groups = (overrides: Record<string, unknown> = {}) => ({
  state: 'read', code: null, groups: [], trail: [], rename: null, batch: null, ...overrides,
})
const group = (overrides: Record<string, unknown> = {}) => ({
  groupId: 'grp-1', name: '交付跟进', memberIds: ['m-1'], createdAt: 't', updatedAt: 't', ...overrides,
})

const payload = (items: unknown[], matterGroups: unknown) => statePayload({
  matterList: list(items),
  matterGroups,
})

const itemToggle = (row: FakeElement): FakeElement => row.querySelector('[data-matter-group-toggle]')!
const selectItem = (harness: Awaited<ReturnType<typeof bootSagePage>>, index: number, on = true) => {
  const row = harness.node('matter-groups-rows').children[index]!
  const toggle = itemToggle(row)
  toggle.checked = on
  harness.node('matter-groups-rows').dispatch('click', { target: toggle })
}
const pickGroup = (harness: Awaited<ReturnType<typeof bootSagePage>>, index: number, on = true) => {
  const row = harness.node('matter-groups-list').children[index]!
  const pick = row.querySelector('[data-matter-group-pick]')!
  pick.checked = on
  harness.node('matter-groups-list').dispatch('click', { target: pick })
}

describe('the task-groups card (ticket 049)', () => {
  it('states the organization-only discipline and pins its static controls', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-matter-groups-card"'),
      document.indexOf('class="sage-run-monitor-section"'),
    )
    expect(card).toContain('建立、改名、移除都是具名命令，各有回执与回读')
    expect(card).toContain('不隐式产生')
    expect(card).toContain('只改变列表组织方式')
    expect(card).toContain('不改变事项事实、可见范围、责任或权限')
    expect(card).toContain('移除分组≠删除事项')
    expect(card).toContain('逐项返回')
    expect(card).toContain('没有「整体成功」')
    expect(card).toContain('不做共享与协作语义、不做按分组批量授权、不跨设备同步')
    const labels = (card.match(/<button[^>]*>([^<]*)</gu) ?? []).map((tag) => tag.replace(/<button[^>]*>|</g, ''))
    expect(labels).toEqual([
      '建立分组（所选事项入组，逐个回执）',
      '改名（回读生效值）',
      '移除分组（只移除组织，≠删除事项）',
      '加入所选事项（逐项）',
      '移出所选事项（逐项）',
    ])
  })

  it('renders one row per matter with its group tags and one row per group with the read-back count', async () => {
    const harness = await bootSagePage(payload(
      [item(), item({ itemId: 'm-2', matterRef: 'm-2', title: '外部对齐' })],
      groups({ groups: [group()] }),
    ))
    const rows = harness.node('matter-groups-rows').children
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('分组：交付跟进')
    expect(rows[1]?.textContent).toContain('未分组')
    const groupRows = harness.node('matter-groups-list').children
    expect(groupRows).toHaveLength(1)
    expect(groupRows[0]?.textContent).toContain('交付跟进')
    expect(groupRows[0]?.textContent).toContain('1 项（回读）')
  })

  it('creates only with a name; a named create carries the selected items as per-item targets', async () => {
    const harness = await bootSagePage(payload([item()], groups()))
    harness.node('matter-groups-create').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('matter-groups-readback').textContent).toContain('不会隐式产生')

    selectItem(harness, 0)
    harness.node('matter-groups-name').value = '交付跟进'
    harness.node('matter-groups-create').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([{
      path: '/.sage/matter-groups',
      body: { action: 'create', name: '交付跟进', targets: ['m-1'] },
    }])
  })

  it('renames and removes only the picked group, and shows the read-back value rather than the request', async () => {
    const harness = await bootSagePage(
      payload([item()], groups({
        groups: [group()],
        rename: { groupId: 'grp-1', requested: '交付跟进v2', effective: '交付跟进·财务口径', at: 't' },
      })),
      { '/.sage/matter-groups': { state: 'renamed', status: groups() } },
    )
    // 改名回读：请求值只作对照，生效值来自服务。
    expect(harness.node('matter-groups-readback').textContent).toContain('请求「交付跟进v2」')
    expect(harness.node('matter-groups-readback').textContent).toContain('回读生效「交付跟进·财务口径」')

    // 没有选分组：拒绝且零派发。
    harness.node('matter-groups-rename').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('matter-groups-readback').textContent).toContain('先在分组行勾选一个分组')

    pickGroup(harness, 0)
    harness.node('matter-groups-rename-title').value = '交付跟进v3'
    harness.node('matter-groups-rename').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({ path: '/.sage/matter-groups', body: { action: 'rename', groupId: 'grp-1', name: '交付跟进v3' } })

    harness.node('matter-groups-remove').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({ path: '/.sage/matter-groups', body: { action: 'remove', groupId: 'grp-1' } })
  })

  it('adds and removes members as per-item batches over the picked group', async () => {
    const harness = await bootSagePage(payload(
      [item(), item({ itemId: 'm-2', matterRef: 'm-2', title: '外部对齐' })],
      groups({ groups: [group()] }),
    ))
    pickGroup(harness, 0)
    harness.node('matter-groups-add').dispatch('click')
    await harness.settle()
    expect(harness.requests).toEqual([])
    expect(harness.node('matter-groups-readback').textContent).toContain('先勾选要入组的事项')

    selectItem(harness, 0)
    selectItem(harness, 1)
    harness.node('matter-groups-add').dispatch('click')
    await harness.settle()
    expect(harness.requests[0]).toEqual({
      path: '/.sage/matter-groups',
      body: { action: 'assign', groupId: 'grp-1', operation: 'add', targets: ['m-1', 'm-2'] },
    })

    // 轮询会重渲行（选中态按 Set 回读）：重新选分组、把 m-2 取消勾选后再提交移出。
    pickGroup(harness, 0)
    selectItem(harness, 1, false)
    harness.node('matter-groups-remove-members').dispatch('click')
    await harness.settle()
    expect(harness.requests[1]).toEqual({
      path: '/.sage/matter-groups',
      body: { action: 'assign', groupId: 'grp-1', operation: 'remove', targets: ['m-1'] },
    })
  })

  it('renders the membership batch row by row — counts plus per-row verdicts, no overall success', async () => {
    const harness = await bootSagePage(payload([item()], groups({
      batch: {
        operation: 'add',
        groupId: 'grp-1',
        rows: [
          { itemId: 'm-1', outcome: 'ok', code: null },
          { itemId: 'm-2', outcome: 'unchanged', code: 'already-member' },
          { itemId: 'ghost', outcome: 'refused', code: 'item-unknown' },
        ],
        okCount: 1,
        unchangedCount: 1,
        refusedCount: 1,
      },
    })))
    const rows = harness.node('matter-groups-batch-rows').children
    expect(rows[0]?.textContent).toContain('批量入组逐项结果：共 3 项，成功 1、未变化 1、拒绝 1')
    expect(rows[0]?.textContent).toContain('无整体成功')
    expect(rows[1]?.textContent).toContain('该项已变更')
    expect(rows[2]?.textContent).toContain('未变化：已在该分组')
    expect(rows[3]?.textContent).toContain('该项拒绝')
    expect(rows[3]?.textContent).toContain('查不到')
  })

  it('words an unwired store as a named 缺项 and keeps group refusals readable', async () => {
    const harness = await bootSagePage(payload([item()], { state: 'unavailable', code: 'matter-groups-unavailable', groups: [], trail: [], rename: null, batch: null }))
    expect(harness.node('matter-groups-note').textContent).toContain('未核验')
    expect(harness.node('matter-groups-rows').children).toHaveLength(0)

    const refused = await bootSagePage(
      payload([item()], groups({ groups: [group()] })),
      { '/.sage/matter-groups': { state: 'refused', code: 'group-unknown' } },
    )
    pickGroup(refused, 0)
    refused.node('matter-groups-rename-title').value = 'x'
    refused.node('matter-groups-rename').dispatch('click')
    await refused.settle()
    expect(refused.requests).toHaveLength(1)
  })
})
