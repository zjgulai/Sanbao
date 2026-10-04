/**
 * Action-items card (ADR-0261, strangler P3 / batch 18): action items, corrections and the
 * project grouping block in one card.
 *
 * Renders `#sage-region-action-items` (the `sage-action-items-card` article is the React root
 * container). Requests, refusal-code text, the link-card matter reads and refresh stay on the
 * legacy wire through the down-bridge; this component owns the DOM, the current-item and
 * original-selection view state, the correction copy prefill, pending flags and notice timing.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type ActionItemsRegionMessage, type ActionItemView, type AppBridgeStore, type CorrectionView, type ProjectView } from './bridge.js'

const ORIGINAL_LABEL_LIMIT = 40

function receiptText(receipt: CorrectionView['receipt']): string {
  if (receipt === null || receipt === undefined || typeof receipt !== 'object') return '回执未知'
  if (receipt.state === 'received') return '已接收（受理回执；受理不等于生效）'
  if (receipt.state === 'pending-application') {
    const reason = receipt.reason === 'queued' ? '在队列中' : receipt.reason === 'deferred' ? '在待继续中' : '尚未观察到消费读数'
    return '待应用（' + reason + '，等一次安全派发）'
  }
  if (receipt.state === 'effective') return '已生效（队列消费读数；不撤销既有外部效果、不重放旧动作）'
  if (receipt.state === 'refused') return '被拒绝（' + String(receipt.code) + '）'
  return '回执未知'
}

function itemStateCopy(state: unknown): string {
  return state === 'done' ? '已完成（≠交付验收）' : state === 'in-progress' ? '进行中' : '未开始'
}

export interface ActionItemsRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-action-items` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function ActionItemsRegion({ store, container }: ActionItemsRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<ActionItemsRegionMessage>(snapshot, 'action-items', { kind: 'unavailable' })
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
  const [correctionIndex, setCorrectionIndex] = useState(-1) // -1 = follow the last original
  const [correctionText, setCorrectionText] = useState('')
  const [itemTitle, setItemTitle] = useState('')
  const [itemBody, setItemBody] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectRef, setProjectRef] = useState<string | null>(null)
  const [itemNotice, setItemNotice] = useState<string | null>(null)
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null)
  const [projectNotice, setProjectNotice] = useState<string | null>(null)
  const [pendingCreate, setPendingCreate] = useState(false)
  const [pendingRow, setPendingRow] = useState<string | null>(null)
  const [pendingCorrection, setPendingCorrection] = useState(false)
  const [pendingProject, setPendingProject] = useState<string | null>(null)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const items: readonly ActionItemView[] = known && Array.isArray(message.slot.items) ? message.slot.items : []
  const corrections: readonly CorrectionView[] = known && Array.isArray(message.slot.corrections) ? message.slot.corrections : []
  const originals = known && Array.isArray(message.slot.originals) ? message.slot.originals : []
  const projectsState = known && typeof message.slot.projectsState === 'string' ? message.slot.projectsState : 'unavailable'
  const projects: readonly ProjectView[] = known && Array.isArray(message.slot.projects) ? message.slot.projects : []

  const current = items.find((entry) => entry.actionId === selectedActionId) ?? (items.length > 0 ? items[items.length - 1] ?? null : null)
  const payloadItemNote = !known ? '未核验：这一版还没有接上行动项存储。' : ''
  const payloadProjectNote = projectsState !== 'read' ? '未核验：这一版还没有接上项目存储。' : ''
  const recordNote = current === null
    ? ''
    : (Array.isArray(current.records) ? current.records : []).length === 0
      ? '「' + String(current.title) + '」还没有执行记录——完成只是状态变更，不代表执行成功。'
      : '「' + String(current.title) + '」的执行记录（冻结登记当时的依据版本）：'

  const effectiveCorrectionIndex = originals.length === 0 ? -1
    : correctionIndex < 0 || correctionIndex >= originals.length ? originals.length - 1 : correctionIndex
  const effectiveProjectRef = projects.some((entry) => entry.projectRef === projectRef) ? projectRef : (projects[0]?.projectRef ?? null)

  const createItem = (): void => {
    setItemNotice(null)
    setPendingCreate(true)
    void (async () => {
      try {
        const note = await window.__SAGE_LEGACY_ACTIONS__?.createActionItem?.(itemTitle.trim(), itemBody.trim() === '' ? null : itemBody.trim())
        if (typeof note === 'string') setItemNotice(note)
      } finally {
        setPendingCreate(false)
      }
    })()
  }

  const runRowAction = (actionId: string, action: 'start' | 'complete'): void => {
    setPendingRow(actionId + ':' + action)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.actionItemRowAction?.(actionId, action)
      } finally {
        setPendingRow(null)
      }
    })()
  }

  const submitCorrection = (): void => {
    const entry = effectiveCorrectionIndex >= 0 ? originals[effectiveCorrectionIndex] : undefined
    setCorrectionNotice(null)
    setPendingCorrection(true)
    void (async () => {
      try {
        const note = await window.__SAGE_LEGACY_ACTIONS__?.submitCorrection?.(
          entry === undefined ? null : { text: String(entry.text ?? ''), at: typeof entry.at === 'string' ? entry.at : null },
          correctionText.trim(),
        )
        if (typeof note === 'string') setCorrectionNotice(note)
      } finally {
        setPendingCorrection(false)
      }
    })()
  }

  const createProject = (): void => {
    setProjectNotice(null)
    setPendingProject('create')
    void (async () => {
      try {
        const note = await window.__SAGE_LEGACY_ACTIONS__?.createProject?.(projectName.trim())
        if (typeof note === 'string') setProjectNotice(note)
      } finally {
        setPendingProject(null)
      }
    })()
  }

  const assignProject = (): void => {
    setProjectNotice(null)
    setPendingProject('assign')
    void (async () => {
      try {
        const note = await window.__SAGE_LEGACY_ACTIONS__?.assignProject?.(effectiveProjectRef ?? '')
        if (typeof note === 'string') setProjectNotice(note)
      } finally {
        setPendingProject(null)
      }
    })()
  }

  const unassignProject = (): void => {
    setProjectNotice(null)
    setPendingProject('unassign')
    void (async () => {
      try {
        const note = await window.__SAGE_LEGACY_ACTIONS__?.unassignProject?.()
        if (typeof note === 'string') setProjectNotice(note)
      } finally {
        setPendingProject(null)
      }
    })()
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">ACTION ITEMS · CORRECTIONS · PROJECTS</span><span className="sage-card-index">D6</span></div>
      <h2>行动项、要求更正与项目汇总</h2>
      <p className="sage-card-note">行动项是事项内的可分派工作记录——<strong>不等同交付项、待办请求、工具调用或一次运行</strong>；「标记完成」只是状态变更，不构成交付验收、也不代表执行成功。执行记录冻结登记当时的依据版本。更正以<strong>关联原要求的新消息</strong>表达：原要求原样保留、不重放；回执分已接收／待应用／已生效三态，只有队列的消费读数才显示已生效。归属项目只做分组与汇总：<strong>不改变主责、可见范围或事项事实</strong>；记录只存在于本次运行。本版不做分派给他人、跨项目批量改属或项目级权限继承。</p>
      <p id="action-item-note" className="sage-card-note" role="status" aria-live="polite">{itemNotice ?? payloadItemNote}</p>
      <div className="sage-state-row"><span>新行动项</span><input className="sage-row-input" id="action-item-title" type="text" aria-label="行动项标题" value={itemTitle} onChange={(event) => setItemTitle(event.target.value)} /></div>
      <div className="sage-state-row"><span>说明（可选）</span><input className="sage-row-input" id="action-item-body" type="text" aria-label="行动项说明" value={itemBody} onChange={(event) => setItemBody(event.target.value)} /></div>
      <button className="sage-secondary-button" id="action-item-create" type="button" disabled={pendingCreate} onClick={createItem}>新建行动项（归属所选事项）</button>
      <ul className="sage-roster-list" id="action-item-rows">
        {items.map((entry) => {
          const actionId = typeof entry.actionId === 'string' ? entry.actionId : ''
          if (actionId === '') return null
          return (
            <li key={actionId} className="sage-roster-row" data-action-item-id={actionId} onClick={() => setSelectedActionId(actionId)}>
              <strong>{typeof entry.title === 'string' ? entry.title : actionId}</strong>
              <span className={`sage-roster-tag${entry.state === 'done' ? ' is-ok' : ''}`}>{itemStateCopy(entry.state)}</span>
              <span className="sage-roster-tag">第 {String(entry.revision)} 版 · 记录 {String(Array.isArray(entry.records) ? entry.records.length : 0)} 次</span>
              {entry.state !== 'done' && (
                <button className="sage-row-button" type="button" data-action-item-action="start" disabled={pendingRow === actionId + ':start'} onClick={(event) => { event.stopPropagation(); runRowAction(actionId, 'start') }}>登记一次执行</button>
              )}
              <button className="sage-row-button" type="button" data-action-item-action="complete" disabled={pendingRow === actionId + ':complete'} onClick={(event) => { event.stopPropagation(); runRowAction(actionId, 'complete') }}>标记完成</button>
            </li>
          )
        })}
      </ul>
      <p id="action-record-note" className="sage-card-note">{recordNote}</p>
      <ul className="sage-roster-list" id="action-record-rows">
        {(current === null ? [] : Array.isArray(current.records) ? current.records : []).map((record, index) => {
          const basis = record.basis ?? {}
          return (
            <li key={index} className="sage-roster-row" data-record-no={String(record.recordNo ?? '')}>
              <span className="sage-roster-tag">第 {String(record.recordNo ?? '?')} 次</span>
              <span>依据 第 {String(basis.revision ?? '?')} 版：「{String(basis.title ?? '')}」{typeof basis.note === 'string' && basis.note !== '' ? ' · ' + basis.note : ''}</span>
              <span className="sage-roster-tag">{typeof record.at === 'string' ? record.at : ''}</span>
            </li>
          )
        })}
      </ul>
      <div className="sage-action-correction-block" aria-label="另补要求更正">
        <span className="sage-card-label">CORRECTION · LINKED TO THE ORIGINAL</span>
        <div className="sage-state-row"><span>原要求（已发送消息）</span>
          <select id="correction-original" aria-label="选择原要求" value={effectiveCorrectionIndex < 0 ? 'none' : String(effectiveCorrectionIndex)}
            onChange={(event) => {
              const index = Number.parseInt(event.target.value, 10)
              if (!Number.isSafeInteger(index) || index < 0 || index >= originals.length) return
              setCorrectionIndex(index)
              setCorrectionText(String(originals[index]?.text ?? ''))
            }}>
            {originals.length === 0
              ? <option value="none">（还没有已发送的消息）</option>
              : originals.map((entry, index) => (
                <option key={index} value={String(index)}>{String(entry.text ?? '').length > ORIGINAL_LABEL_LIMIT ? String(entry.text ?? '').slice(0, ORIGINAL_LABEL_LIMIT) + '…' : String(entry.text ?? '')}</option>
              ))}
          </select>
        </div>
        <div className="sage-state-row"><span>更正副本</span><textarea className="sage-draft-input" id="correction-text" rows={3} aria-label="更正副本" value={correctionText} onChange={(event) => setCorrectionText(event.target.value)}></textarea></div>
        <button className="sage-secondary-button" id="correction-submit" type="button" disabled={pendingCorrection} onClick={submitCorrection}>提交更正（关联原要求的新消息）</button>
        <p id="correction-note" className="sage-card-note" role="status" aria-live="polite">{correctionNotice ?? ''}</p>
        <ul className="sage-roster-list" id="correction-rows">
          {corrections.map((entry) => {
            const correctionId = typeof entry.correctionId === 'string' ? entry.correctionId : ''
            if (correctionId === '') return null
            const receiptState = entry.receipt !== null && entry.receipt !== undefined && typeof entry.receipt === 'object' ? entry.receipt.state : undefined
            const original = entry.original ?? {}
            return (
              <li key={correctionId} className="sage-roster-row" data-correction-id={correctionId}>
                <strong>{typeof entry.text === 'string' ? entry.text : correctionId}</strong>
                <span className="sage-roster-tag">关联原要求：「{String(original.text ?? '')}」{typeof original.at === 'string' ? ' · ' + original.at : ''}</span>
                <span className={`sage-roster-tag${receiptState === 'effective' ? ' is-ok' : receiptState === 'refused' ? ' is-blocked' : ''}`}>{receiptText(entry.receipt)}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="sage-action-project-block" aria-label="项目归属与汇总">
        <span className="sage-card-label">PROJECT · GROUPING ONLY</span>
        <div className="sage-state-row"><span>新项目</span><input className="sage-row-input" id="project-name" type="text" aria-label="项目名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} /></div>
        <button className="sage-secondary-button" id="project-create" type="button" disabled={pendingProject === 'create'} onClick={createProject}>新建项目</button>
        <div className="sage-state-row"><span>项目</span>
          <select id="project-select" aria-label="选择项目" value={effectiveProjectRef ?? 'none'} onChange={(event) => setProjectRef(event.target.value)}>
            {projects.length === 0
              ? <option value="none">（还没有项目）</option>
              : projects.map((entry, index) => (
                <option key={index} value={String(entry.projectRef ?? '')}>{String(entry.name ?? entry.projectRef ?? '')}（{String(Array.isArray(entry.matterRefs) ? entry.matterRefs.length : 0)} 个事项）</option>
              ))}
          </select>
        </div>
        <button className="sage-secondary-button" id="project-assign" type="button" disabled={pendingProject === 'assign'} onClick={assignProject}>把所选事项归属到该项目</button>
        <button className="sage-secondary-button" id="project-unassign" type="button" disabled={pendingProject === 'unassign'} onClick={unassignProject}>解除所选事项的项目归属</button>
        <p id="project-note" className="sage-card-note" role="status" aria-live="polite">{projectNotice ?? payloadProjectNote}</p>
        <ul className="sage-roster-list" id="project-rows">
          {projects.map((entry, index) => {
            const projectRefValue = typeof entry.projectRef === 'string' ? entry.projectRef : ''
            if (projectRefValue === '') return null
            const refs = Array.isArray(entry.matterRefs) ? entry.matterRefs : []
            return (
              <li key={index} className="sage-roster-row" data-project-ref={projectRefValue}>
                <strong>{typeof entry.name === 'string' ? entry.name : projectRefValue}</strong>
                <span className="sage-roster-tag">{String(refs.length)} 个事项（引用同一事项记录，复制不了事实）</span>
                <span className="sage-roster-tag">{refs.length > 0 ? refs.map((ref) => String(ref)).join('、') : '（暂无归属事项）'}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
