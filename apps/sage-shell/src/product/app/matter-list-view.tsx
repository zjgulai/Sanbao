/**
 * Matter list card (ADR-0261, strangler P3 / batch 22).
 *
 * Renders `#sage-region-matter-list` (the `sage-matter-list-card` article is the React root
 * container): the partition rows with their trigger tags and per-row context-selection control,
 * the counts, the archived filter and the dedicated list note. The generation-bound select POST,
 * its refusal codes and the sidebar count (a fact outside this region) stay on the legacy wire —
 * the filter state is mirrored there through `__SAGE_APP_SET_MATTER_LIST_FILTER__`.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type MatterListItemView, type MatterListRegionMessage } from './bridge.js'

interface ContextNotice {
  readonly noticeKind: 'refused' | 'invalid'
  readonly text: string
  readonly contextGeneration: number
}

export interface MatterListRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-matter-list` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

function triggerText(trigger: { readonly kind?: unknown, readonly ref?: unknown, readonly count?: unknown }): string {
  return trigger.kind === 'attempt-unknown' ? '触发：建项结果未知（核对同一请求）— ' + String(trigger.ref ?? '')
    : trigger.kind === 'attempt-failed' ? '触发：建项确认失败（修正后可重试）— ' + String(trigger.ref ?? '')
      : trigger.kind === 'pending-inputs' ? '触发：待继续输入 ' + String(trigger.count ?? 0) + ' 条（点「继续」才派发）'
        : '触发：' + String(trigger.kind ?? 'unknown')
}

export function MatterListRegion({ store, container }: MatterListRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<MatterListRegionMessage>(snapshot, 'matter-list', { kind: 'unavailable' })
  const [showAll, setShowAll] = useState(false)
  const [localNotice, setLocalNotice] = useState<ContextNotice | null>(null)
  const [pendingMatterId, setPendingMatterId] = useState<string | null>(null)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  // The filter is a live mirror for the legacy sidebar count, which lives outside this region.
  useEffect(() => {
    window.__SAGE_APP_SET_MATTER_LIST_FILTER__?.(showAll)
  }, [showAll])

  const known = message.kind === 'read'
  const code = message.kind === 'unavailable' && typeof message.code === 'string' ? message.code : null
  const activeContext = message.activeContext ?? null
  const items: readonly MatterListItemView[] = known && Array.isArray(message.slot.items) ? message.slot.items : []
  const visible = items.filter((item) => item !== null && typeof item === 'object' && (showAll || item.lifecycle !== 'archived'))

  const contextGeneration = activeContext !== null && Number.isSafeInteger(activeContext.contextGeneration)
    ? activeContext.contextGeneration as number
    : null
  // A local notice survives polls within its generation; a new generation (or unwired context) clears it.
  const effectiveNotice = localNotice !== null && contextGeneration !== null && localNotice.contextGeneration === contextGeneration
    ? localNotice
    : null

  const base = !known
    ? (code === null ? '列表未核验：这一版还没有接上事项列表。' : '列表未核验：' + code + '（不显示仿造行——fixture 不当列表数据）。')
    : visible.length === 0
      ? '还没有任何事项记录（草案建项或出现待处理事实后才会出现在这里）。'
      : showAll
        ? '显示全部（含归档/完成——本版还没有这类事实来源，与默认一致）。'
        : '默认不展开归档/完成；分区由 main 每次读取重新推导。'
  const selectionNote = effectiveNotice !== null ? effectiveNotice.noticeKind
    : activeContext === null ? 'unavailable'
      : 'ready'
  const noteText = effectiveNotice !== null ? base + ' ' + effectiveNotice.text
    : activeContext === null ? base + ' 事项选择未接线：activeContext 未读取或格式无效；选择按钮已禁用。'
      : base

  const select = (matterId: string): void => {
    if (contextGeneration === null || pendingMatterId !== null) return
    setPendingMatterId(matterId)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.selectMatterContext?.(matterId, contextGeneration)
        if (result === undefined || result === null) return
        if (result.kind === 'selected' || result.kind === 'cleared') {
          setLocalNotice(null)
          return
        }
        if (result.kind === 'notice' && result.text !== '') {
          setLocalNotice({ noticeKind: result.noticeKind, contextGeneration, text: result.text })
        }
      } finally {
        setPendingMatterId(null)
      }
    })()
  }

  const contextControl = (item: MatterListItemView): JSX.Element | null => {
    if (item.lifecycle === 'archived') return null
    const raw = typeof item.matterRef === 'string' ? item.matterRef : ''
    const matterId = raw !== '' && raw.trim() === raw ? raw : ''
    if (matterId === '') return null
    const active = activeContext !== null && activeContext.state === 'active' && activeContext.matterId === matterId
    return (
      <button
        className="sage-row-button"
        type="button"
        data-matter-context-action="select"
        data-matter-context-state={active ? 'active' : activeContext === null ? 'unavailable' : 'selectable'}
        data-matter-id={matterId}
        data-context-generation={contextGeneration === null ? '' : String(contextGeneration)}
        disabled={active || activeContext === null || pendingMatterId !== null}
        onClick={() => select(matterId)}
      >{active ? '当前事项' : '选择事项'}</button>
    )
  }

  const actionCount = visible.filter((item) => item.partition === 'action').length
  const progressCount = visible.filter((item) => item.partition === 'in-progress').length
  const acceptance = visible.filter((item) => item.partition === 'acceptance')

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">MATTER LIST · ACTION NEED</span><span className="sage-card-index">D0</span></div>
      <h2>事项列表（按行动需求分区）</h2>
      <p className="sage-card-note">分区由 Application Service 从既有事实推导、按最近更新排序（renderer 不自判、不缓存）。“待我处理”逐项标注原因；“待验收”只显示计数——验收与完成语义尚未收口，本版不定义。归档不在默认展开。</p>
      <label className="sage-user-menu-row"><span>筛选</span><input type="checkbox" id="matter-list-all" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} /><span>显示归档（事实来源：本版归档记录；完成语义未收口）</span></label>
      <p id="matter-list-note" className="sage-card-note" role="status" aria-live="polite" data-context-selection-note={selectionNote}>{noteText}</p>
      <div className="sage-state-row"><span>待我处理</span><strong id="matter-count-action" data-matter-count="action">{known ? String(actionCount) : '—'}</strong></div>
      <ul className="sage-roster-list" id="matter-rows-action">
        {visible.map((item) => {
          if (item.partition !== 'action') return null
          if (typeof item.title !== 'string') return null
          return (
            <li key={String(item.itemId ?? '')} className="sage-roster-row" data-matter-item={String(item.itemId ?? '')} data-matter-partition={String(item.partition ?? '')}>
              <strong>{item.title}</strong>
              {item.lifecycle === 'archived' && <span className="sage-roster-tag is-blocked" data-matter-lifecycle="archived">已归档（可恢复；≠停止执行）</span>}
              {(Array.isArray(item.triggers) ? item.triggers : []).map((trigger, index) => (
                <span key={index} className="sage-roster-tag" data-matter-trigger={String(trigger.kind ?? '')}>{triggerText(trigger)}</span>
              ))}
              {contextControl(item)}
            </li>
          )
        })}
      </ul>
      <div className="sage-state-row"><span>进行中</span><strong id="matter-count-progress" data-matter-count="progress">{known ? String(progressCount) : '—'}</strong></div>
      <ul className="sage-roster-list" id="matter-rows-progress">
        {visible.map((item) => {
          if (item.partition !== 'in-progress') return null
          if (typeof item.title !== 'string') return null
          return (
            <li key={String(item.itemId ?? '')} className="sage-roster-row" data-matter-item={String(item.itemId ?? '')} data-matter-partition={String(item.partition ?? '')}>
              <strong>{item.title}</strong>
              {item.lifecycle === 'archived' && <span className="sage-roster-tag is-blocked" data-matter-lifecycle="archived">已归档（可恢复；≠停止执行）</span>}
              <span className="sage-roster-tag">{'最近更新 ' + String(item.updatedAt ?? '')}</span>
              {contextControl(item)}
            </li>
          )
        })}
      </ul>
      <div className="sage-state-row"><span>待验收</span><strong id="matter-count-acceptance" data-matter-count="acceptance">{known ? String(acceptance.length) : '—'}</strong></div>
      <p id="matter-acceptance-note" className="sage-card-note">
        {known && acceptance.length > 0 ? '待验收只显示计数：' + String(acceptance.length) + ' 项有观察到的产物候选；分项验收与整体完成语义未收口，本版不定义。' : ''}
      </p>
    </>
  )
}
