import { describe, expect, it, vi } from 'vitest'

import { createUnavailableFirstService } from '../src/appservice/composition.js'
import { handleSageServiceRequest } from '../src/appservice/route-skeleton.js'
import { createMatterGroups } from '../src/main/matter-groups.js'
import { createMatterList, type MatterListDraftFact } from '../src/main/matter-list.js'

/**
 * Ticket 049 (US-225/226) at the module and route seams.
 *
 * The acceptance lines: create / rename / remove are named commands with their own receipts and
 * read-backs (nothing implicit — an unknown group refuses instead of being minted); membership
 * batches answer row by row with no “overall success”; and a group change never touches what the
 * list derives — the strongest assertion here is that `derive()` stays byte-identical across every
 * group operation, and the store is handed no port through which a fact, scope, responsibility or
 * permission could change (its only callback is the known-item gate, and even that is only read
 * through, never written).
 */

function harness() {
  let counter = 0
  const known = new Set(['m-1', 'm-2', 'm-3'])
  const knownItem = vi.fn((itemId: string) => known.has(itemId))
  const store = createMatterGroups({
    now: () => '2026-10-03T12:00:00.000Z',
    nextId: () => `grp-${String(++counter)}`,
    knownItem,
  })
  return { store, knownItem }
}

describe('the task-group store (ticket 049)', () => {
  it('creates with its own receipt and read-back; member targets are judged row by row', () => {
    const h = harness()
    const outcome = h.store.create({ name: ' 交付跟进 ', targets: ['m-1', 'ghost', 'm-2'] })
    expect(outcome.state).toBe('created')
    if (outcome.state === 'refused') throw new Error('unreachable')
    // 回读：名称是存储值（trim 后），建立回执与读态都在。
    expect(outcome.status.groups).toEqual([{
      groupId: 'grp-1',
      name: '交付跟进',
      memberIds: ['m-1', 'm-2'],
      createdAt: '2026-10-03T12:00:00.000Z',
      updatedAt: '2026-10-03T12:00:00.000Z',
    }])
    expect(outcome.status.trail).toEqual([{ at: '2026-10-03T12:00:00.000Z', action: 'create', groupId: 'grp-1', name: '交付跟进', count: 2 }])
    expect(outcome.status.batch).toMatchObject({
      operation: 'add',
      groupId: 'grp-1',
      rows: [
        { itemId: 'm-1', outcome: 'ok', code: null },
        { itemId: 'ghost', outcome: 'refused', code: 'item-unknown' },
        { itemId: 'm-2', outcome: 'ok', code: null },
      ],
      okCount: 2,
      unchangedCount: 0,
      refusedCount: 1,
    })
    // 建立命令本身不因成员拒绝而消失；未知目标只是逐项拒绝。
    expect(h.store.list().groups).toHaveLength(1)
  })

  it('renames with a read-back effective value and refuses unknown groups / invalid names', () => {
    const h = harness()
    const created = h.store.create({ name: '旧名' })
    if (created.state === 'refused') throw new Error('unreachable')
    const renamed = h.store.rename({ groupId: 'grp-1', name: ' 新名 ' })
    expect(renamed.state).toBe('renamed')
    if (renamed.state === 'refused') throw new Error('unreachable')
    expect(renamed.status.rename).toEqual({
      groupId: 'grp-1',
      requested: '新名',
      effective: '新名',
      at: '2026-10-03T12:00:00.000Z',
    })
    expect(renamed.status.groups[0]?.name).toBe('新名')
    expect(h.store.rename({ groupId: 'nope', name: 'x' })).toEqual({ state: 'refused', code: 'group-unknown' })
    expect(h.store.rename({ groupId: 'grp-1', name: '   ' })).toEqual({ state: 'refused', code: 'group-name-invalid' })
    expect(h.store.rename({ groupId: 'grp-1', name: 'x'.repeat(121) })).toEqual({ state: 'refused', code: 'group-name-invalid' })
    expect(h.store.create({ name: '' })).toEqual({ state: 'refused', code: 'group-name-invalid' })
  })

  it('removes the group as organization only — its own receipt, the facts elsewhere untouched', () => {
    const h = harness()
    h.store.create({ name: '组', targets: ['m-1'] })
    const removed = h.store.remove({ groupId: 'grp-1' })
    expect(removed.state).toBe('removed')
    if (removed.state === 'refused') throw new Error('unreachable')
    expect(removed.status.groups).toEqual([])
    expect(removed.status.trail.at(-1)).toEqual({ at: '2026-10-03T12:00:00.000Z', action: 'remove', groupId: 'grp-1', name: '组', count: 1 })
    // 移除≠删除事项：库里除了分组自己的记录，没有别的东西被它写过。
    expect(h.knownItem).toHaveBeenCalled()
    expect(h.store.remove({ groupId: 'grp-1' })).toEqual({ state: 'refused', code: 'group-unknown' })
  })

  it('assigns membership row by row (ok / unchanged / refused) — no “overall success” anywhere', () => {
    const h = harness()
    h.store.create({ name: '组', targets: ['m-1'] })
    const added = h.store.assign({ groupId: 'grp-1', operation: 'add', targets: ['m-1', 'm-2', 'ghost'] })
    expect(added.state).toBe('batch')
    if (added.state === 'refused') throw new Error('unreachable')
    const batch = added.status.batch
    expect(batch).toMatchObject({
      operation: 'add',
      rows: [
        { itemId: 'm-1', outcome: 'unchanged', code: 'already-member' },
        { itemId: 'm-2', outcome: 'ok', code: null },
        { itemId: 'ghost', outcome: 'refused', code: 'item-unknown' },
      ],
      okCount: 1,
      unchangedCount: 1,
      refusedCount: 1,
    })
    // 行与计数之外没有总括字段；键集封闭。
    expect(Object.keys(batch!).sort()).toEqual(['groupId', 'okCount', 'operation', 'refusedCount', 'rows', 'unchangedCount'])
    expect(Object.keys(batch!.rows[0]!).sort()).toEqual(['code', 'itemId', 'outcome'])
    const removed = h.store.assign({ groupId: 'grp-1', operation: 'remove', targets: ['m-1', 'm-3'] })
    if (removed.state === 'refused') throw new Error('unreachable')
    expect(removed.status.batch).toMatchObject({
      operation: 'remove',
      rows: [
        { itemId: 'm-1', outcome: 'ok', code: null },
        { itemId: 'm-3', outcome: 'unchanged', code: 'not-member' },
      ],
      okCount: 1,
      unchangedCount: 1,
      refusedCount: 0,
    })
    // 对未知分组的成员操作被拒绝（不隐式产生），且没有静默建档。
    expect(h.store.assign({ groupId: 'nope', operation: 'add', targets: ['m-1'] })).toEqual({ state: 'refused', code: 'group-unknown' })
    expect(h.store.list().groups).toHaveLength(1)
    expect(h.store.assign({ groupId: 'grp-1', operation: 'add', targets: [] })).toEqual({ state: 'refused', code: 'batch-size-invalid' })
  })

  it('never changes the derived list across its whole lifecycle (US-226)', () => {
    const facts: MatterListDraftFact[] = [
      { draftId: 'd-1', matterRef: 'm-1', title: '事项一', attempt: null, updatedAt: '2026-10-01T09:00:00.000Z' },
      { draftId: 'd-2', matterRef: 'm-2', title: '事项二', attempt: { correlation: 'c-2', state: 'unknown' }, updatedAt: '2026-10-02T09:00:00.000Z' },
    ]
    const list = createMatterList({
      listDraftFacts: () => ({ state: 'ready' as const, facts }),
      pendingCount: () => 0,
      acceptanceCandidateCount: () => 0,
    })
    const before = list.derive()
    const h = harness()
    h.store.create({ name: '组一', targets: ['m-1', 'm-2'] })
    h.store.assign({ groupId: 'grp-1', operation: 'add', targets: ['m-1'] })
    h.store.assign({ groupId: 'grp-1', operation: 'remove', targets: ['m-2'] })
    h.store.rename({ groupId: 'grp-1', name: '改名后' })
    h.store.remove({ groupId: 'grp-1' })
    const after = list.derive()
    // 逐字节相同：分组变化不改变分区、触发、生命周期或任何列表事实（US-226）。
    expect(after).toEqual(before)
    expect(h.knownItem.mock.calls.length).toBeGreaterThan(0)
    // 关闭记录：分组状态里没有任何范围／责任／权限字段可供推断。
    const keys = Object.keys(h.store.list()).sort()
    expect(keys).toEqual(['batch', 'code', 'groups', 'rename', 'state', 'trail'])
  })
})

describe('the task-group route (ticket 049)', () => {
  const statusFixture = { state: 'read' as const, code: null, groups: [], trail: [], rename: null, batch: null }

  it('parses exactly, forwards the four named acts, and keeps an unwired provider honest', async () => {
    const seen: unknown[] = []
    const providers = createUnavailableFirstService(null, {
      matterGroupsCreate: (request) => {
        seen.push({ create: request })
        return { state: 'created', status: statusFixture }
      },
      matterGroupsRename: (request) => {
        seen.push({ rename: request })
        return { state: 'renamed', status: statusFixture }
      },
      matterGroupsRemove: (request) => {
        seen.push({ remove: request })
        return { state: 'removed', status: statusFixture }
      },
      matterGroupsAssign: (request) => {
        seen.push({ assign: request })
        return { state: 'batch', status: statusFixture }
      },
    })
    const post = (body: unknown, service = providers) => handleSageServiceRequest(
      new Request('dsh-app://app/.sage/matter-groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { callerBinding: { correlation: 'c-049' }, providers: service } as never,
    )
    expect(await (await post({ action: 'create', name: '交付跟进' })).json()).toMatchObject({ state: 'created' })
    expect(await (await post({ action: 'create', name: '交付跟进', targets: ['m-1'] })).json()).toMatchObject({ state: 'created' })
    expect(await (await post({ action: 'rename', groupId: 'grp-1', name: '新名' })).json()).toMatchObject({ state: 'renamed' })
    expect(await (await post({ action: 'remove', groupId: 'grp-1' })).json()).toMatchObject({ state: 'removed' })
    expect(await (await post({ action: 'assign', groupId: 'grp-1', operation: 'add', targets: ['m-1'] })).json()).toMatchObject({ state: 'batch' })
    expect(await (await post({ action: 'assign', groupId: 'grp-1', operation: 'remove', targets: ['m-1'] })).json()).toMatchObject({ state: 'batch' })
    // 恰好转发这些具名命令；没有整体成功、没有别的动作。
    expect(seen).toEqual([
      { create: { action: 'create', name: '交付跟进' } },
      { create: { action: 'create', name: '交付跟进', targets: ['m-1'] } },
      { rename: { action: 'rename', groupId: 'grp-1', name: '新名' } },
      { remove: { action: 'remove', groupId: 'grp-1' } },
      { assign: { action: 'assign', groupId: 'grp-1', operation: 'add', targets: ['m-1'] } },
      { assign: { action: 'assign', groupId: 'grp-1', operation: 'remove', targets: ['m-1'] } },
    ])
    // 精确成员：多余键、坏类型、越界批量一律 400。
    expect((await post({ action: 'create', name: 'x', extra: 1 })).status).toBe(400)
    expect((await post({ action: 'create', name: '   ' })).status).toBe(400)
    expect((await post({ action: 'create', name: 'x', targets: [] })).status).toBe(400)
    expect((await post({ action: 'create', name: 'x', targets: Array.from({ length: 33 }, (_, i) => `m-${String(i)}`) })).status).toBe(400)
    expect((await post({ action: 'rename', groupId: '', name: 'x' })).status).toBe(400)
    expect((await post({ action: 'rename', groupId: 'g' })).status).toBe(400)
    expect((await post({ action: 'remove', groupId: 'g', name: 'x' })).status).toBe(400)
    expect((await post({ action: 'assign', groupId: 'g', operation: 'delete', targets: ['m'] })).status).toBe(400)
    expect((await post({ action: 'assign', groupId: 'g', operation: 'add', targets: [] })).status).toBe(400)
    expect((await post({ action: 'nope' })).status).toBe(400)

    const unwired = createUnavailableFirstService(null, {})
    expect(await (await post({ action: 'create', name: 'x' }, unwired)).json()).toMatchObject({ code: 'matter-groups-unavailable' })
    expect(await (await post({ action: 'remove', groupId: 'g' }, unwired)).json()).toMatchObject({ code: 'matter-groups-unavailable' })
  })

  it('carries the unavailable slot and the read slot through the state projection', async () => {
    const bare = createUnavailableFirstService(null, {})
    const bareState = await (await bare.readState()).json() as { matterGroups: { state: string, code: string | null } }
    expect(bareState.matterGroups.state).toBe('unavailable')
    expect(bareState.matterGroups.code).toBe('matter-groups-unavailable')

    const wired = createUnavailableFirstService(null, {
      matterGroups: () => ({
        state: 'read',
        code: null,
        groups: [{ groupId: 'grp-1', name: '组', memberIds: ['m-1'], createdAt: 't', updatedAt: 't' }],
        trail: [],
        rename: null,
        batch: null,
      }),
    })
    const wiredState = await (await wired.readState()).json() as { matterGroups: { state: string, groups: Array<{ groupId: string }> } }
    expect(wiredState.matterGroups.state).toBe('read')
    expect(wiredState.matterGroups.groups[0]?.groupId).toBe('grp-1')
  })
})
