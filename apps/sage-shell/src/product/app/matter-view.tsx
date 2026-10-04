/**
 * The matter workbench region (ADR-0261, strangler P2): heading + focus card + trace rail.
 *
 * This is the first region the React app owns. It renders exclusively from the bridge store
 * (the legacy script publishes the validated projection and the active view) and it owns the
 * narrow-width trace drawer state machine that used to live in the legacy inline script:
 * open focuses the close button, Escape/Tab stay contained, close restores trigger focus,
 * the media breakpoint and view switches drive the same open/close policy. Every id/ARIA
 * attribute/class the real Electron probes assert is preserved verbatim.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { flushSync } from 'react-dom'

import type { SageActionPreview } from '../action-preview.js'
import type { SageMatterViewState } from '../view-state.js'
import type { MatterRegionMessage, MatterRegionStore } from './matter-bridge.js'

const DRAWER_QUERY = '(max-width: 900px)'

const STAGE_LABELS: Readonly<Record<SageMatterViewState['matter']['stage'], string>> = {
  created: '已创建',
  evidence: '整理证据',
  running: '执行中',
  clarification: '等待澄清',
  'artifact-receipt': '等待回执',
  'failed-retry': '失败待复核',
}

const STAGE_TRACK: ReadonlyArray<SageMatterViewState['matter']['stage']> = [
  'created',
  'evidence',
  'clarification',
  'running',
  'artifact-receipt',
  'failed-retry',
]

const ACTIONABILITY_LABELS: Readonly<Record<SageMatterViewState['actionability'], string>> = {
  allowed: '可提交',
  blocked: '已阻断',
  'requires-confirmation': '需要确认',
}

const ACTION_LABELS: Readonly<Record<SageActionPreview['actionType'], string>> = {
  'create-matter': '创建经营事项',
  'enter-evidence': '录入证据',
  'answer-clarification': '回答澄清',
  approve: '批准',
  reject: '拒绝',
  revoke: '撤销',
  'start-attempt': '开始执行',
  'stop-attempt': '停止执行',
  'retry-attempt': '重试执行',
  'open-artifact': '打开产物',
  'accept-receipt': '接受回执',
  'reject-receipt': '拒绝回执',
  'retry-capability': '重试能力检查',
}

function matchesDrawerQuery(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(DRAWER_QUERY).matches
}

interface TraceEntryView {
  readonly id: string
  readonly lines: readonly string[]
}

interface TraceGroupView {
  readonly count: string
  readonly entries: readonly TraceEntryView[]
  readonly emptyLabel: string
}

interface ActionPreviewView {
  readonly type: SageActionPreview['actionType']
  readonly actionability: SageActionPreview['actionability']
  readonly revisionId: string
  readonly actionScope: string
  readonly denialReason: string
  readonly statesLine: string
}

interface RegionView {
  readonly regionState: string
  readonly projectionLabel: string
  readonly detailId: string
  readonly detailRevision: string
  readonly detailGoal: string
  readonly detailRole: string
  readonly detailStage: string
  readonly currentStage: string
  readonly evidenceCount: string
  readonly unknownCount: string
  readonly dependencyCount: string
  readonly clarification: string
  readonly actionabilityLabel: string
  readonly actionabilityBlocked: boolean
  readonly denial: string
  readonly actionSource: string
  readonly previews: readonly ActionPreviewView[]
  readonly decisions: TraceGroupView
  readonly attempts: TraceGroupView
  readonly artifacts: TraceGroupView
  readonly receipts: TraceGroupView
}

function projectionOf(message: MatterRegionMessage): SageMatterViewState | null {
  return message.kind === 'projection' ? message.projection : null
}

function regionViewOf(message: MatterRegionMessage): RegionView {
  const projection = projectionOf(message)
  if (projection === null) {
    const invalid = message.kind === 'invalid'
    const label = invalid ? 'projection invalid' : 'projection unavailable'
    return {
      regionState: message.kind,
      projectionLabel: label,
      detailId: '—',
      detailRevision: '—',
      detailGoal: invalid ? '事项投影格式无效' : '当前没有可用的事项投影',
      detailRole: '—',
      detailStage: invalid ? '格式无效' : '未读取',
      currentStage: 'unavailable',
      evidenceCount: '—',
      unknownCount: '—',
      dependencyCount: '—',
      clarification: '事项投影不可用，未读取澄清状态。',
      actionabilityLabel: '已阻断',
      actionabilityBlocked: true,
      denial: invalid ? '事项投影格式无效' : '事项投影不可用',
      actionSource: '不提交 · ' + label,
      previews: [],
      decisions: { count: '—', entries: [], emptyLabel: '事项投影不可用，未读取决定。' },
      attempts: { count: '—', entries: [], emptyLabel: '事项投影不可用，未读取执行尝试。' },
      artifacts: { count: '—', entries: [], emptyLabel: '事项投影不可用，未读取产物。' },
      receipts: { count: '—', entries: [], emptyLabel: '事项投影不可用，未读取回执。' },
    }
  }
  const pending = projection.matter.pendingClarification
  return {
    regionState: projection.projectionSource,
    projectionLabel: projection.projectionSource === 'fixture' ? 'fixture projection' : 'live projection',
    detailId: projection.matter.matterId,
    detailRevision: projection.matter.currentRevisionId ?? 'revision pending',
    detailGoal: projection.matter.goal,
    detailRole: projection.matter.responsiblePartyRoleRef,
    detailStage: STAGE_LABELS[projection.matter.stage],
    currentStage: projection.matter.stage,
    evidenceCount: String(projection.matter.evidenceCount),
    unknownCount: String(projection.matter.unknownCount),
    dependencyCount: String(projection.matter.dependencyCount),
    clarification: pending === undefined ? '当前没有待回答澄清。' : pending.reason + ' · ' + pending.requestedAt,
    actionabilityLabel: ACTIONABILITY_LABELS[projection.actionability],
    actionabilityBlocked: projection.actionability === 'blocked',
    denial: projection.denialReason ?? 'none',
    actionSource: '不提交 · ' + projection.projectionSource,
    previews: projection.actions.map((action) => ({
      type: action.type,
      actionability: action.actionability,
      revisionId: action.revisionId ?? '服务接线后确定',
      actionScope: action.actionScope ?? '能力恢复检查',
      denialReason: action.denialReason ?? 'none',
      statesLine: projection.authorizationState + ' · ' + projection.availabilityState + ' · ' + projection.compatibilityOutcome,
    })),
    decisions: {
      count: String(projection.decisions.length),
      emptyLabel: '当前没有决定记录。',
      entries: projection.decisions.map((decision) => ({
        id: decision.decisionId,
        lines: [
          decision.status + ' · ' + decision.revisionId,
          '范围 ' + decision.actionScope,
          decision.expiresAt === undefined ? '未声明到期时间' : '到期 ' + decision.expiresAt,
        ],
      })),
    },
    attempts: {
      count: String(projection.attempts.length),
      emptyLabel: '当前没有执行尝试。',
      entries: projection.attempts.map((attempt) => ({
        id: attempt.attemptId,
        lines: [
          attempt.status + ' · ' + attempt.revisionId,
          '开始 ' + attempt.startedAt,
          attempt.endedAt === undefined ? '尚无结束事实' : '结束 ' + attempt.endedAt,
        ],
      })),
    },
    artifacts: {
      count: String(projection.artifacts.length),
      emptyLabel: '当前没有产物记录。',
      entries: projection.artifacts.map((artifact) => ({
        id: artifact.artifactId,
        lines: [
          artifact.kind + ' · ' + artifact.revisionId,
          '尝试 ' + artifact.attemptId,
          '记录 ' + artifact.recordedAt,
        ],
      })),
    },
    receipts: {
      count: String(projection.receipts.length),
      emptyLabel: '当前没有回执记录。',
      entries: projection.receipts.map((receipt) => ({
        id: receipt.receiptId,
        lines: [
          receipt.verdict + ' · ' + receipt.revisionId,
          '产物 ' + receipt.artifactId,
          '责任角色 ' + receipt.actorRoleRef + ' · ' + receipt.recordedAt,
        ],
      })),
    },
  }
}

function StageTrack({ view }: { readonly view: RegionView }): JSX.Element {
  return (
    <section className="sage-matter-stage-track" id="matter-stage-track" data-current-stage={view.currentStage} aria-labelledby="matter-stage-track-title">
      <div className="sage-matter-stage-track-head"><span className="sage-card-label" id="matter-stage-track-title">MATTER STAGES</span><strong>只标记当前阶段，不表示左侧阶段已完成</strong></div>
      <ol>
        {STAGE_TRACK.map((stage, index) => {
          const current = stage === view.currentStage
          return (
            <li
              key={stage}
              className={`sage-matter-stage-item${current ? ' is-current' : ''}`}
              id={`matter-stage-${stage}`}
              data-matter-stage={stage}
              data-stage-state={current ? 'current' : 'idle'}
              aria-current={current ? 'step' : 'false'}
            >
              <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><strong>{STAGE_LABELS[stage]}</strong>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function TraceGroup({ titleId, title, rowsId, countId, group }: {
  readonly titleId: string
  readonly title: string
  readonly rowsId: string
  readonly countId: string
  readonly group: TraceGroupView
}): JSX.Element {
  return (
    <section className="sage-matter-trace-group" aria-labelledby={titleId}>
      <div className="sage-trace-group-head"><h3 id={titleId}>{title}</h3><span id={countId}>{group.count}</span></div>
      <ol id={rowsId}>
        {group.entries.length === 0
          ? <li className="sage-trace-entry is-empty">{group.emptyLabel}</li>
          : group.entries.map((entry) => (
            <li key={entry.id} className="sage-trace-entry">
              <strong>{entry.id}</strong>
              {entry.lines.map((line) => <span key={line}>{line}</span>)}
            </li>
          ))}
      </ol>
    </section>
  )
}

function ActionPreviewCard({ preview }: { readonly preview: ActionPreviewView }): JSX.Element {
  return (
    <article className="sage-action-preview-card" data-action-preview={preview.type} data-submission-state="not-submitted">
      <div className="sage-action-preview-head"><span className="sage-card-label">ACTION PREVIEW</span><strong>{ACTION_LABELS[preview.type]}</strong></div>
      <div className={`sage-action-preview-state${preview.actionability === 'blocked' ? ' is-blocked' : ''}`}>{ACTIONABILITY_LABELS[preview.actionability]}</div>
      <p className="sage-preview-meta"><span>revision</span><code>{preview.revisionId}</code></p>
      <p className="sage-preview-meta"><span>scope</span><code>{preview.actionScope}</code></p>
      <p className="sage-preview-meta"><span>权限 · 可用性 · 兼容性</span><code>{preview.statesLine}</code></p>
      <p className="sage-preview-denial">阻断原因：<code>{preview.denialReason}</code></p>
      <div className="sage-preview-foot"><span>幂等键：服务接线后生成</span><span className="sage-preview-not-submitted">预览，不提交</span></div>
    </article>
  )
}

export interface MatterRegionProps {
  readonly store: MatterRegionStore
  /** The `#sage-matter-region` container; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function MatterRegion({ store, container }: MatterRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [drawerMode, setDrawerMode] = useState(matchesDrawerQuery)
  const [traceOpen, setTraceOpen] = useState(() => !matchesDrawerQuery())
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const drawerModeRef = useRef(drawerMode)
  drawerModeRef.current = drawerMode
  const lastViewRef = useRef(snapshot.view)
  const view = regionViewOf(snapshot.message)
  const modal = drawerMode && traceOpen

  // The media breakpoint moves the drawer exactly like the legacy listener did.
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return
    const media = globalThis.matchMedia(DRAWER_QUERY)
    setDrawerMode(media.matches)
    const onChange = (): void => {
      setDrawerMode(media.matches)
      setTraceOpen(!media.matches)
    }
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    return undefined
  }, [])

  // View switches mirror the legacy policy: leaving matter closes; entering matter at wide
  // width opens. Narrow width keeps the drawer closed until the user opens it.
  useEffect(() => {
    if (snapshot.view === lastViewRef.current) return
    lastViewRef.current = snapshot.view
    if (snapshot.view !== 'matter') {
      setTraceOpen(false)
      return
    }
    if (!drawerModeRef.current) setTraceOpen(true)
  }, [snapshot.view])

  // Document-level Escape only while the narrow drawer is modal (the rail's own handler
  // stops propagation for events that originate inside it).
  useEffect(() => {
    if (!modal) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setTraceOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [modal])

  useEffect(() => {
    container.setAttribute('data-matter-region-state', view.regionState)
  }, [container, view.regionState])

  // Open/close commit synchronously: the real-window probe reads `data-drawer-open` /
  // `aria-hidden` immediately after dispatching the event, exactly like the legacy inline
  // handler used to write them synchronously inside the event.
  const openTrace = (): void => {
    flushSync(() => {
      setTraceOpen(true)
    })
    closeRef.current?.focus()
  }

  const closeTrace = (restoreFocus: boolean): void => {
    flushSync(() => {
      setTraceOpen(false)
    })
    if (restoreFocus) toggleRef.current?.focus()
  }

  const onRailKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeTrace(true)
      return
    }
    if (event.key !== 'Tab' || !modal) return
    event.preventDefault()
    closeRef.current?.focus()
  }

  return (
    <>
      <div className="sage-section-heading">
        <div><p className="sage-eyebrow">CURRENT OPERATING MATTER</p><h1>经营事项脉络</h1></div>
        <div className="sage-section-tools">
          <span className="sage-fixture-pill" id="matter-panel-source">{view.projectionLabel}</span>
          <button className="sage-secondary-button sage-matter-trace-toggle" id="matter-trace-toggle" type="button" aria-controls="matter-trace-rail" aria-expanded={traceOpen ? 'true' : 'false'} ref={toggleRef} onClick={openTrace}>查看事项脉络</button>
        </div>
      </div>
      <div className="sage-matter-workbench" id="matter-workbench">
        <section className="sage-card sage-matter-workbench-main" id="matter-current-work" data-workbench-region="matter-focus" aria-labelledby="matter-detail-goal">
          <div className="sage-card-head"><span className="sage-card-label">MATTER / <span id="matter-detail-id">{view.detailId}</span></span><span className="sage-card-index" id="matter-detail-revision">{view.detailRevision}</span></div>
          <h2 id="matter-detail-goal">{view.detailGoal}</h2>
          <StageTrack view={view} />
          <div className="sage-matter-facts">
            <div className="sage-state-row"><span>责任角色</span><strong id="matter-detail-role">{view.detailRole}</strong></div>
            <div className="sage-state-row"><span>阶段</span><strong id="matter-detail-stage">{view.detailStage}</strong></div>
          </div>
          <section className="sage-matter-clarification" aria-labelledby="matter-clarification-title">
            <span className="sage-card-label" id="matter-clarification-title">CLARIFICATION</span>
            <p id="matter-clarification">{view.clarification}</p>
          </section>
          <section className="sage-matter-composer" id="matter-readonly-composer" aria-label="只读下一步预览">
            <div className="sage-action-preview-heading"><div><span className="sage-card-label">READ-ONLY ACTION SURFACE</span><h2>下一步动作预览</h2></div><span className="sage-fixture-pill" id="matter-action-source">{view.actionSource}</span></div>
            <p className="sage-card-note">只读 composer：没有输入、提交或执行入口；真实动作仍由 Application Service 与 authority 决定。</p>
            <div className="sage-preview-grid" id="matter-action-previews">
              {view.previews.map((preview) => <ActionPreviewCard key={preview.type} preview={preview} />)}
            </div>
          </section>
        </section>
        <aside
          className={`sage-card sage-matter-trace-rail${traceOpen ? ' is-open' : ''}`}
          id="matter-trace-rail"
          role={modal ? 'dialog' : 'complementary'}
          data-workbench-region="matter-trace"
          data-drawer-open={traceOpen ? 'true' : 'false'}
          data-drawer-modal={modal ? 'true' : 'false'}
          aria-labelledby="matter-trace-title"
          aria-hidden={traceOpen ? 'false' : 'true'}
          aria-modal={modal ? 'true' : 'false'}
          tabIndex={-1}
          onKeyDown={onRailKeyDown}
        >
          <div className="sage-trace-rail-head"><div><span className="sage-card-label">EVIDENCE &amp; EXECUTION TRACE</span><h2 id="matter-trace-title">事实脉络</h2></div><button className="sage-secondary-button sage-matter-trace-close" id="matter-trace-close" type="button" ref={closeRef} onClick={() => closeTrace(true)}>关闭</button></div>
          <div className="sage-matter-metrics" aria-label="事项事实计数">
            <div><strong id="matter-metric-evidence">{view.evidenceCount}</strong><span>证据</span></div>
            <div><strong id="matter-metric-unknown">{view.unknownCount}</strong><span>未知</span></div>
            <div><strong id="matter-metric-dependency">{view.dependencyCount}</strong><span>依赖</span></div>
          </div>
          <div className="sage-trace-state"><span>动作性</span><strong className={view.actionabilityBlocked ? 'is-blocked' : ''} id="matter-detail-actionability">{view.actionabilityLabel}</strong></div>
          <div className="sage-trace-state"><span>阻断原因</span><strong className="is-blocked" id="matter-detail-denial">{view.denial}</strong></div>
          <TraceGroup titleId="matter-decision-title" title="决定" rowsId="matter-decision-rows" countId="matter-decision-count" group={view.decisions} />
          <TraceGroup titleId="matter-attempt-title" title="执行尝试" rowsId="matter-attempt-rows" countId="matter-attempt-count" group={view.attempts} />
          <TraceGroup titleId="matter-artifact-title" title="产物" rowsId="matter-artifact-rows" countId="matter-artifact-count" group={view.artifacts} />
          <TraceGroup titleId="matter-receipt-title" title="回执" rowsId="matter-receipt-rows" countId="matter-receipt-count" group={view.receipts} />
        </aside>
      </div>
    </>
  )
}
