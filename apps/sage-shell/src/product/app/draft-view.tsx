/**
 * Draft card (ADR-0261, strangler P3 / batch 23 — the largest remaining card).
 *
 * Renders `#sage-region-draft` (the `sage-draft-card` article is the React root container): the
 * device-local draft pipeline (send → organize → save → confirm), the identity-driven
 * responsibility default, the creation-attempt entries (reconcile / cancel), the single
 * pre-execution confirmation card, the converted-matters list and the site starting-template
 * panel. The requests, refusal codes and the exit-check unsaved chain stay on the legacy wire —
 * the field values are mirrored there through `__SAGE_APP_SET_DRAFT_FIELDS__`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type DraftEntryView, type DraftRegionMessage } from './bridge.js'

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

/** Module-level so its identity is stable: effects keyed on the message object must not loop. */
const DRAFT_UNAVAILABLE: DraftRegionMessage = { kind: 'unavailable' }

export interface DraftRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-draft` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function DraftRegion({ store, container }: DraftRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<DraftRegionMessage>(snapshot, 'draft', DRAFT_UNAVAILABLE)
  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const drafts: readonly DraftEntryView[] = slot !== null && Array.isArray(slot.drafts) ? slot.drafts : []
  const authStatus = slot !== null && typeof slot.auth?.status === 'string' ? slot.auth.status : 'signed-out'
  const authName = slot !== null && typeof slot.auth?.displayName === 'string' && slot.auth.displayName !== '' ? slot.auth.displayName : null
  const catalog = known
    ? (slot !== null && slot.siteTemplates !== undefined ? slot.siteTemplates : null)
    : (message.kind === 'locked' || message.kind === 'unavailable' ? message.siteTemplates ?? null : null)
  const catalogRead = catalog !== null && catalog.state === 'read'
  const entries = catalogRead && Array.isArray(catalog.entries) ? catalog.entries : []

  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [deliverable, setDeliverable] = useState('')
  const [responsibility, setResponsibility] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const [clarification, setClarification] = useState('')
  const [responsibilityNote, setResponsibilityNote] = useState('')
  const [rawInput, setRawInput] = useState('')
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [resultText, setResultText] = useState('')
  const [templateNotice, setTemplateNotice] = useState<string | null>(null)
  const [historyOverrides, setHistoryOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [pendingCard, setPendingCard] = useState<{ readonly draftId: string, readonly card: Record<string, unknown> } | null>(null)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [cancellingAttempt, setCancellingAttempt] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const lastSeenUpdatedAt = useRef<unknown>(undefined)
  const lastResponsibilityRevision = useRef<string | null>(null)
  const defaultShown = useRef<string | null>(null)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : message.kind === 'locked' ? 'locked' : 'unavailable')
  }, [container, message.kind])

  const current = known
    ? (drafts.find((entry) => entry !== null && typeof entry === 'object' && entry.draftId === currentDraftId) ?? (drafts.length > 0 ? drafts[drafts.length - 1] ?? null : null))
    : null

  // Field re-sync + the identity default, in the legacy order: fields (and clarification) only
  // when the draft actually changed (a save round-trip); the responsibility block also on auth
  // changes, with the same injection/withdrawal guard so live typing is never overwritten.
  useEffect(() => {
    if (current === null || typeof current !== 'object') return
    const stale = current.updatedAt === lastSeenUpdatedAt.current
    lastSeenUpdatedAt.current = current.updatedAt
    const fields = asRecord(current.fields)
    if (!stale) {
      setGoal(typeof fields.goal === 'string' ? fields.goal : '')
      setDeliverable(typeof fields.deliverable === 'string' ? fields.deliverable : '')
      setProjectRef(typeof fields.projectRef === 'string' ? fields.projectRef : '')
      setClarification(typeof current.clarification === 'string' ? current.clarification : '')
      setCurrentDraftId(typeof current.draftId === 'string' ? current.draftId : null)
    }
    const savedResponsibility = typeof fields.responsibility === 'string' ? fields.responsibility : ''
    const revision = String(current.updatedAt) + '|' + authStatus + '|' + String(authName)
    if (!stale || revision !== lastResponsibilityRevision.current) {
      lastResponsibilityRevision.current = revision
      if (savedResponsibility !== '') {
        if (!stale) setResponsibility(savedResponsibility)
        defaultShown.current = null
        setResponsibilityNote('')
      } else {
        const offered = authStatus === 'signed-in' && authName !== null ? authName : null
        if (offered !== null && (responsibility === '' || responsibility === defaultShown.current)) setResponsibility(offered)
        if (offered === null && responsibility === defaultShown.current && responsibility !== '') setResponsibility('')
        defaultShown.current = offered
        setResponsibilityNote(offered !== null
          ? '责任默认：当前登录身份「' + offered + '」——来自 main 的登录投影，可改；随「保存草案」落盘；改责任值不改变任何权限判定。'
          : authStatus === 'pending'
            ? '未就绪：登录进行中——完成前不填默认责任（不用占位身份）。'
            : authStatus === 'signed-in'
              ? '已认证：身份显示名未提供——责任默认值不伪造（可手动填写）。'
              : '未认证：责任字段没有默认值——登录后自动填入当前身份（不用占位身份填充）。')
      }
    }
  }, [current, authStatus, authName, responsibility])

  // Mirror the five live field values for the exit-check's unsaved chain (a legacy-side read).
  useEffect(() => {
    window.__SAGE_APP_SET_DRAFT_FIELDS__?.({ goal, deliverable, responsibility, projectRef, clarification })
  }, [goal, deliverable, responsibility, projectRef, clarification])

  // History overrides live until the next projection message (the legacy re-render cleared them).
  useEffect(() => {
    setHistoryOverrides(new Map())
  }, [message])

  // A converted draft leaves no card to confirm (the pending card must not stay dangling).
  useEffect(() => {
    if (current !== null && current.status === 'converted' && pendingCard !== null && pendingCard.draftId === current.draftId) {
      setPendingCard(null)
    }
  }, [current, pendingCard])

  const attemptState = current !== null ? text(asRecord(current.attempt).state, '') || null : null
  const pendingForCurrent = current !== null && pendingCard !== null && typeof current.draftId === 'string' && pendingCard.draftId === current.draftId
  const showConfirmation = pendingForCurrent && pendingCard !== null && pendingCard.card !== null && typeof pendingCard.card === 'object'

  const create = (): void => {
    const trimmed = rawInput.trim()
    if (trimmed === '') {
      setDraftNotice('先写一句需求再发送。')
      return
    }
    setDraftNotice(null)
    setCreating(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.sendDraft?.(trimmed)
        if (typeof notice === 'string') setDraftNotice(notice)
      } finally {
        setCreating(false)
      }
    })()
  }

  const save = (): void => {
    if (current === null || typeof current.draftId !== 'string' || current.draftId === '') return
    const selectedEntryIds = (Array.isArray(current.history) ? current.history : [])
      .filter((entry) => {
        const id = typeof entry.entryId === 'string' ? entry.entryId : ''
        if (id === '') return false
        const override = historyOverrides.get(id)
        return override !== undefined ? override : entry.selected === true
      })
      .map((entry) => String(entry.entryId))
    setSaving(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.saveDraft?.(String(current.draftId), { goal, deliverable, responsibility, projectRef }, clarification, selectedEntryIds)
      } finally {
        setSaving(false)
      }
    })()
  }

  const reconcile = (): void => {
    if (current === null || typeof current.draftId !== 'string' || current.draftId === '') return
    setReconciling(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.reconcileDraft?.(String(current.draftId))
      } finally {
        setReconciling(false)
      }
    })()
  }

  const cancelAttempt = (): void => {
    if (current === null || typeof current.draftId !== 'string' || current.draftId === '') return
    setCancellingAttempt(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.cancelDraftAttempt?.(String(current.draftId))
      } finally {
        setCancellingAttempt(false)
      }
    })()
  }

  const prepareConfirm = (): void => {
    if (current === null || typeof current.draftId !== 'string' || current.draftId === '' || confirmDisabled) return
    setDraftNotice(null)
    setResultText('正在生成执行前确认卡……')
    setPreparing(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.prepareDraftConfirm?.(String(current.draftId))
        if (result === undefined || result === null) return
        if (result.kind === 'prepared' && result.card !== null && typeof result.card === 'object') {
          setPendingCard({ draftId: String(current.draftId), card: result.card })
        } else if (result.kind === 'notice' && typeof result.notice === 'string') {
          setDraftNotice(result.notice)
        }
      } finally {
        setPreparing(false)
        setResultText('')
      }
    })()
  }

  const executeConvert = (): void => {
    const pending = pendingCard
    if (pending === null) return
    const confirmationId = typeof pending.card.confirmationId === 'string' ? pending.card.confirmationId : ''
    // One confirmation only ever redeems one dispatch: the card never stays dangling.
    setPendingCard(null)
    if (confirmationId === '') return
    setDraftNotice(null)
    setResultText('正在确认……')
    setExecuting(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.executeDraftConvert?.(pending.draftId, confirmationId)
        if (result !== undefined && result !== null && result.kind === 'notice' && typeof result.notice === 'string') setDraftNotice(result.notice)
      } finally {
        setExecuting(false)
        setResultText('')
      }
    })()
  }

  const useTemplate = (templateId: string): void => {
    const entry = entries.find((candidate) => candidate !== null && typeof candidate === 'object' && candidate.templateId === templateId)
    if (entry === undefined || typeof entry.prompt !== 'string' || entry.prompt === '') return
    setRawInput((existing) => existing.trim() === '' ? entry.prompt as string : existing + '\n\n' + entry.prompt)
    setTemplateNotice('模板「' + String(entry.name) + '」（来源：' + String(entry.source) + ' · 版本：' + String(entry.version) + '）已填入草案输入（可编辑）——选模板不等于已建站或已发布，也不写任何配置。')
  }

  const lockText = message.kind === 'locked' ? '已锁定（登出期间不读取、不写入）'
    : !known ? '未核验：这一版还没有接上草案存储'
      : '本次运行内已解锁（设备本地，' + String(drafts.length) + ' 份草案）'
  const draftNote = draftNotice ?? (message.kind === 'locked' ? '登出状态下草案保持加密锁定；重新登录并获准后才会恢复显示。'
    : !known ? '' : current === null ? '还没有草案：在上面的输入框里写下需求并发送。' : '')
  const currentComplete = current !== null && current.complete === true
  const currentConverted = current !== null && current.status === 'converted'
  const blockedByAttempt = attemptState === 'pending' || attemptState === 'unknown'
  const confirmDisabled = !known || current === null || !currentComplete || currentConverted || blockedByAttempt || pendingForCurrent
  const confirmLabel = currentConverted ? '已建项（不重复创建）'
    : attemptState === 'unknown' ? '结果未知期间不重复建项'
      : pendingForCurrent ? '待确认：见下方执行前确认卡' : '确认建项'
  const attemptNote = attemptState === 'pending'
    ? '创建中：请求已发出，结果还没回来。可以继续等待，或取消这次未提交的确认（草案内容不会丢）。'
    : attemptState === 'unknown'
      ? '结果未知：这次建项可能已经生效。请用「核对同一请求」确认状态——不要重复建项。'
      : attemptState === 'failed'
        ? '确定失败：这次建项没有生效（可回下面的字段修正后再次确认）。'
        : ''
  const history = current !== null && Array.isArray(current.history) ? current.history : []
  const historyNote = history.length === 0 ? '还没有前史。' : '前史默认不随建项带走；勾选的片段才会进入创建请求，未勾选的留在本地草案里可回看。'
  const convertedMatters = drafts.filter((entry) => entry !== null && typeof entry === 'object' && entry.status === 'converted' && typeof entry.matterRef === 'string' && entry.matterRef !== '')
  const convertedResult = currentConverted && typeof current?.matterRef === 'string' && current.matterRef !== ''
    ? '已建项：' + current.matterRef + '（来自服务回执，不是本地编号）。'
    : ''
  const templateNote = templateNotice ?? (catalog === null || catalog.state !== 'read'
    ? '未核验：模板目录不可用（' + String(catalog?.reason ?? 'site-templates-provider-unavailable') + '）；不以空列表冒充，也不静默替换。'
    : entries.length === 0
      ? '模板目录可读，但当前没有条目（不把可读的空目录说成"没有模板源"）。'
      : '共 ' + String(entries.length) + ' 项（来源与版本见行内）；选择只填入本次草案输入，不建站、不写配置。')

  const card = showConfirmation && pendingCard !== null ? pendingCard.card : null
  const cardTarget = card !== null ? asRecord(card.target) : {}
  const cardAction = card !== null ? asRecord(card.action) : {}
  const cardResources = card !== null && Array.isArray(card.resources) ? card.resources : []
  const cardPrereqs = card !== null && Array.isArray(card.prerequisites) ? card.prerequisites : []
  const cardCost = card !== null ? asRecord(card.costEstimate) : {}

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">DRAFT · DEVICE-LOCAL</span><span className="sage-card-index">D1</span></div>
      <h2>首页输入 → 草案整理 → 建项确认</h2>
      <p className="sage-card-note">草案只保存在当前设备：登出后加密锁定、期间不读不写，不自动同步、不换机接续。目标、交付、责任三项必填；项目可选且最多一个。整理只把输入留作前史，<strong>不会自动写入交付或责任</strong>。</p>
      <div className="sage-state-row"><span>草案状态</span><strong id="draft-lock" data-draft-fact>{lockText}</strong></div>
      <span className="sage-card-label">站点起步模板（只读：名称与来源；选择只填入本次草案输入——不建站、不写配置、无远端效果）</span>
      <p id="site-template-note" className="sage-card-note" role="status" aria-live="polite">{templateNote}</p>
      <ul className="sage-roster-list" id="site-template-rows">
        {(catalogRead ? entries : []).map((entry) => {
          const templateId = typeof entry.templateId === 'string' ? entry.templateId : ''
          if (templateId === '' || typeof entry.name !== 'string') return null
          const hasPrompt = typeof entry.prompt === 'string' && entry.prompt !== ''
          return (
            <li key={templateId} className="sage-roster-row" data-site-template-row={templateId}>
              <strong>{entry.name}</strong>
              <span className="sage-roster-tag">{'来源：' + String(entry.source ?? '未标注') + ' · 版本：' + String(entry.version ?? '未标注')}</span>
              {hasPrompt
                ? <button className="sage-row-button" type="button" data-site-template-use={templateId} onClick={() => useTemplate(templateId)}>使用（填入草案输入）</button>
                : <span className="sage-roster-tag">提示词未接线（本入口不可用；不代表模板已失效）</span>}
              <button className="sage-row-button" type="button" disabled>预览（未接线）</button>
            </li>
          )
        })}
      </ul>
      <textarea className="sage-draft-input" id="draft-input" rows={2} aria-label="输入你的需求" value={rawInput} onChange={(event) => setRawInput(event.target.value)} />
      <button className="sage-secondary-button" id="draft-send" type="button" disabled={!known || creating} onClick={create}>发送并形成草案</button>
      <p id="draft-note" className="sage-card-note" role="status" aria-live="polite">{draftNote}</p>
      <div id="draft-detail" hidden={!known || current === null}>
        <div className="sage-state-row"><span>目标（必填）</span><input className="sage-row-input" id="draft-goal" type="text" aria-label="目标" value={goal} onChange={(event) => setGoal(event.target.value)} /></div>
        <div className="sage-state-row"><span>预期交付（必填）</span><input className="sage-row-input" id="draft-deliverable" type="text" aria-label="预期交付" value={deliverable} onChange={(event) => setDeliverable(event.target.value)} /></div>
        <div className="sage-state-row"><span>责任（必填）</span><input className="sage-row-input" id="draft-responsibility" type="text" aria-label="责任" value={responsibility} onChange={(event) => setResponsibility(event.target.value)} /></div>
        <p id="draft-responsibility-note" className="sage-card-note" role="status" aria-live="polite">{responsibilityNote}</p>
        <div className="sage-state-row"><span>项目（可选，最多一个）</span><input className="sage-row-input" id="draft-project" type="text" aria-label="项目" value={projectRef} onChange={(event) => setProjectRef(event.target.value)} /></div>
        <div className="sage-state-row"><span>澄清（可选）</span><textarea className="sage-draft-input" id="draft-clarification" rows={2} aria-label="澄清" value={clarification} onChange={(event) => setClarification(event.target.value)} /></div>
        <button className="sage-secondary-button" id="draft-save" type="button" disabled={saving || currentConverted} onClick={save}>保存草案</button>
        <ul className="sage-roster-list" id="draft-history">
          {history.map((entry) => {
            const entryId = typeof entry.entryId === 'string' ? entry.entryId : ''
            if (entryId === '') return null
            const override = historyOverrides.get(entryId)
            const checked = override !== undefined ? override : entry.selected === true
            return (
              <li key={entryId} className="sage-roster-row" data-history-entry-id={entryId}>
                <input
                  type="checkbox"
                  className="sage-history-toggle"
                  data-history-toggle={entryId}
                  aria-label="随建项附入这段前史"
                  checked={checked}
                  onChange={(event) => {
                    const next = new Map(historyOverrides)
                    next.set(entryId, event.target.checked)
                    setHistoryOverrides(next)
                  }}
                />
                <span>{typeof entry.text === 'string' ? entry.text : ''}</span>
              </li>
            )
          })}
        </ul>
        <p id="draft-history-note" className="sage-card-note">{historyNote}</p>
        <button className="sage-primary-button" id="draft-confirm" type="button" disabled={confirmDisabled || preparing} onClick={prepareConfirm}>{confirmLabel}</button>
        <p id="draft-attempt" className="sage-card-note" role="status" aria-live="polite">{attemptNote}</p>
        <button className="sage-secondary-button" id="draft-reconcile" type="button" hidden={attemptState !== 'unknown'} disabled={reconciling} onClick={reconcile}>核对同一请求</button>
        <button className="sage-secondary-button" id="draft-cancel" type="button" hidden={attemptState !== 'pending'} disabled={cancellingAttempt} onClick={cancelAttempt}>取消未提交的确认</button>
        <div className="sage-draft-confirmation" id="draft-confirmation" role="group" aria-label="执行前确认（单张卡）" hidden={!showConfirmation}>
          <p className="sage-draft-confirmation-title">执行前确认 · 单张卡</p>
          <ul className="sage-draft-confirmation-facts">
            <li>对象：<span id="confirm-target">{card === null ? '—' : String(cardTarget.matterRef ?? '—') + '（修订 ' + String(cardTarget.revisionRef ?? '—') + '）'}</span></li>
            <li>动作：<span id="confirm-action">{card === null ? '—' : String(cardAction.type ?? '—')}</span></li>
            <li>范围：<span id="confirm-scope">{card === null ? '—' : cardAction.scope === 'matter' ? '整个事项（matter）' : '本修订（revision）'}</span></li>
            <li>资源：<span id="confirm-resources">{card === null ? '—' : cardResources.length === 0 ? '无' : cardResources.map((entry) => {
              const item = asRecord(entry)
              const ref = typeof item.ref === 'string' && item.ref !== '' ? item.ref : '未选定'
              return String(item.kind ?? '资源') + '：' + ref
            }).join('；')}</span></li>
            <li>时间：<span id="confirm-time">{card === null ? '—' : typeof card.preparedAt === 'string' ? card.preparedAt : '—'}</span></li>
            <li>前提：<span id="confirm-prerequisites">{card === null ? '—' : cardPrereqs.length === 0 ? '无附加前提' : cardPrereqs.map((entry) => {
              const item = asRecord(entry)
              const wording = item.state === 'met' ? '已满足' : item.state === 'unmet' ? '未满足' : '未断言（派发前逐次重验）'
              return String(item.name ?? '前提') + '：' + wording
            }).join('；')}</span></li>
            <li>费用影响预估：<span id="confirm-cost">{card === null ? '—' : cardCost.state === 'estimate' ? String(cardCost.amount) + ' ' + String(cardCost.currency) : '暂不可得（本版没有费用预估来源——不冒充数字）'}</span></li>
          </ul>
          <p className="sage-card-note" id="confirm-note" role="status" aria-live="polite">确认只兑现这次派发的必要条件；确认不等于外部效果已发生——结果按回执三态呈现。范围、前提或版本变化会使确认失效，需要重新确认。</p>
          <button className="sage-primary-button" id="draft-confirm-execute" type="button" disabled={executing} onClick={executeConvert}>确认执行</button>
          <button className="sage-secondary-button" id="draft-confirm-cancel" type="button" onClick={() => setPendingCard(null)}>取消确认</button>
        </div>
        <p id="draft-result" className="sage-card-note" role="status" aria-live="polite">{resultText !== '' ? resultText : convertedResult}</p>
        <ul className="sage-roster-list" id="draft-matters">
          {convertedMatters.map((entry) => (
            <li key={String(entry.matterRef)} className="sage-roster-row" data-matter-ref={String(entry.matterRef)}>
              <strong>{typeof asRecord(entry.fields).goal === 'string' && asRecord(entry.fields).goal !== '' ? String(asRecord(entry.fields).goal) : String(entry.matterRef)}</strong>
              <span className="sage-roster-tag">{'回执 ' + String(entry.matterRef)}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
