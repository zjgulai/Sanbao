import { afterEach, describe, expect, it } from 'vitest'

import { renderSageDocument } from '../src/product/renderer.js'
import { bootSagePage, statePayload } from './support/sage-page.js'

/**
 * Batch 21 / P3 (ADR-0261 strangler): the matter-admin card (`#matter-admin-*`) and the task-groups
 * card (`#matter-groups-*`) are owned by the React app. The legacy script publishes their region
 * slices through `__SAGE_APP_SET_REGION__` and exposes the seven named acts through
 * `__SAGE_LEGACY_ACTIONS__` (exact bodies, refusal text, refresh); it must not write either card's
 * DOM anymore. Rendering is pinned in `test/product-app/matter-admin-groups.spec.tsx`.
 */

interface RegionMessage {
  readonly kind: string
  readonly [key: string]: unknown
}

interface RegionSink {
  readonly byRegion: Array<{ region: string, message: RegionMessage }>
  readonly restore: () => void
}

interface LegacyActionsShape {
  archiveMatters?: (targets: readonly string[], ground: 'completed' | 'stopped') => Promise<string | null>
  restoreMatters?: (targets: readonly string[]) => Promise<string | null>
  renameMatter?: (targets: readonly string[], title: string) => Promise<string | null>
  createGroup?: (name: string, targets: readonly string[]) => Promise<string | null>
  renameGroup?: (groupId: string, name: string) => Promise<string | null>
  removeGroup?: (groupId: string) => Promise<string | null>
  assignGroupMembers?: (groupId: string, operation: 'add' | 'remove', targets: readonly string[]) => Promise<string | null>
}

let sink: RegionSink | undefined
let restoreActions: (() => void) | undefined

afterEach(() => {
  sink?.restore()
  sink = undefined
  restoreActions?.()
  restoreActions = undefined
})

function installRegionSink(): void {
  const byRegion: Array<{ region: string, message: RegionMessage }> = []
  const target = globalThis as { __SAGE_APP_SET_REGION__?: unknown }
  const previous = target.__SAGE_APP_SET_REGION__
  target.__SAGE_APP_SET_REGION__ = (region: string, message: RegionMessage): void => { byRegion.push({ region, message }) }
  sink = {
    byRegion,
    restore: () => {
      if (previous === undefined) delete target.__SAGE_APP_SET_REGION__
      else target.__SAGE_APP_SET_REGION__ = previous
    },
  }
}

function lastFor(region: string): RegionMessage | undefined {
  return sink?.byRegion.filter((entry) => entry.region === region).at(-1)?.message
}

function legacyActions(): LegacyActionsShape {
  const bridge = (globalThis as unknown as { __SAGE_LEGACY_ACTIONS__?: LegacyActionsShape }).__SAGE_LEGACY_ACTIONS__
  expect(bridge, 'legacy down-bridge must be installed at boot').toBeDefined()
  return bridge!
}

const item = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'receipt:42', matterRef: 'receipt:42', title: '季度复盘', partition: 'in-progress',
  triggers: [], acceptanceCandidateCount: 0, lifecycle: 'active', updatedAt: 't1', ...overrides,
})

const list = (items: unknown[]) => ({ state: 'read', code: null, items, counts: { action: 0, inProgress: items.length, acceptance: 0 } })
const admin = (overrides: Record<string, unknown> = {}) => ({ state: 'read', entries: [], trail: [], rename: null, batch: null, ...overrides })
const groups = (overrides: Record<string, unknown> = {}) => ({ state: 'read', code: null, groups: [], trail: [], rename: null, batch: null, ...overrides })
const group = (overrides: Record<string, unknown> = {}) => ({
  groupId: 'grp-1', name: '交付跟进', memberIds: ['receipt:42'], createdAt: 't', updatedAt: 't', ...overrides,
})

describe('matter-admin region bridge (batch 21)', () => {
  it('publishes the admin slice with rows, archive set, batch, rename and trail; leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      matterList: list([item()]),
      matterAdmin: admin({
        entries: [{ matterRef: 'receipt:old', archivedAt: 't', ground: 'stopped' }],
        trail: [{ action: 'archive', matterRef: 'receipt:old', ground: 'stopped', at: 't1' }],
      }),
    }))
    const slice = lastFor('matter-admin')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { items: unknown[], archived: string[], batch: unknown, rename: unknown, trail: unknown[] }
    expect(slot.items).toEqual([item()])
    expect(slot.archived).toEqual(['receipt:old'])
    expect(slot.batch).toBeNull()
    expect(slot.rename).toBeNull()
    expect(slot.trail).toHaveLength(1)
    expect(page.node('matter-admin-rows').children).toHaveLength(0)
    expect(page.node('matter-admin-batch-rows').children).toHaveLength(0)
    expect(page.node('matter-admin-note').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('matter-admin')).toEqual({ kind: 'unavailable' })
    expect(down.node('matter-admin-rows').children).toHaveLength(0)
  })

  it('keeps the ticket-029 words and control roster pinned on the static first frame', () => {
    const document = renderSageDocument()
    const card = document.slice(
      document.indexOf('class="sage-card sage-matter-admin-card"'),
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
    expect(document).toContain('id="sage-region-matter-admin"')
  })

  it('runs the three admin acts through the down-bridge with exact bodies and notices', async () => {
    const page = await bootSagePage(statePayload({
      matterList: list([item()]),
      matterAdmin: admin(),
    }), {
      '/.sage/matter-admin': { state: 'renamed', status: { rename: { requested: 'x', effective: 'x' } } },
    })
    const actions = legacyActions()

    expect(await actions.archiveMatters!([], 'completed')).toBe('先勾选要归档的事项（可多选：批量逐项返回结果）。')
    expect(await actions.restoreMatters!([])).toBe('先勾选要恢复的事项。')
    expect(await actions.renameMatter!([], 'x')).toBe('重命名一次针对一个事项：请只勾选一项。')
    expect(await actions.renameMatter!(['a', 'b'], 'x')).toBe('重命名一次针对一个事项：请只勾选一项。')
    expect(await actions.renameMatter!(['receipt:42'], '   ')).toBe('先写要改成的名称（1–200 字）。')
    expect(page.requests).toHaveLength(0)

    expect(await actions.archiveMatters!(['receipt:42', 'receipt:other'], 'stopped')).toBeNull()
    expect(await actions.restoreMatters!(['receipt:42'])).toBeNull()
    expect(await actions.renameMatter!(['receipt:42'], '  季度复盘（财务口径）  ')).toBeNull()
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/matter-admin', body: { action: 'batch', operation: 'archive', targets: ['receipt:42', 'receipt:other'], ground: 'stopped' } })
    expect(page.requests[1]).toEqual({ path: '/.sage/matter-admin', body: { action: 'batch', operation: 'restore', targets: ['receipt:42'] } })
    expect(page.requests[2]).toEqual({ path: '/.sage/matter-admin', body: { action: 'rename', matterRef: 'receipt:42', title: '季度复盘（财务口径）' } })
  })

  it('words an unwired rename refusal through the same map the card shows', async () => {
    const page = await bootSagePage(statePayload({ matterList: list([item()]), matterAdmin: admin() }), {
      '/.sage/matter-admin': { state: 'refused', code: 'matter-rename-unavailable' },
    })
    const actions = legacyActions()
    expect(await actions.renameMatter!(['receipt:42'], 'x')).toContain('未接线')
    await page.settle()
    expect(page.requests).toHaveLength(1)
  })

  // The former "archived rows through the D0 filter" test moved to the React side with batch 22:
  // the D0 card belongs to the matter-list region now (`test/product-app/matter-list.spec.tsx`).
})

describe('matter-groups region bridge (batch 21)', () => {
  it('publishes the groups slice with rows, groups, batch, rename and trail; leaves the card DOM untouched', async () => {
    installRegionSink()
    const page = await bootSagePage(statePayload({
      matterList: list([item()]),
      matterGroups: groups({ groups: [group()] }),
    }))
    const slice = lastFor('matter-groups')
    expect(slice?.kind).toBe('read')
    const slot = slice?.slot as { items: unknown[], groups: unknown[], batch: unknown, rename: unknown, trail: unknown[] }
    expect(slot.items).toEqual([item()])
    expect(slot.groups).toEqual([group()])
    expect(slot.batch).toBeNull()
    expect(slot.rename).toBeNull()
    expect(slot.trail).toEqual([])
    expect(page.node('matter-groups-rows').children).toHaveLength(0)
    expect(page.node('matter-groups-list').children).toHaveLength(0)
    expect(page.node('matter-groups-readback').textContent).toBe('')

    const down = await bootSagePage(statePayload({}))
    expect(lastFor('matter-groups')).toEqual({ kind: 'unavailable' })
    expect(down.node('matter-groups-rows').children).toHaveLength(0)
  })

  it('keeps the ticket-049 words and control roster pinned on the static first frame', () => {
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
    expect(document).toContain('id="sage-region-matter-groups"')
  })

  it('runs the four group commands through the down-bridge with exact bodies and notices', async () => {
    const page = await bootSagePage(statePayload({
      matterList: list([item()]),
      matterGroups: groups({ groups: [group()] }),
    }))
    const actions = legacyActions()

    expect(await actions.createGroup!('   ', [])).toBe('先给分组起一个名字（建立是具名命令，不会隐式产生）。')
    expect(await actions.renameGroup!('', 'x')).toContain('先在分组行勾选一个分组')
    expect(await actions.removeGroup!('')).toContain('先在分组行勾选一个分组')
    expect(await actions.assignGroupMembers!('', 'add', ['m-1'])).toContain('先在分组行勾选一个分组')
    expect(await actions.renameGroup!('grp-1', '  ')).toBe('先写好新的分组名称。')
    expect(await actions.assignGroupMembers!('grp-1', 'add', [])).toBe('先勾选要入组的事项（可多选：批量逐项返回结果）。')
    expect(await actions.assignGroupMembers!('grp-1', 'remove', [])).toBe('先勾选要移出的事项。')
    expect(page.requests).toHaveLength(0)

    expect(await actions.createGroup!('  交付跟进  ', [])).toBeNull()
    expect(await actions.createGroup!('交付跟进', ['m-1'])).toBeNull()
    expect(await actions.renameGroup!('grp-1', '交付跟进v3')).toBeNull()
    expect(await actions.removeGroup!('grp-1')).toBeNull()
    expect(await actions.assignGroupMembers!('grp-1', 'add', ['m-1', 'm-2'])).toBeNull()
    expect(await actions.assignGroupMembers!('grp-1', 'remove', ['m-1'])).toBeNull()
    await page.settle()
    expect(page.requests[0]).toEqual({ path: '/.sage/matter-groups', body: { action: 'create', name: '交付跟进' } })
    expect(page.requests[1]).toEqual({ path: '/.sage/matter-groups', body: { action: 'create', name: '交付跟进', targets: ['m-1'] } })
    expect(page.requests[2]).toEqual({ path: '/.sage/matter-groups', body: { action: 'rename', groupId: 'grp-1', name: '交付跟进v3' } })
    expect(page.requests[3]).toEqual({ path: '/.sage/matter-groups', body: { action: 'remove', groupId: 'grp-1' } })
    expect(page.requests[4]).toEqual({ path: '/.sage/matter-groups', body: { action: 'assign', groupId: 'grp-1', operation: 'add', targets: ['m-1', 'm-2'] } })
    expect(page.requests[5]).toEqual({ path: '/.sage/matter-groups', body: { action: 'assign', groupId: 'grp-1', operation: 'remove', targets: ['m-1'] } })
  })
})
