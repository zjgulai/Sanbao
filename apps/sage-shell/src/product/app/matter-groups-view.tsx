/**
 * Task-groups card (ADR-0261, strangler P3 / batch 21).
 *
 * Renders `#sage-region-matter-groups` (the `sage-matter-groups-card` article is the React root
 * container): the per-matter rows with their group tags, the group rows with the read-back count,
 * the membership batches (row by row, never an overall success), the rename read-back and the
 * trail. Selection, the single picked group and all notice timing live here; the four named
 * commands stay on the legacy wire through the down-bridge (exact bodies, refusal text, refresh).
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type MatterGroupsRegionMessage } from './bridge.js'

const REFUSAL_TEXT: Record<string, string> = {
  'group-name-invalid': '分组名称需要 1–120 字。',
  'batch-size-invalid': '批量一次 1–32 项。',
  'group-unknown': '这个分组查不到——操作不会隐式建组，也不做枚举。',
  'item-unknown': '这项在事项列表里查不到——未知与无权同码，不做枚举。',
  'matter-groups-unavailable': '这一版还没有接上任务分组存储。',
}

function refusalText(code: unknown): string {
  return typeof code === 'string' && code in REFUSAL_TEXT ? REFUSAL_TEXT[code]! : '操作被拒绝（' + String(code) + '）。'
}

export interface MatterGroupsRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-matter-groups` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function MatterGroupsRegion({ store, container }: MatterGroupsRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<MatterGroupsRegionMessage>(snapshot, 'matter-groups', { kind: 'unavailable' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pickedGroupId, setPickedGroupId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [renameTitle, setRenameTitle] = useState('')
  const [readbackNotice, setReadbackNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [removingMembers, setRemovingMembers] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const items = slot !== null && Array.isArray(slot.items) ? slot.items : []
  const groups = slot !== null && Array.isArray(slot.groups) ? slot.groups : []
  const batch = slot !== null && slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null
  const rename = slot !== null && slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null
  const trail = slot !== null && Array.isArray(slot.trail) ? slot.trail : []

  const toggleItem = (itemId: string, on: boolean): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (on) next.add(itemId)
      else next.delete(itemId)
      return next
    })
  }

  const run = async (act: () => Promise<string | null | undefined>, setPending: (on: boolean) => void): Promise<void> => {
    setReadbackNotice(null)
    setPending(true)
    try {
      const notice = await act()
      if (typeof notice === 'string') setReadbackNotice(notice)
    } finally {
      setPending(false)
    }
  }

  const create = (): void => {
    void run(() => window.__SAGE_LEGACY_ACTIONS__?.createGroup?.(name, [...selected]) ?? Promise.resolve(null), setCreating)
  }
  const renameIt = (): void => {
    if (pickedGroupId === null) {
      setReadbackNotice('先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。')
      return
    }
    void run(() => window.__SAGE_LEGACY_ACTIONS__?.renameGroup?.(pickedGroupId, renameTitle) ?? Promise.resolve(null), setRenaming)
  }
  const remove = (): void => {
    if (pickedGroupId === null) {
      setReadbackNotice('先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。')
      return
    }
    void run(() => window.__SAGE_LEGACY_ACTIONS__?.removeGroup?.(pickedGroupId) ?? Promise.resolve(null), setRemoving)
  }
  const addMembers = (): void => {
    if (pickedGroupId === null) {
      setReadbackNotice('先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。')
      return
    }
    void run(() => window.__SAGE_LEGACY_ACTIONS__?.assignGroupMembers?.(pickedGroupId, 'add', [...selected]) ?? Promise.resolve(null), setAdding)
  }
  const removeMembers = (): void => {
    if (pickedGroupId === null) {
      setReadbackNotice('先在分组行勾选一个分组（改名／移除／成员批量都针对所选分组）。')
      return
    }
    void run(() => window.__SAGE_LEGACY_ACTIONS__?.assignGroupMembers?.(pickedGroupId, 'remove', [...selected]) ?? Promise.resolve(null), setRemovingMembers)
  }

  const note = !known ? '未核验：这一版还没有接上任务分组存储。' : ''
  const readback = readbackNotice ?? (rename !== null && typeof rename.effective === 'string'
    ? '请求「' + String(rename.requested) + '」→ 回读生效「' + rename.effective + '」（显示的是实际生效值）。'
    : '')

  const actionLabels: Record<string, string> = { create: '建立', rename: '改名', remove: '移除', 'add-members': '入组', 'remove-members': '移出' }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">TASK GROUPS · SAGE-OWNED ORGANIZATION</span><span className="sage-card-index">D12</span></div>
      <h2>任务分组：建立、改名与移除（只改变列表组织）</h2>
      <p className="sage-card-note">分组是 Sage 自有的组织对象：建立、改名、移除都是具名命令，各有回执与回读，<strong>不隐式产生</strong>（对未知分组的操作被拒绝，不会自动建组）。分组<strong>只改变列表组织方式</strong>：不改变事项事实、可见范围、责任或权限；<strong>移除分组≠删除事项</strong>。成员批量<strong>逐项返回</strong>结果与拒绝原因，没有「整体成功」。本版分组是本机组织记录：不做共享与协作语义、不做按分组批量授权、不跨设备同步。</p>
      <p id="matter-groups-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <div className="sage-state-row"><span>新分组名称</span><input className="sage-row-input" id="matter-groups-name" type="text" aria-label="新分组名称" value={name} onChange={(event) => setName(event.target.value)} /></div>
      <button className="sage-secondary-button" id="matter-groups-create" type="button" disabled={creating} onClick={create}>建立分组（所选事项入组，逐个回执）</button>
      <ul className="sage-roster-list" id="matter-groups-rows">
        {items.map((item) => {
          const itemId = typeof item.itemId === 'string' ? item.itemId : ''
          if (itemId === '') return null
          const mine = groups.filter((group) => Array.isArray(group.memberIds) && group.memberIds.includes(itemId))
          return (
            <li key={itemId} className="sage-roster-row" data-matter-group-item={itemId}>
              <input type="checkbox" className="sage-history-toggle" data-matter-group-toggle={itemId} aria-label="选择这项" checked={selected.has(itemId)} onChange={(event) => toggleItem(itemId, event.target.checked)} />
              <strong>{typeof item.title === 'string' ? item.title : itemId}</strong>
              <span className="sage-roster-tag">{itemId}</span>
              <span className="sage-roster-tag">{mine.length === 0 ? '未分组' : '分组：' + mine.map((group) => typeof group.name === 'string' ? group.name : group.groupId).join('、')}</span>
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="matter-groups-list">
        {groups.map((group) => {
          const groupId = typeof group.groupId === 'string' ? group.groupId : ''
          if (groupId === '') return null
          return (
            <li key={groupId} className="sage-roster-row" data-matter-group-row={groupId}>
              <input type="checkbox" className="sage-history-toggle" data-matter-group-pick={groupId} aria-label="选择这个分组" checked={pickedGroupId === groupId} onChange={(event) => setPickedGroupId(event.target.checked ? groupId : null)} />
              <strong>{typeof group.name === 'string' ? group.name : groupId}</strong>
              <span className="sage-roster-tag">{String(Array.isArray(group.memberIds) ? group.memberIds.length : 0) + ' 项（回读）'}</span>
            </li>
          )
        })}
      </ul>
      <div className="sage-state-row"><span>改名（所选分组）</span><input className="sage-row-input" id="matter-groups-rename-title" type="text" aria-label="分组新名称" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} /></div>
      <button className="sage-secondary-button" id="matter-groups-rename" type="button" disabled={renaming} onClick={renameIt}>改名（回读生效值）</button>
      <button className="sage-secondary-button" id="matter-groups-remove" type="button" disabled={removing} onClick={remove}>移除分组（只移除组织，≠删除事项）</button>
      <button className="sage-secondary-button" id="matter-groups-add" type="button" disabled={adding} onClick={addMembers}>加入所选事项（逐项）</button>
      <button className="sage-secondary-button" id="matter-groups-remove-members" type="button" disabled={removingMembers} onClick={removeMembers}>移出所选事项（逐项）</button>
      <p id="matter-groups-readback" className="sage-card-note" role="status" aria-live="polite">{readback}</p>
      <ul className="sage-roster-list" id="matter-groups-batch-rows">
        {batch !== null && Array.isArray(batch.rows) ? (
          <>
            <li className="sage-roster-row">
              {'批量' + (batch.operation === 'add' ? '入组' : '移出') + '逐项结果：共 ' + String(batch.rows.length)
                + ' 项，成功 ' + String(batch.okCount ?? 0) + '、未变化 ' + String(batch.unchangedCount ?? 0) + '、拒绝 ' + String(batch.refusedCount ?? 0) + '（逐项为准，无整体成功）。'}
            </li>
            {batch.rows.map((entry, index) => {
              const itemId = typeof entry.itemId === 'string' ? entry.itemId : ''
              if (itemId === '') return null
              return (
                <li key={index} className="sage-roster-row" data-group-batch-ref={itemId}>
                  <span className="sage-roster-tag">{itemId}</span>
                  <span className={'sage-roster-tag ' + (entry.outcome === 'ok' ? 'is-ok' : entry.outcome === 'refused' ? 'is-blocked' : '')}>
                    {entry.outcome === 'ok' ? '该项已变更'
                      : entry.outcome === 'unchanged' ? (entry.code === 'already-member' ? '未变化：已在该分组' : '未变化：不在该分组')
                        : '该项拒绝：' + refusalText(entry.code)}
                  </span>
                </li>
              )
            })}
          </>
        ) : null}
      </ul>
      <ul className="sage-roster-list" id="matter-groups-trail">
        {trail.slice(-6).map((record, index) => {
          const withCount = record.action === 'create' || record.action === 'remove' || record.action === 'add-members' || record.action === 'remove-members'
          return (
            <li key={index} className="sage-roster-row">
              {(actionLabels[String(record.action)] ?? String(record.action)) + '「' + String(record.name ?? record.groupId) + '」'
                + (withCount ? '（' + String(record.count ?? 0) + ' 项）' : '')
                + ' · ' + String(record.at ?? '')}
            </li>
          )
        })}
      </ul>
    </>
  )
}
