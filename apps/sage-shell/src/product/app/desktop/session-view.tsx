import { useEffect, useRef, useState, type ReactNode } from 'react'

import { MarkdownText } from '../markdown.js'
import type { DesktopArtifacts } from './client.js'
import type { DesktopApprovals, DesktopModelQueue, DesktopPendingItem, DesktopQueue, DesktopTurnProcess } from './session.js'
import type { SessionControlResult } from './session-controls.js'

export interface DesktopSessionViewProps {
  readonly title: string
  readonly execution: 'idle' | 'executing'
  readonly lastTurnEnd: string | null
  readonly paused: boolean
  readonly streamBroken: boolean
  readonly messages: readonly { role: 'user' | 'assistant'; text: string }[]
  /** ADR-0298: the live delta text while the turn executes (null when nothing is streaming). */
  readonly streaming?: string | null
  /** ADR-0301: the last turn's process facts (footer + live file activity). */
  readonly turnProcess?: DesktopTurnProcess
  /** ADR-0313: the session-control surfaces (S03/S05/S06/S07). */
  readonly approvals?: DesktopApprovals | null
  readonly modelQueue?: DesktopModelQueue | null
  readonly pending?: readonly DesktopPendingItem[]
  readonly queue?: DesktopQueue
  readonly onApprovalAnswer?: (requestId: string, outcome: 'allowed-once' | 'rejected') => Promise<SessionControlResult>
  readonly onApprovalWithdraw?: (requestId: string) => Promise<SessionControlResult>
  readonly onPendingChange?: (action: { readonly kind: 'edit', readonly itemId: string, readonly text: string } | { readonly kind: 'remove', readonly itemId: string }) => Promise<SessionControlResult>
  readonly onQueueChange?: (action: { readonly kind: 'edit', readonly itemId: string, readonly text: string } | { readonly kind: 'remove', readonly itemId: string }) => Promise<SessionControlResult>
  readonly onVerifyQueue?: () => void
  /** ADR-0300: the artifact cards and the one side-preview state (absent = slot omitted). */
  readonly artifacts?: DesktopArtifacts
  readonly onArtifactOpen?: (artifactId: string) => void
  readonly onArtifactRetry?: () => void
  readonly onArtifactClose?: () => void
  readonly onArtifactFullscreen?: (on: boolean) => void
  readonly onArtifactWindow?: (action: 'open' | 'close') => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes}m${seconds}s`
}

// The service's scheduled delay is a fact: only whole seconds collapse, everything else keeps
// its exact value (500ms is 0.5s — never rounded to 1s, never to 0s).
function formatDelayMs(ms: number): string {
  return ms % 1000 === 0 ? `${ms / 1000}s` : `${(ms / 1000).toFixed(1)}s`
}

const TOOL_VERB: Record<string, string> = { write: '写入', edit: '编辑', apply_patch: '编辑' }

/** ADR-0301: the live file activity row — elapsed counts from the moment Sage observed the run. */
function LiveProcessRow({ item }: { readonly item: DesktopTurnProcess['fileWrites'][number] }): ReactNode {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  return <div className="process-live" role="status">
    正在{TOOL_VERB[item.name] ?? item.name} {item.file ?? '文件'}… · {elapsed}s
  </div>
}

/** ADR-0302: one bounded hunk rendered as removed/added lines (red/green, monospace). */
function DiffHunk({ hunk, index }: {
  readonly hunk: DesktopTurnProcess['fileWrites'][number]['hunks'][number]
  readonly index: number
}): ReactNode {
  return <div className="diff-hunk" key={index}>
    {hunk.old !== null
      ? <pre className="diff-old">{hunk.old.split('\n').map((line, lineIndex) => <div key={lineIndex}>{`- ${line}`}</div>)}</pre>
      : null}
    {hunk.new !== null
      ? <pre className="diff-new">{hunk.new.split('\n').map((line, lineIndex) => <div key={lineIndex}>{`+ ${line}`}</div>)}</pre>
      : null}
  </div>
}

/** ADR-0301: the settled turn's footer — outcome, duration, iterations and the file list.
 *  ADR-0302 adds the round's change summary and the review surface (审阅 opens the same list). */
export function TurnProcessFooter({ lastTurnEnd, turnProcess }: {
  readonly lastTurnEnd: string
  readonly turnProcess: DesktopTurnProcess
}): ReactNode {
  const [open, setOpen] = useState(false)
  const label = lastTurnEnd === 'completed' ? '已完成'
    : lastTurnEnd === 'error' ? '回合失败'
      : lastTurnEnd === 'aborted' ? '已停止'
        : lastTurnEnd === 'blocked' ? '被阻断结束'
          : '本轮已结束'
  const meta: string[] = []
  if (turnProcess.durationMs !== null && lastTurnEnd !== 'error' && lastTurnEnd !== 'aborted') {
    meta.push(`耗时 ${formatDuration(turnProcess.durationMs)}`)
  }
  if (turnProcess.iterations !== null) meta.push(`${turnProcess.iterations} 步`)
  const changed = turnProcess.fileWrites.filter((item) => item.added !== null || item.removed !== null)
  const fileCount = new Set(turnProcess.fileWrites.map((item) => item.file).filter((file): file is string => file !== null)).size
  const addedTotal = changed.reduce((sum, item) => sum + (item.added ?? 0), 0)
  const removedTotal = changed.reduce((sum, item) => sum + (item.removed ?? 0), 0)
  return <div className="turn-process" data-turn-end={lastTurnEnd}>
    <span className="turn-process-label" role="status">{label}{meta.length === 0 ? '' : ` · ${meta.join(' · ')}`}</span>
    {changed.length > 0
      ? <span className="turn-process-summary">
        本轮文件修改摘要：{fileCount} 个文件 · +{addedTotal}/-{removedTotal}
        {' '}
        <button className="text-button" aria-label="审阅本轮修改" onClick={() => setOpen((value) => !value)}>审阅</button>
      </span>
      : null}
    {turnProcess.fileWrites.length > 0
      ? <div className="turn-process-files">
        <button className="text-button" aria-label="执行过程" onClick={() => setOpen((value) => !value)}>执行过程（{turnProcess.fileWrites.length}）</button>
        {open
          ? <ul>
            {turnProcess.fileWrites.map((item, index) => <li key={index}>
              <div className="turn-item-head">
                {TOOL_VERB[item.name] ?? item.name} {item.file ?? '文件'} · {item.state === 'done' ? '完成' : item.state === 'failed' ? '失败' : '进行中'}
                {item.durationMs !== null ? ` · ${formatDuration(item.durationMs)}` : ''}
                {item.added !== null || item.removed !== null ? ` · +${item.added ?? 0}/-${item.removed ?? 0}` : ''}
              </div>
              {item.hunks.length > 0
                ? <details className="turn-item-diff">
                  <summary>查看本次修改</summary>
                  {item.hunks.map((hunk, hunkIndex) => <DiffHunk hunk={hunk} index={hunkIndex} key={hunkIndex} />)}
                </details>
                : null}
            </li>)}
          </ul>
          : null}
      </div>
      : null}
  </div>
}

function bytesLabel(bytes: number | null): string {
  if (bytes === null) return '大小未知'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** ADR-0300: the right rail — cards stay visible (left of the panel) while the preview is open. */
function ArtifactRail({ artifacts, onArtifactOpen, onArtifactRetry, onArtifactClose, onArtifactFullscreen, onArtifactWindow }: {
  readonly artifacts: DesktopArtifacts
  readonly onArtifactOpen?: (artifactId: string) => void
  readonly onArtifactRetry?: () => void
  readonly onArtifactClose?: () => void
  readonly onArtifactFullscreen?: (on: boolean) => void
  readonly onArtifactWindow?: (action: 'open' | 'close') => void
}): ReactNode {
  const preview = artifacts.preview
  return <aside className="artifact-rail" aria-label="产出物">
    <header className="artifact-rail-header"><strong>产出物</strong></header>
    {artifacts.cards.length === 0
      ? <p className="artifact-empty">尚无观察到产出物</p>
      : artifacts.cards.map((card) => <div className="artifact-card" key={card.artifactId}>
        <div className="artifact-card-title"><span className="artifact-name">{card.name}</span><span className="artifact-kind">{card.kind}</span></div>
        <div className="artifact-card-meta">{card.state === 'ready' ? bytesLabel(card.bytes) : card.state === 'absent' ? '已不在工作区' : '尚未确认'}</div>
        <div className="artifact-card-actions">
          <button className="text-button" aria-label={`面板打开 ${card.name}`} onClick={() => onArtifactOpen?.(card.artifactId)}>打开</button>
        </div>
        <details className="artifact-menu">
          <summary aria-label={`更多文件操作 ${card.name}`}>更多操作</summary>
          <div className="artifact-menu-body">
            <button className="text-button" aria-label={`面板打开选项 ${card.name}`} onClick={() => onArtifactOpen?.(card.artifactId)}>面板打开</button>
            <button
              className="text-button"
              aria-label={`独立窗口 ${card.name}`}
              disabled={preview.state !== 'ready'}
              onClick={() => onArtifactWindow?.('open')}
            >独立窗口</button>
          </div>
        </details>
      </div>)}
    {preview.state === 'opening'
      ? <div className="artifact-preview-status" data-artifact-preview="opening" role="status">正在打开：{preview.name}</div>
      : null}
    {preview.state === 'ready'
      ? <div className="artifact-preview-status" data-artifact-preview="ready" role="status">
        <p>已在右侧打开：{preview.name}</p>
        <div className="artifact-card-actions">
          <button className="text-button" aria-label="关闭预览" onClick={() => onArtifactClose?.()}>关闭预览</button>
          <button className="text-button" aria-label={preview.expanded ? '退出全屏' : '全屏查看'} onClick={() => onArtifactFullscreen?.(!preview.expanded)}>{preview.expanded ? '退出全屏' : '全屏查看'}</button>
          {preview.window
            ? <button className="text-button" aria-label="关闭独立窗口" onClick={() => onArtifactWindow?.('close')}>关闭独立窗口</button>
            : <button className="text-button" aria-label="打开独立窗口" onClick={() => onArtifactWindow?.('open')}>独立窗口</button>}
        </div>
      </div>
      : null}
    {preview.state === 'failed'
      ? <div className="artifact-preview-status" data-artifact-preview="failed" role="status">
        <p>打开失败：{preview.code}</p>
        {preview.retryable ? <button className="text-button" aria-label="重试打开" onClick={() => onArtifactRetry?.()}>重试</button> : null}
      </div>
      : null}
  </aside>
}

// Sanbao src/pages/SessionPage.tsx:78–86: transcript structure only, without observation-driven content.
/** ADR-0313 (S03): the external-authorization wait cards — an answer is never approval-by-UI:
 *  the button posts the real action and echoes the service's receipt verbatim — a recorded but
 *  unconfirmed receipt ('unknown') is named as such, never as a confirmed decision. A button
 *  exists only when its own handler is wired (a display-only consumer gets no dead controls). */
function ApprovalsSection({ approvals, onAnswer, onWithdraw }: {
  readonly approvals: DesktopApprovals
  readonly onAnswer?: (requestId: string, outcome: 'allowed-once' | 'rejected') => Promise<SessionControlResult>
  readonly onWithdraw?: (requestId: string) => Promise<SessionControlResult>
}): ReactNode {
  const [note, setNote] = useState('')
  if (approvals.state !== 'read' || approvals.pending.length === 0) return null
  const run = (action: () => Promise<SessionControlResult>, recorded: string) => {
    void action().then((result) => {
      setNote(!result.ok
        ? result.code === 'protected-effect-unavailable'
          ? '授权应答尚未接通（接线完成前不会记录任何决定）。'
          : `未受理（${result.code ?? 'unknown'}）。`
        : result.receiptState === 'unknown'
          ? '结果未知（已记录，待核对，不自动重试）。'
          : recorded)
    })
  }
  return <section className="approvals-section" aria-label="外部授权等待">
    <strong>等待授权的操作（{approvals.pending.length}）</strong>
    {approvals.pending.map((card) => <div className="approval-card" key={card.requestId}>
      <div className="approval-card-head"><span className="approval-tool">{card.toolName}</span></div>
      {card.reason !== null ? <p className="approval-reason">{card.reason}</p> : null}
      <div className="approval-actions">
        {onAnswer !== undefined
          ? <>
            <button type="button" className="text-button" aria-label={`允许一次 ${card.toolName}`}
              onClick={() => run(() => onAnswer(card.requestId, 'allowed-once'), '已提交并等待服务记录。')}>允许一次</button>
            <button type="button" className="text-button" aria-label={`拒绝 ${card.toolName}`}
              onClick={() => run(() => onAnswer(card.requestId, 'rejected'), '已提交并等待服务记录。')}>拒绝</button>
          </>
          : null}
        {card.withdrawable && onWithdraw !== undefined
          ? <button type="button" className="text-button" aria-label={`撤回等待 ${card.toolName}`}
            onClick={() => run(() => onWithdraw(card.requestId), '已撤回等待。')}>撤回等待</button>
          : null}
      </div>
    </div>)}
    {note !== '' ? <p className="approval-note" role="status">{note}</p> : null}
  </section>
}

/** ADR-0313 (S05): the model-queue verdict card — the service's own facts; retry rows display the
 *  service's scheduled delay as a fact (never counted down by the UI). */
function ModelQueueCard({ queue, onVerify }: {
  readonly queue: DesktopModelQueue
  readonly onVerify?: () => void
}): ReactNode {
  if (queue.state !== 'read' || queue.verdict === 'idle') return null
  const label = { waiting: '等待模型就绪', retrying: '正在重试', ready: '模型已就绪', unknown: '排队状态未核验' }[queue.verdict as 'waiting' | 'retrying' | 'ready' | 'unknown']
  return <section className="model-queue-card" aria-label="模型排队" data-queue-verdict={queue.verdict}>
    <strong>{label}</strong>
    {queue.retries.map((retry) => <p className="queue-retry" key={retry.retryId}>
      {retry.provider} · 第 {retry.attempt}{retry.maxAttempts === null ? '' : `/${retry.maxAttempts}`} 次 · {retry.failureCode}
      {retry.started ? '（已重启）' : `（服务计划 ${formatDelayMs(retry.delayMs)} 后重试）`}
    </p>)}
    {queue.reason !== null ? <p className="queue-reason">{queue.reason}</p> : null}
    {queue.verifyOnly || queue.verdict === 'unknown'
      ? <button type="button" className="text-button" aria-label="核对排队状态" onClick={() => onVerify?.()}>核对</button>
      : null}
  </section>
}

// Every control outcome is named (the legacy queue wording, kept): a refusal is never silent and
// the editor stays open so the draft is not lost.
function controlItemNote(result: SessionControlResult, kind: 'edit' | 'remove'): string {
  if (result.ok) return kind === 'edit'
    ? '已提交修改（以权威快照为准，刷新后可见）。'
    : '已提交移除（若已开始处理则改不动——以快照为准）。'
  if (result.code === 'protected-effect-unavailable') return '会话控制尚未接通（接线完成前不会记录任何改动）。'
  if (result.code === 'queue-item-not-found') return '这一项已开始处理（不在队列里了）——以服务快照为准。'
  if (result.code === 'queue-no-session') return '还没有会话：没有队列项可改。'
  if (result.code === 'queue-edit-invalid') return '修改内容为空或超长：没有提交。'
  return `未受理（${result.code ?? 'unknown'}）。`
}

/** ADR-0313 (S07): one editable item list shared by the pending inputs and the queue occurrences.
 *  Edit is inline (draft swap); remove is explicit — both ride the existing compliant routes, and
 *  every outcome is named in the list's own note. Editing is offered only where the list's facts
 *  allow it (pending: the item's own editable; queue: the queued position only), and only when a
 *  handler is wired — never a dead control. */
function ControlItemList({ label, items, onEdit, onRemove }: {
  readonly label: string
  readonly items: readonly { readonly id: string, readonly text: string, readonly badge: string, readonly editable: boolean, readonly lockNote?: string }[]
  readonly onEdit?: (itemId: string, text: string) => Promise<SessionControlResult>
  readonly onRemove?: (itemId: string) => Promise<SessionControlResult>
}): ReactNode {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  if (items.length === 0) return null
  const save = (itemId: string) => {
    if (onEdit === undefined) return
    const text = draft.trim()
    if (text === '') { setNote('未提交（内容为空）。'); return }
    void onEdit(itemId, text).then((result) => {
      setNote(controlItemNote(result, 'edit'))
      if (result.ok) setEditingId(null)
    })
  }
  const remove = (itemId: string) => {
    if (onRemove === undefined) return
    void onRemove(itemId).then((result) => setNote(controlItemNote(result, 'remove')))
  }
  return <div className="control-list" aria-label={label}>
    <strong>{label}（{items.length}）</strong>
    <ul>{items.map((item) => <li key={item.id}>
      {editingId === item.id
        ? <>
          <input aria-label={`编辑 ${item.text}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <button type="button" className="text-button" aria-label="保存修改" onClick={() => save(item.id)}>保存</button>
          <button type="button" className="text-button" aria-label="取消编辑" onClick={() => setEditingId(null)}>取消</button>
        </>
        : <>
          <span className="control-item-text">{item.text}</span>
          <span className="control-item-badge">{item.badge}</span>
          {item.editable && onEdit !== undefined
            ? <button type="button" className="text-button" aria-label={`编辑项 ${item.text}`}
              onClick={() => { setEditingId(item.id); setDraft(item.text) }}>编辑</button>
            : null}
          {item.editable && onRemove !== undefined
            ? <button type="button" className="text-button" aria-label={`移除项 ${item.text}`}
              onClick={() => remove(item.id)}>移除</button>
            : null}
          {!item.editable && item.lockNote !== undefined
            ? <small className="control-item-lock">{item.lockNote}</small>
            : null}
        </>}
    </li>)}</ul>
    {note !== '' ? <p className="control-note" role="status">{note}</p> : null}
  </div>
}

export function DesktopSessionView({
  title, execution, lastTurnEnd, paused, streamBroken, messages, streaming = null,
  turnProcess, artifacts, onArtifactOpen, onArtifactRetry, onArtifactClose, onArtifactFullscreen, onArtifactWindow,
  approvals = null, modelQueue = null, pending = [], queue = { state: 'read', occurrences: [] },
  onApprovalAnswer, onApprovalWithdraw, onPendingChange, onQueueChange, onVerifyQueue,
}: DesktopSessionViewProps): ReactNode {
  // ADR-0309: the side-panel entry (OBS: the button is visible on the first-run page; its click
  // path was not observed) — it toggles the artifact rail locally. No provider is involved.
  const [sidePanelOpen, setSidePanelOpen] = useState(false)
  const runningWrite = execution === 'executing'
    ? turnProcess?.fileWrites.find((item) => item.state === 'running')
    : undefined
  const railVisible = sidePanelOpen || (artifacts !== undefined && artifacts.state === 'read'
    && (artifacts.cards.length > 0 || artifacts.preview.state !== 'closed'))
  // ADR-0298: the viewport follows the output while it grows, as the observed product does.
  const scroller = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const node = scroller.current
    if (node === null || streaming === null) return
    node.scrollTop = node.scrollHeight
  }, [streaming])
  const state = paused ? 'paused'
    : streamBroken ? 'interrupted'
      : execution === 'executing' ? 'executing'
        : lastTurnEnd !== null ? 'ended' : 'idle'
  const label = {
    paused: '已暂停',
    interrupted: '连接中断',
    executing: '正在执行',
    ended: '本轮已结束',
    idle: '待命',
  }[state]

  return <section className="session-page" aria-label="当前会话">
    <header className="session-header">
      <strong>{title}</strong>
      <span className="session-state" data-session-state={state} role="status">{label}</span>
      <button type="button" className="text-button side-panel-toggle" aria-label="侧面板"
        aria-pressed={sidePanelOpen} onClick={() => setSidePanelOpen((value) => !value)}>侧面板</button>
    </header>
    <div className={`session-layout${artifacts !== undefined && (artifacts.preview.state === 'opening' || artifacts.preview.state === 'ready') ? ' preview-open' : ''}`}>
      <div className="conversation">
        {approvals !== null
          ? <ApprovalsSection approvals={approvals}
            {...(onApprovalAnswer === undefined ? {} : { onAnswer: onApprovalAnswer })}
            {...(onApprovalWithdraw === undefined ? {} : { onWithdraw: onApprovalWithdraw })} />
          : null}
        {modelQueue !== null
          ? <ModelQueueCard queue={modelQueue} {...(onVerifyQueue === undefined ? {} : { onVerify: onVerifyQueue })} />
          : null}
        <div className="message-scroll" role="region" aria-label="会话消息" tabIndex={0} ref={scroller}>
          {messages.length === 0 ? <p className="session-empty">当前会话尚无可读消息</p>
            : messages.map((message, index) => message.role === 'user'
              ? <div className="user-message" key={index}><span>{message.text}</span></div>
              : <div className="assistant-message" key={index}>
                <div className="assistant-heading"><strong>Sage</strong></div>
                <div className="reply-body"><MarkdownText text={message.text} /></div>
              </div>)}
          {runningWrite !== undefined ? <LiveProcessRow item={runningWrite} key={runningWrite.file ?? runningWrite.name} /> : null}
          {streaming !== null && streaming !== ''
            ? <div className="assistant-message streaming-message" aria-label="正在生成">
              <div className="assistant-heading"><strong>Sage</strong></div>
              <div className="reply-body"><MarkdownText text={streaming} /></div>
            </div>
            : null}
          {lastTurnEnd !== null && turnProcess !== undefined
            ? <TurnProcessFooter lastTurnEnd={lastTurnEnd} turnProcess={turnProcess} />
            : null}
        </div>
        <ControlItemList label="待继续输入"
          items={pending.map((item) => ({
            id: item.itemId, text: item.text,
            badge: { pending: '待继续', dispatching: '派发中', submitted: '已提交', consumed: '已消费' }[item.state],
            editable: item.editable,
          }))}
          {...(onPendingChange === undefined ? {} : {
            onEdit: (itemId: string, text: string) => onPendingChange({ kind: 'edit', itemId, text }),
            onRemove: (itemId: string) => onPendingChange({ kind: 'remove', itemId }),
          })}
        />
        <ControlItemList label="队列"
          items={queue.occurrences.map((occurrence) => ({
            id: occurrence.queueItemId, text: occurrence.preview,
            badge: { queued: '排队', steering: '插队', context: '上下文' }[occurrence.position],
            editable: occurrence.position === 'queued',
            ...(occurrence.position === 'queued' ? {} : { lockNote: '已进入处理，不可修改——以服务快照为准。' }),
          }))}
          {...(onQueueChange === undefined ? {} : {
            onEdit: (itemId: string, text: string) => onQueueChange({ kind: 'edit', itemId, text }),
            onRemove: (itemId: string) => onQueueChange({ kind: 'remove', itemId }),
          })}
        />
        {queue.state === 'unavailable'
          ? <p className="control-note" role="status">队列快照不可用——以服务恢复后为准。</p>
          : null}
      </div>
      {railVisible
        ? <ArtifactRail
          artifacts={artifacts ?? { state: 'read', cards: [], preview: { state: 'closed' } }}
          {...(onArtifactOpen === undefined ? {} : { onArtifactOpen })}
          {...(onArtifactRetry === undefined ? {} : { onArtifactRetry })}
          {...(onArtifactClose === undefined ? {} : { onArtifactClose })}
          {...(onArtifactFullscreen === undefined ? {} : { onArtifactFullscreen })}
          {...(onArtifactWindow === undefined ? {} : { onArtifactWindow })}
        />
        : null}
    </div>
  </section>
}
