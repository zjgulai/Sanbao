/**
 * The session card's lower blocks (ADR-0261, strangler P3 / batch 24).
 *
 * Presentational components for the blocks whose display words derive from the published slot:
 * pending items, the queue, clarification cards, approval waits, anchors, edit versions and the
 * project run history. All actions stay on the legacy wire (called back by the parent); phrasing
 * that the legacy wire owned (refusals/receipts) arrives through the parent's notice props.
 */
import type { JSX } from 'react'

type Row = Record<string, unknown>

interface AnchorEntry {
  readonly runSeq: number
  readonly turn: number | null
  readonly promptPreview: string
}

const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback

export interface PendingBlockProps {
  readonly pending: readonly Row[]
  readonly drafts: ReadonlyMap<string, string>
  readonly busyId: string | null
  readonly onDraft: (itemId: string, value: string) => void
  readonly onEdit: (itemId: string) => void
  readonly onRemove: (itemId: string) => void
  readonly note: string
}

export function PendingBlock({ pending, drafts, busyId, onDraft, onEdit, onRemove, note }: PendingBlockProps): JSX.Element {
  return (
    <>
      <p id="pending-note" className="sage-card-note">{note}</p>
      <ul className="sage-roster-list" id="pending-rows">
        {pending.map((item) => {
          const itemId = text(item.itemId)
          if (itemId === '') return null
          const state = text(item.state, 'pending')
          const tagClass = state === 'consumed' ? 'sage-roster-tag is-blocked' : state === 'submitted' ? 'sage-roster-tag' : 'sage-roster-tag is-ok'
          const editable = item.editable === true
          const stateText = state === 'pending'
            ? (item.note === 'drained-at-stop' ? '待继续（停止时已收回）' : '待继续（尚未派发）')
            : state === 'dispatching' ? '派发中（已冻结，不可编辑）'
              : state === 'submitted' ? '已提交·在队列' : '已消费（只读）'
          return (
            <li key={itemId} className="sage-roster-row" data-pending-id={itemId}>
              <span className={tagClass}>{stateText}</span>
              <input
                className="sage-row-input"
                type="text"
                value={drafts.get(itemId) ?? text(item.text)}
                aria-label="待继续输入"
                data-pending-input={itemId}
                disabled={!editable}
                onChange={(event) => onDraft(itemId, event.target.value)}
              />
              {editable ? (
                <>
                  <button className="sage-row-button" type="button" data-pending-action="edit" disabled={busyId === itemId} onClick={() => onEdit(itemId)}>保存修改</button>
                  <button className="sage-row-button" type="button" data-pending-action="remove" disabled={busyId === itemId} onClick={() => onRemove(itemId)}>移除</button>
                </>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export interface QueueBlockProps {
  readonly occurrences: readonly Row[]
  readonly drafts: ReadonlyMap<string, string>
  readonly busyId: string | null
  readonly onDraft: (itemId: string, value: string) => void
  readonly onEdit: (itemId: string) => void
  readonly onRemove: (itemId: string) => void
  readonly note: string
}

export function QueueBlock({ occurrences, drafts, busyId, onDraft, onEdit, onRemove, note }: QueueBlockProps): JSX.Element {
  return (
    <>
      <p id="queue-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="queue-rows">
        {occurrences.map((occurrence) => {
          const itemId = text(occurrence.queueItemId)
          if (itemId === '') return null
          const position = text(occurrence.position)
          const badge = position === 'steering' ? '步骤边界（steer）'
            : position === 'context' ? '上下文（context）' : '排队中（本轮结束后处理）'
          return (
            <li key={itemId} className="sage-roster-row" data-queue-id={itemId}>
              <span className="sage-roster-tag">{badge}</span>
              <input
                className="sage-row-input"
                type="text"
                value={drafts.get(itemId) ?? text(occurrence.preview)}
                aria-label="队列项文本"
                data-queue-input={itemId}
                onChange={(event) => onDraft(itemId, event.target.value)}
              />
              <button className="sage-row-button" type="button" data-queue-action="edit" disabled={busyId === itemId} onClick={() => onEdit(itemId)}>保存修改</button>
              <button className="sage-row-button" type="button" data-queue-action="remove" disabled={busyId === itemId} onClick={() => onRemove(itemId)}>移除</button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export interface ClarificationAnswer {
  readonly selected: readonly string[]
  readonly custom: string
}

export interface ClarificationsBlockProps {
  readonly cards: readonly Row[]
  readonly deferred: readonly Row[]
  readonly receipts: readonly Row[]
  readonly answerOf: (requestId: string, questionId: string) => ClarificationAnswer
  readonly onAnswer: (requestId: string, questionId: string, next: ClarificationAnswer) => void
  readonly onSubmit: (requestId: string) => void
  readonly onVerify: () => void
  readonly busy: boolean
  readonly note: string
}

export function ClarificationsBlock({ cards, deferred, receipts, answerOf, onAnswer, onSubmit, onVerify, busy, note }: ClarificationsBlockProps): JSX.Element {
  return (
    <>
      <p id="clarification-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="clarification-cards">
        {cards.map((card) => {
          const requestId = text(card.requestId)
          if (requestId === '' || !Array.isArray(card.questions)) return null
          const questions = card.questions.filter((q): q is Row => q !== null && typeof q === 'object')
          const run = card.run !== null && typeof card.run === 'object' ? card.run as Row : null
          return (
            <li key={requestId} className="sage-roster-row" data-clarification-request={requestId}>
              <strong>澄清提问</strong>
              <span className="sage-roster-tag">{run !== null && typeof run.runSeq === 'number' ? '所属运行 @' + String(run.runSeq) : '所属运行未核验'}</span>
              {questions.map((question) => {
                const questionId = text(question.questionId)
                const answer = answerOf(requestId, questionId)
                const options = Array.isArray(question.options) ? question.options.filter((o): o is Row => o !== null && typeof o === 'object') : []
                const multi = question.multiSelect === true
                return (
                  <div key={questionId}>
                    <span className="sage-roster-tag">{'问：' + text(question.question)}</span>
                    {typeof question.header === 'string' && question.header !== '' ? <span className="sage-roster-tag">{'（' + question.header + '）'}</span> : null}
                    {typeof question.intentKind === 'string' && question.intentKind !== '' ? (
                      <span className="sage-roster-tag">{'确认意图：' + question.intentKind + (typeof question.approveLabel === 'string' && question.approveLabel !== '' ? '（通过=' + question.approveLabel + '）' : '')}</span>
                    ) : null}
                    {question.intentKind === 'plan-review' ? (
                      <>
                        {typeof question.detail === 'string' && question.detail !== '' ? (
                          <pre className="sage-plan-preview" data-plan-review-preview={questionId}>{question.detail}</pre>
                        ) : null}
                        <span className="sage-roster-tag">方案预览：接受方案不等于执行其中动作（业务动作仍需执行前确认）。</span>
                      </>
                    ) : null}
                    {options.map((option) => {
                      const label = text(option.label)
                      const checked = answer.selected.includes(label)
                      return (
                        <label key={questionId + ':' + label}>
                          <input
                            type={multi ? 'checkbox' : 'radio'}
                            name={'clarify-' + requestId + '-' + questionId}
                            value={label}
                            data-clarification-option={questionId}
                            checked={checked}
                            onChange={(event) => {
                              const next = multi
                                ? (event.target.checked ? [...answer.selected, label] : answer.selected.filter((entry) => entry !== label))
                                : [label]
                              onAnswer(requestId, questionId, { selected: next, custom: answer.custom })
                            }}
                          />
                          <span>{' ' + label + (typeof option.description === 'string' && option.description !== '' ? '（' + option.description + '）' : '')}</span>
                        </label>
                      )
                    })}
                    <input
                      type="text"
                      className="sage-row-input"
                      data-clarification-custom={questionId}
                      placeholder="自定义回答（与候选项同权）"
                      aria-label="自定义回答"
                      value={answer.custom}
                      onChange={(event) => onAnswer(requestId, questionId, { selected: answer.selected, custom: event.target.value })}
                    />
                  </div>
                )
              })}
              <button className="sage-row-button" type="button" data-clarification-submit={requestId} disabled={busy} onClick={() => onSubmit(requestId)}>提交回答</button>
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="clarification-deferred">
        {deferred.map((entry, index) => {
          const questions = Array.isArray(entry.questions) ? entry.questions : []
          const first = questions.length > 0 && questions[0] !== null && typeof questions[0] === 'object' ? questions[0] as Row : null
          const questionText = first !== null ? text(first.question) : ''
          const sentence = '待继续：' + questionText + (entry.reason === 'stopped'
            ? '——停止已中止该提问（未回答）；继续会话后可按需重新发起。'
            : '——该提问已结束（未从本工作面提交回答）。')
          return <li key={'deferred-' + String(index)} className="sage-roster-row">{sentence}</li>
        })}
      </ul>
      <ul className="sage-roster-list" id="clarification-receipts">
        {receipts.map((receipt) => {
          const requestId = text(receipt.requestId)
          if (requestId === '') return null
          const code = typeof receipt.code === 'string' && receipt.code !== '' ? '（' + receipt.code + '）' : ''
          const sentence = receipt.state === 'accepted' ? '已接收（等待生效确认）：回答已提交给所属会话' + code
            : receipt.state === 'effective' ? '已生效：运行已采用该回答（结果已落历史）' + code
              : receipt.state === 'aborted' ? '未生效：该提问已中止或不在等待中；仅可核对，不给重试' + code
                : '结果未知：请核对同一操作（不给重试）' + code
          return (
            <li key={requestId} className="sage-roster-row">
              {sentence}
              {receipt.verifyOnly === true ? (
                <button className="sage-row-button" type="button" data-clarification-verify={requestId} disabled={busy} onClick={onVerify}>核对</button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export interface ApprovalsBlockProps {
  readonly cards: readonly Row[]
  readonly lapsed: readonly Row[]
  readonly receipts: readonly Row[]
  readonly busyKey: string | null
  readonly onAnswer: (requestId: string, outcome: 'allowed-once' | 'rejected') => void
  readonly onWithdraw: (requestId: string) => void
  readonly onVerify: () => void
  readonly note: string
}

export function ApprovalsBlock({ cards, lapsed, receipts, busyKey, onAnswer, onWithdraw, onVerify, note }: ApprovalsBlockProps): JSX.Element {
  return (
    <>
      <p id="approval-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="approval-cards">
        {cards.map((card) => {
          const requestId = text(card.requestId)
          if (requestId === '') return null
          return (
            <li key={requestId} className="sage-roster-row" data-approval-request={requestId}>
              <strong>{'等待授权：' + text(card.toolName, '未知工具')}</strong>
              <span className="sage-roster-tag">{'来源：' + (typeof card.reason === 'string' && card.reason !== '' ? card.reason : '未提供说明')}</span>
              {typeof card.callId === 'string' && card.callId !== '' ? <span className="sage-roster-tag">{'调用：' + card.callId}</span> : null}
              <button className="sage-row-button" type="button" data-approval-answer="allowed-once" data-approval-request-id={requestId} disabled={busyKey === requestId} onClick={() => onAnswer(requestId, 'allowed-once')}>批准（仅此一次）</button>
              <button className="sage-row-button" type="button" data-approval-answer="rejected" data-approval-request-id={requestId} disabled={busyKey === requestId} onClick={() => onAnswer(requestId, 'rejected')}>拒绝</button>
              {card.withdrawable === true ? (
                <button className="sage-row-button" type="button" data-approval-withdraw={requestId} disabled={busyKey === requestId} onClick={() => onWithdraw(requestId)}>撤回等待</button>
              ) : (
                <span className="sage-roster-tag">不可撤回（请求方未提供取消能力）</span>
              )}
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="approval-lapsed">
        {lapsed.map((entry) => {
          const requestId = text(entry.requestId)
          if (requestId === '') return null
          return (
            <li key={requestId} className="sage-roster-row">
              {'已失效：' + text(entry.toolName, '未知工具') + '（' + (entry.lapse === 'stopped' ? '会话已停止' : '等待已消失') + '）——需重新申请；旧等待不会自动兑现为执行条件。'}
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="approval-receipts">
        {receipts.map((receipt) => {
          const requestId = text(receipt.requestId)
          if (requestId === '') return null
          const sentence = receipt.state === 'accepted'
            ? (receipt.outcome === 'withdrawn'
                ? '撤回已提交：等待生效证据（等待不会兑现为执行条件）。'
                : receipt.outcome === 'allowed-once' ? '批准已提交（仅此一次）：等待生效证据——未生效前不显示为已批准。' : '拒绝已提交：等待生效证据。')
            : receipt.state === 'effective' ? (receipt.outcome === 'allowed-once' ? '已批准（仅此一次，有日志证据）。' : '已拒绝（有日志证据）。')
              : receipt.state === 'lapsed' ? '已失效：' + text(receipt.code, '等待结束') + '——需重新申请；不代表已批准。'
                : '结果未知：只给核对，不自动重试；未确认前不显示为已批准。'
          return (
            <li key={requestId} className="sage-roster-row" data-approval-receipt={requestId}>
              <span className="sage-roster-tag">{sentence}</span>
              {receipt.state === 'accepted' || receipt.state === 'unknown' ? (
                <button className="sage-row-button" type="button" data-approval-verify={requestId} disabled={busyKey === requestId} onClick={onVerify}>核对（重新读取）</button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </>
  )
}

export interface AnchorsBlockProps {
  readonly anchors: readonly AnchorEntry[]
  readonly located: number | null
  readonly selected: number | null
  readonly previewText: string
  readonly busy: boolean
  readonly onRead: () => void
  readonly onPreview: (entry: AnchorEntry) => void
  readonly onLocate: () => void
  readonly onClose: () => void
  readonly note: string
}

export function AnchorsBlock({ anchors, located, selected, previewText, busy, onRead, onPreview, onLocate, onClose, note }: AnchorsBlockProps): JSX.Element {
  return (
    <>
      <button className="sage-secondary-button" id="anchor-read" type="button" disabled={busy} onClick={onRead}>读取锚点（最近轮次）</button>
      <p id="anchor-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="anchor-rows">
        {anchors.map((anchor) => (
          <li key={anchor.runSeq} className="sage-roster-row" data-anchor-run={anchor.runSeq} data-anchor-located={located === anchor.runSeq ? 'true' : undefined}>
            <strong>{'运行 @' + String(anchor.runSeq) + (anchor.turn !== null ? '·第 ' + String(anchor.turn) + ' 轮' : '')}</strong>
            <span className="sage-roster-tag">{anchor.promptPreview !== '' ? '预览：' + anchor.promptPreview : '（该轮没有用户文本预览）'}</span>
            <button className="sage-row-button" type="button" data-anchor-preview={anchor.runSeq} onClick={() => onPreview(anchor)}>锚点预览</button>
          </li>
        ))}
      </ul>
      <div id="anchor-preview" hidden={selected === null}>
        <span className="sage-card-label">锚点短预览（有界；定位只读一页窗口）</span>
        <p id="anchor-preview-text">{previewText}</p>
        <button className="sage-row-button" id="anchor-locate" type="button" disabled={busy} onClick={onLocate}>定位到此轮消息</button>
        <button className="sage-row-button" id="anchor-preview-close" type="button" onClick={onClose}>关闭预览</button>
      </div>
    </>
  )
}

export interface EditRecordView {
  readonly editId: string
  readonly messageRef: string
  readonly originalText: string
  readonly versions: readonly { readonly version: number, readonly active: boolean, readonly text: string, readonly status: string }[]
  readonly activeAction: { readonly kind: 'verify' | 'resend', readonly version: number } | null
}

export interface EditsBlockProps {
  readonly targetRef: string | null
  readonly input: string
  readonly onInput: (value: string) => void
  readonly onSave: () => void
  readonly records: readonly EditRecordView[]
  readonly busyKey: string | null
  readonly onVerify: (editId: string) => void
  readonly onResend: (editId: string) => void
  readonly note: string
}

export function EditsBlock({ targetRef, input, onInput, onSave, records, busyKey, onVerify, onResend, note }: EditsBlockProps): JSX.Element {
  return (
    <>
      <div className="sage-state-row">
        <span>正在编辑</span>
        <strong id="edit-target" data-edit-selected={targetRef !== null ? targetRef : undefined}>{targetRef === null ? '（从下方会话记录里选一条已发消息）' : '消息 ' + targetRef + '（原消息不变）'}</strong>
      </div>
      <textarea className="sage-draft-input" id="edit-input" rows={2} aria-label="编辑已发送消息的新版本" value={input} onChange={(event) => onInput(event.target.value)} />
      <button className="sage-secondary-button" id="edit-save" type="button" disabled={busyKey === 'save'} onClick={onSave}>保存为新版本</button>
      <p id="edit-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="edit-rows">
        {records.map((record) => (
          <li key={record.editId} className="sage-roster-row" data-edit-record={record.editId}>
            <strong>{'编辑稿 ' + record.editId.slice(0, 22)}</strong>
            <span className="sage-roster-tag" data-edit-original={record.messageRef}>{'原消息（未改写）：' + record.originalText}</span>
            {record.versions.map((version) => (
              <div key={record.editId + ':v' + String(version.version)} data-edit-version={version.version}>
                <span className="sage-roster-tag">{'v' + String(version.version) + (version.active ? '（当前）' : '') + '：' + version.text}</span>
                <span className="sage-roster-tag">{version.status}</span>
              </div>
            ))}
            {record.activeAction?.kind === 'verify' ? (
              <button className="sage-row-button" type="button" data-edit-verify={record.editId} disabled={busyKey === record.editId} onClick={() => onVerify(record.editId)}>核对同一操作</button>
            ) : record.activeAction?.kind === 'resend' ? (
              <button className="sage-row-button" type="button" data-edit-resend={record.editId} disabled={busyKey === record.editId} onClick={() => onResend(record.editId)}>{'重发 v' + String(record.activeAction.version)}</button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

export interface HistoryDetailView {
  readonly state: string
  readonly code: string
  readonly runSeq: number | null
  readonly model: string
  readonly provider: string
  readonly userTexts: readonly string[]
  readonly outputPreview: string
  readonly outputTruncated: boolean
  readonly clarifications: readonly Row[]
}

export interface HistoryBlockProps {
  readonly runs: readonly Row[]
  readonly hasMore: boolean
  readonly known: boolean
  readonly detail: HistoryDetailView | null
  readonly busy: boolean
  readonly onRead: () => void
  readonly onMore: () => void
  readonly onDetail: (runSeq: number) => void
  readonly note: string
}

export function HistoryBlock({ runs, hasMore, known, detail, busy, onRead, onMore, onDetail, note }: HistoryBlockProps): JSX.Element {
  return (
    <>
      <button className="sage-secondary-button" id="history-read" type="button" disabled={busy} onClick={onRead}>读取历史运行</button>
      <button className="sage-secondary-button" id="history-more" type="button" hidden={!(known && hasMore)} disabled={busy} onClick={onMore}>加载更早运行</button>
      <p id="history-note" className="sage-card-note" role="status" aria-live="polite">{note}</p>
      <ul className="sage-roster-list" id="history-rows">
        {runs.map((run) => {
          const runSeq = typeof run.runSeq === 'number' ? run.runSeq : null
          if (runSeq === null) return null
          const model = text(run.model)
          return (
            <li key={String(runSeq)} className="sage-roster-row" data-history-run={String(runSeq)}>
              <strong>{'运行 @' + String(runSeq)}</strong>
              <span className="sage-roster-tag">{model !== '' ? '当时模型 ' + text(run.provider) + '/' + model : '未记录请求头模型'}</span>
              <span>{run.endSeq === null ? '进行中（未结束）' : '已结束（' + text(run.endReason, 'ended') + '）'}</span>
              <span>{String(typeof run.messages === 'number' ? run.messages : 0) + ' 条消息'}</span>
              <button className="sage-row-button" type="button" data-history-action="detail" data-history-run={String(runSeq)} disabled={busy} onClick={() => onDetail(runSeq)}>展开详情</button>
            </li>
          )
        })}
      </ul>
      <div id="history-detail" hidden={detail === null}>
        {detail !== null ? (
          <>
            <p id="history-detail-model" className="sage-card-note">
              {detail.state === 'missing' ? '' : '当时实际模型（本运行请求头快照）：' + (detail.model !== '' ? detail.provider + '/' + detail.model : '未记录') + '——与本事项当前选择分开显示（当前默认见模型卡）。'}
            </p>
            <p id="history-detail-note" className="sage-card-note" role="status" aria-live="polite">
              {detail.state === 'missing'
                ? '这一运行的详情不可读（' + (detail.code !== '' ? detail.code : 'unreadable') + '）：保持缺失（不显示空白成功）。'
                : '运行 @' + String(detail.runSeq) + '：' + String(detail.userTexts.length) + ' 条用户输入' + (detail.outputTruncated ? '；输出为有界预览（有截断）。' : '。')}
            </p>
            <ul className="sage-roster-list" id="history-detail-users">
              {detail.state === 'read' ? detail.userTexts.map((entry, index) => <li key={'user-' + String(index)} className="sage-roster-row">{entry}</li>) : null}
            </ul>
            <ul className="sage-roster-list" id="history-detail-clarifications">
              {detail.state === 'read' ? detail.clarifications.map((entry, index) => {
                const selectedText = Array.isArray(entry.selected) ? entry.selected.filter((v): v is string => typeof v === 'string').join('、') : ''
                const customText = typeof entry.custom === 'string' && entry.custom !== '' ? entry.custom : ''
                const parts: string[] = []
                if (selectedText !== '') parts.push(selectedText)
                if (customText !== '') parts.push('自定义：' + customText)
                const answer = entry.answered === true
                  ? (parts.length > 0 ? '回答：' + parts.join('；') : '回答：（未记录内容）')
                  : '未回答（提问中止或仍在等待）'
                return <li key={'clarify-' + String(index)} className="sage-roster-row">{'问：' + text(entry.question) + ' —— ' + answer}</li>
              }) : null}
            </ul>
            <pre id="history-detail-output" className="sage-tool-text">{detail.state === 'read' ? detail.outputPreview : ''}</pre>
          </>
        ) : null}
      </div>
    </>
  )
}
