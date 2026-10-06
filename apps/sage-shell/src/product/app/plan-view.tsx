/**
 * Plan card (ADR-0261, strangler P3 / batch 19).
 *
 * Renders `#sage-region-plans` (the `sage-plan-card` article is the React root container). The
 * plan deliverable keeps acceptance and dispatch apart: the candidate rows, the per-step
 * readiness roster, the single step-execution confirmation card and the result sentence live
 * here; the create/accept/prepare/execute requests, their refusal codes and the link-card
 * selection reads stay on the legacy wire through the down-bridge.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type PlanRowView, type PlanStepView, type PlansRegionMessage } from './bridge.js'

interface PendingStep {
  readonly planId: string
  readonly stepNo: number
  readonly card: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function resourceText(card: Record<string, unknown>): string {
  const resources = Array.isArray(card.resources) ? card.resources : []
  if (resources.length === 0) return '无'
  return resources
    .map((entry) => {
      const record = asRecord(entry)
      return String(record.kind ?? '资源') + '：' + (typeof record.ref === 'string' && record.ref !== '' ? record.ref : '未选定')
    })
    .join('；')
}

function prerequisiteText(card: Record<string, unknown>): string {
  const prerequisites = Array.isArray(card.prerequisites) ? card.prerequisites : []
  if (prerequisites.length === 0) return '无附加前提'
  return prerequisites
    .map((entry) => {
      const record = asRecord(entry)
      return String(record.name ?? '前提') + '：' + (record.state === 'met' ? '已满足' : '未断言（派发前逐次重验）')
    })
    .join('；')
}

/** The step-run sentence cascade; the projection is the readout, local notices win first. */
function runText(run: unknown): string {
  if (run === null || run === undefined || typeof run !== 'object') return ''
  const record = run as { state?: unknown, code?: unknown }
  if (record.state === 'settled') return '该项已结算（完成的是这一步本身）：' + String(record.code ?? '（回执已在结果面）') + '——接受方案不等于执行方案，步骤结算也不等于整份方案完成。'
  if (record.state === 'not-ready') return '步骤执行未接线（' + String(record.code) + '）：没有伪造运行，也不消耗确认。'
  if (record.state === 'unknown') return '步骤结果未知（' + String(record.code) + '）：可能已发生——不要盲目重放，先核对。'
  if (record.code === 'confirmation-required') return '这次派发缺少执行前确认：请先展开步骤确认卡。'
  if (record.code === 'confirmation-consumed') return '这次确认已经用过了：一次确认只兑现一次派发，请重新准备。'
  if (record.code === 'confirmation-stale') return '确认已失效：动作、前提或版本已变化——请重新准备。'
  if (record.code === 'step-premise-unknown') return '前提未知：按阻断处理，旧的确认卡已作废，请重新准备。'
  if (record.code === 'step-not-ready') return '步骤未就绪：按阻断处理，未派发。'
  return '步骤被拒绝（' + String(record.code) + '）。'
}

export interface PlanRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-plans` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function PlanRegion({ store, container }: PlanRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<PlansRegionMessage>(snapshot, 'plans', { kind: 'unavailable' })
  const [localNotice, setLocalNotice] = useState<string | null>(null)
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [stepsText, setStepsText] = useState('')
  const [creating, setCreating] = useState(false)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [preparingStepNo, setPreparingStepNo] = useState<number | null>(null)
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null)
  const [stepNotice, setStepNotice] = useState<string | null>(null)
  const [stepRunOverride, setStepRunOverride] = useState<unknown>(undefined)
  const [executing, setExecuting] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const plans: readonly PlanRowView[] = slot !== null && Array.isArray(slot.plans) ? slot.plans : []
  const current = plans.find((entry) => entry !== null && typeof entry === 'object' && entry.planId === currentPlanId)
    ?? (plans.length > 0 ? plans[plans.length - 1] ?? null : null)
  const note = localNotice ?? (!known ? '未核验：这一版还没有接上方案存储。'
    : current === null ? '还没有方案：写下标题与步骤（每行一条）形成方案。' : '')
  const projectionRun = slot !== null ? slot.lastStepRun ?? null : null
  const resultText = stepNotice ?? runText(projectionRun ?? stepRunOverride)

  const create = (): void => {
    setLocalNotice(null)
    setCreating(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.createPlan?.(title, stepsText)
        if (typeof notice === 'string') setLocalNotice(notice)
      } finally {
        setCreating(false)
      }
    })()
  }

  const accept = (planId: string): void => {
    setAcceptingId(planId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.acceptPlan?.(planId)
      } finally {
        setAcceptingId(null)
      }
    })()
  }

  const prepare = (planId: string, stepNo: number): void => {
    setStepNotice(null)
    setStepRunOverride(undefined)
    setPreparingStepNo(stepNo)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.prepareStep?.(planId, stepNo)
        if (result === undefined || result === null) return
        if (result.kind === 'prepared' && result.card !== null && typeof result.card === 'object') {
          setPendingStep({ planId, stepNo, card: result.card })
        } else if (result.kind === 'notice' && typeof result.notice === 'string') {
          setStepNotice(result.notice)
        }
      } finally {
        setPreparingStepNo(null)
      }
    })()
  }

  const cancel = (): void => {
    setPendingStep(null)
    setStepNotice(null)
    setStepRunOverride(undefined)
  }

  const execute = (): void => {
    const pending = pendingStep
    if (pending === null) return
    const confirmationId = typeof pending.card.confirmationId === 'string' ? pending.card.confirmationId : ''
    setPendingStep(null)
    setStepRunOverride(undefined)
    if (confirmationId === '') return
    setExecuting(true)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.executeStep?.(pending.planId, pending.stepNo, confirmationId)
        if (result === undefined || result === null || result.kind === 'quiet') return
        if (result.kind === 'run') {
          setStepNotice(null)
          setStepRunOverride(result.run ?? null)
        } else if (result.kind === 'notice' && typeof result.notice === 'string') {
          setStepNotice(result.notice)
        } else {
          setStepNotice(null)
        }
      } finally {
        setExecuting(false)
      }
    })()
  }

  const card = pendingStep !== null ? pendingStep.card : null
  const target = card !== null ? asRecord(card.target) : {}
  const cardAction = card !== null ? asRecord(card.action) : {}
  const currentId = current !== null && typeof current.planId === 'string' ? current.planId : null

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">PLAN · DELIVERABLE · STEP READINESS</span><span className="sage-card-index">D9</span></div>
      <h2>方案预览、步骤就绪与执行确认</h2>
      <p className="sage-card-note">方案是本次交付：<strong>接受方案不等于执行方案</strong>——接受只记录回执，不派发、不铸确认卡、不碰会话。执行必须针对<strong>明确动作</strong>：每个步骤先「准备执行确认卡」（单张卡，衔接执行前确认）；确认执行才携带一次性凭据派发。步骤就绪按<strong>动作前提</strong>显示——<strong>安全或权限未知呈现为阻断而非失败，且不就绪项不被派发</strong>（不显示执行入口）。</p>
      <div className="sage-state-row"><span>方案标题</span><input className="sage-row-input" id="plan-title" type="text" aria-label="方案标题" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
      <div className="sage-state-row"><span>步骤（每行一条）</span><textarea className="sage-draft-input" id="plan-steps" rows={3} aria-label="方案步骤" value={stepsText} onChange={(event) => setStepsText(event.target.value)} /></div>
      <button className="sage-secondary-button" id="plan-create" type="button" disabled={creating} onClick={create}>形成方案（归属所选事项）</button>
      <p id="plan-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="plan-rows">
        {plans.map((entry) => {
          const planId = typeof entry.planId === 'string' ? entry.planId : ''
          if (planId === '') return null
          const accepted = entry.state === 'accepted'
          return (
            <li key={planId} className="sage-roster-row" data-plan-id={planId} onClick={() => setCurrentPlanId(planId)}>
              <strong>{typeof entry.title === 'string' ? entry.title : planId}</strong>
              <span className={'sage-roster-tag ' + (accepted ? 'is-ok' : '')}>
                {accepted ? '已接受（回执 ' + String(entry.acceptedAt ?? '') + '；接受≠执行）' : '草稿'}
              </span>
              <span />
              {!accepted && (
                <button
                  className="sage-row-button"
                  type="button"
                  data-plan-action="accept"
                  disabled={acceptingId === planId}
                  onClick={(event) => { event.stopPropagation(); accept(planId) }}
                >接受方案（只记回执）</button>
              )}
            </li>
          )
        })}
      </ul>
      <div id="plan-step-detail" hidden={!known || current === null}>
        <p id="plan-step-note" className="sage-card-note">
          {current === null ? '' : '「' + String(current.title) + '」的步骤（就绪按动作前提判断；未就绪或未知=阻断，不显示执行入口）：'}
        </p>
        <ul className="sage-roster-list" id="plan-step-rows">
          {current !== null && currentId !== null && Array.isArray(current.steps)
            ? current.steps.map((step: PlanStepView) => {
                const stepNo = step !== null && typeof step === 'object' && typeof step.stepNo === 'number' ? step.stepNo : null
                if (stepNo === null) return null
                const ready = step.readiness === 'ready'
                return (
                  <li key={String(stepNo)} className="sage-roster-row" data-plan-step-no={String(stepNo)}>
                    <span className="sage-roster-tag">{'步骤 ' + String(stepNo)}</span>
                    <strong>{typeof step.title === 'string' ? step.title : ''}</strong>
                    <span className={'sage-roster-tag ' + (ready ? 'is-ok' : 'is-blocked')}>
                      {ready ? '就绪' : step.readiness === 'not-ready' ? '未就绪（阻断——不派发）' : '未知（阻断——不派发）'}
                    </span>
                    <span>{typeof step.readinessNote === 'string' ? step.readinessNote : ''}</span>
                    {ready && (
                      <button
                        className="sage-row-button"
                        type="button"
                        data-plan-action="prepare-step"
                        data-step-no={String(stepNo)}
                        disabled={preparingStepNo === stepNo}
                        onClick={() => prepare(currentId, stepNo)}
                      >准备执行确认卡</button>
                    )}
                  </li>
                )
              })
            : null}
        </ul>
        <div className="sage-draft-confirmation" id="plan-step-card" role="group" aria-label="步骤执行确认（单张卡）" hidden={pendingStep === null}>
          <p className="sage-draft-confirmation-title">执行前确认 · 单张卡（步骤）</p>
          <ul className="sage-draft-confirmation-facts">
            <li>对象：<span id="plan-step-target">{pendingStep === null ? '—' : String(target.matterRef ?? '—') + '（步骤 ' + String(pendingStep.stepNo) + ' · ' + String(target.revisionRef ?? '') + '）'}</span></li>
            <li>动作：<span id="plan-step-action">{pendingStep === null ? '—' : String(cardAction.type ?? '—')}</span></li>
            <li>范围：<span id="plan-step-scope">{pendingStep === null ? '—' : cardAction.scope === 'matter' ? '整个事项（matter）' : '本修订（revision）'}</span></li>
            <li>资源：<span id="plan-step-resources">{card === null ? '—' : resourceText(card)}</span></li>
            <li>时间：<span id="plan-step-time">{card === null ? '—' : typeof card.preparedAt === 'string' ? card.preparedAt : '—'}</span></li>
            <li>前提：<span id="plan-step-prereq">{card === null ? '—' : prerequisiteText(card)}</span></li>
            <li>费用影响预估：<span id="plan-step-cost">{card === null ? '—' : '暂不可得（本版没有费用预估来源——不冒充数字）'}</span></li>
          </ul>
          <p className="sage-card-note">确认只兑现这次派发的必要条件；确认不等于效果已发生——结果按回执三态呈现。</p>
          <button className="sage-primary-button" id="plan-step-execute" type="button" disabled={executing} onClick={execute}>确认执行（携带凭据）</button>
          <button className="sage-secondary-button" id="plan-step-cancel" type="button" onClick={cancel}>取消确认</button>
        </div>
        <p id="plan-step-result" className="sage-card-note" role="status" aria-live="polite">{resultText}</p>
      </div>
    </>
  )
}
