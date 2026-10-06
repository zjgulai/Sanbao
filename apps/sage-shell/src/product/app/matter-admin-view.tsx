/**
 * Matter-admin card (ADR-0261, strangler P3 / batch 21).
 *
 * Renders `#sage-region-matter-admin` (the `sage-matter-admin-card` article is the React root
 * container): the per-matter rows with their archive state, the per-target batch receipts, the
 * rename read-back and the trail. Selection, the archive ground and all notice timing live here;
 * the three named acts stay on the legacy wire through the down-bridge (exact bodies, refusal
 * text, refresh). The batch result is per-item — never an overall success.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type MatterAdminRegionMessage } from './bridge.js'

const REFUSAL_TEXT: Record<string, string> = {
  'matter-unknown': '这项在服务记录里查不到——无权与不存在同码，不做枚举。',
  'not-archived': '这项不在归档范围里。',
  'batch-size-invalid': '批量一次 1–32 项。',
  'archive-ground-required': '归档需要先选择依据（已完成／已停止，声明）。',
  'rename-title-invalid': '名称需要 1–200 字。',
  'matter-rename-unavailable': '重命名未接线：正式记录由托管侧裁决，这一版还没有裁决通道。',
  'matter-admin-unavailable': '这一版还没有接上事项管理存储。',
}

function refusalText(code: unknown): string {
  return typeof code === 'string' && code in REFUSAL_TEXT ? REFUSAL_TEXT[code]! : '操作被拒绝（' + String(code) + '）。'
}

export interface MatterAdminRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-matter-admin` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function MatterAdminRegion({ store, container }: MatterAdminRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<MatterAdminRegionMessage>(snapshot, 'matter-admin', { kind: 'unavailable' })
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [ground, setGround] = useState<'completed' | 'stopped'>('completed')
  const [adminNotice, setAdminNotice] = useState<string | null>(null)
  const [renameNotice, setRenameNotice] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [archiving, setArchiving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const items = slot !== null && Array.isArray(slot.items) ? slot.items : []
  const archived = new Set(slot !== null && Array.isArray(slot.archived) ? slot.archived : [])
  const batch = slot !== null && slot.batch !== null && typeof slot.batch === 'object' ? slot.batch : null
  const rename = slot !== null && slot.rename !== null && typeof slot.rename === 'object' ? slot.rename : null
  const trail = slot !== null && Array.isArray(slot.trail) ? slot.trail : []

  const toggle = (ref: string, on: boolean): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (on) next.add(ref)
      else next.delete(ref)
      return next
    })
  }

  const targets = (): string[] => [...selected]

  const archive = (): void => {
    setAdminNotice(null)
    setArchiving(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.archiveMatters?.(targets(), ground)
        if (typeof notice === 'string') setAdminNotice(notice)
      } finally {
        setArchiving(false)
      }
    })()
  }

  const restore = (): void => {
    setAdminNotice(null)
    setRestoring(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.restoreMatters?.(targets())
        if (typeof notice === 'string') setAdminNotice(notice)
      } finally {
        setRestoring(false)
      }
    })()
  }

  const renameIt = (): void => {
    setRenameNotice(null)
    setRenaming(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.renameMatter?.(targets(), renameTitle)
        if (typeof notice === 'string') setRenameNotice(notice)
      } finally {
        setRenaming(false)
      }
    })()
  }

  const note = adminNotice ?? (!known ? '未核验：这一版还没有接上事项管理存储。' : '')
  const renameNote = renameNotice ?? (rename !== null && typeof rename.effective === 'string'
    ? '请求「' + String(rename.requested) + '」→ 服务回读生效「' + rename.effective + '」（显示的是实际生效值）。'
    : '')

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">MATTER ADMIN · ARCHIVE · RENAME · BATCH</span><span className="sage-card-index">D7</span></div>
      <h2>事项管理：归档、重命名与逐项批量</h2>
      <p className="sage-card-note">归档是可恢复的列表退役：退出活动列表、<strong>保留事实与回执</strong>，可随时恢复——恢复只回列表呈现，不自动恢复执行、也不把已完成改成运行中。<strong>归档≠停止执行（在跑的运行不受影响）、≠隐藏</strong>；归档不解除未结责任、不扩大读取权限；真正删除是独立受控流程，这里没有入口。重命名经服务裁决，显示的是<strong>回读的实际生效值</strong>（请求值不冒充生效值）。批量<strong>逐项返回</strong>结果与拒绝原因，没有「整体成功」。本版归档依据是声明（已完成／已停止——验收读数未收口，不冒充核验）。</p>
      <div className="sage-state-row"><span>归档依据（声明）</span><select id="matter-admin-ground" aria-label="归档依据" value={ground} onChange={(event) => setGround(event.target.value === 'stopped' ? 'stopped' : 'completed')}>
        <option value="completed">已完成（声明）</option>
        <option value="stopped">已停止（声明）</option>
      </select></div>
      <button className="sage-secondary-button" id="matter-admin-archive" type="button" disabled={archiving} onClick={archive}>归档所选（逐项）</button>
      <button className="sage-secondary-button" id="matter-admin-restore" type="button" disabled={restoring} onClick={restore}>恢复所选（逐项）</button>
      <p id="matter-admin-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="matter-admin-rows">
        {items.map((item) => {
          const ref = typeof item.matterRef === 'string' ? item.matterRef : ''
          if (ref === '') return null
          const isArchived = archived.has(ref)
          return (
            <li key={ref} className="sage-roster-row" data-matter-admin-ref={ref}>
              <input type="checkbox" className="sage-history-toggle" data-matter-admin-toggle={ref} aria-label="选择这项" checked={selected.has(ref)} onChange={(event) => toggle(ref, event.target.checked)} />
              <strong>{typeof item.title === 'string' ? item.title : ref}</strong>
              <span className="sage-roster-tag">{ref}</span>
              <span className={'sage-roster-tag ' + (isArchived ? 'is-blocked' : '')}>{isArchived ? '已归档（可恢复；≠停止执行）' : '活动'}</span>
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="matter-admin-batch-rows">
        {batch !== null && Array.isArray(batch.rows) ? (
          <>
            <li className="sage-roster-row">
              {(batch.operation === 'archive' ? '批量归档' : '批量恢复') + '逐项结果：共 ' + String(batch.rows.length)
                + ' 项，成功 ' + String(batch.okCount ?? 0) + '、拒绝 ' + String(batch.refusedCount ?? 0) + '（逐项为准，无整体成功）。'}
            </li>
            {batch.rows.map((entry, index) => {
              const ref = typeof entry.matterRef === 'string' ? entry.matterRef : ''
              if (ref === '') return null
              return (
                <li key={index} className="sage-roster-row" data-batch-ref={ref}>
                  <span className="sage-roster-tag">{ref}</span>
                  <span className={'sage-roster-tag ' + (entry.outcome === 'ok' ? 'is-ok' : 'is-blocked')}>
                    {entry.outcome === 'ok' ? '该项成功' : '该项拒绝：' + refusalText(entry.code)}
                  </span>
                </li>
              )
            })}
          </>
        ) : null}
      </ul>
      <div className="sage-state-row"><span>重命名（所选事项）</span><input className="sage-row-input" id="matter-admin-rename-title" type="text" aria-label="新的名称" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} /></div>
      <button className="sage-secondary-button" id="matter-admin-rename" type="button" disabled={renaming} onClick={renameIt}>重命名（服务裁决并回读）</button>
      <p id="matter-admin-rename-note" className="sage-card-note" role="status" aria-live="polite">{renameNote}</p>
      <ul className="sage-roster-list" id="matter-admin-trail">
        {trail.slice(-6).map((record, index) => (
          <li key={index} className="sage-roster-row">
            {(record.action === 'archive' ? '归档' : '恢复') + ' ' + String(record.matterRef)
              + (typeof record.ground === 'string' ? '（依据：' + record.ground + '，声明）' : '') + ' · ' + String(record.at ?? '')}
          </li>
        ))}
      </ul>
    </>
  )
}
