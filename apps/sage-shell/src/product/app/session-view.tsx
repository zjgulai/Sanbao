/**
 * Session card (ADR-0261, strangler P3 / batch 24 — the largest card).
 *
 * Renders `#sage-region-session` (the `sage-session-card` article is the React root container):
 * the main-conversation facts, model queue, terminal panel, composer and send/stop/resume
 * controls, input-reference selections, plan mode, attachments, transcript, reply actions,
 * suggestions, and the lower blocks (pending / queue / clarifications / approvals / anchors /
 * edits / history) which live in `session-bottom-view.tsx`. Requests, refusal codes and receipt
 * sentences stay on the legacy wire behind `__SAGE_LEGACY_ACTIONS__`; React owns the DOM,
 * pending states, notice timing and the legacy-parity resets on every projection message.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import { regionMessage, type AppBridgeStore, type SessionRegionMessage } from './bridge.js'
import {
  AnchorsBlock,
  ApprovalsBlock,
  ClarificationsBlock,
  EditsBlock,
  HistoryBlock,
  type HistoryDetailView,
  PendingBlock,
  QueueBlock,
} from './session-bottom-view.js'

type Row = Record<string, unknown>

/** Module-level so its identity is stable: effects keyed on the message object must not loop. */
const SESSION_UNAVAILABLE: SessionRegionMessage = { kind: 'unavailable' }

const asRecord = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter((entry): entry is Row => entry !== null && typeof entry === 'object') : []
const text = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const attemptText = (entry: Row): string => '第 ' + String(entry.attempt) + (entry.maxAttempts === null ? '' : '/' + String(entry.maxAttempts)) + ' 次'
const submissionText = (version: Row): string => version.submission === 'unsent' ? '未重发'
  : version.submission === 'accepted' ? '已接收（等待生效确认）'
    : version.submission === 'effective' ? '已生效（已落史）'
      : version.submission === 'unknown' ? '结果未知（只给核对，不给重试）'
        : '未送达（核对确认；可再次显式重发）'
const bounded = (value: unknown): string => typeof value === 'string' ? (value.length > 400 ? value.slice(0, 400) + '…' : value) : ''

interface TerminalOutputState {
  readonly kind: 'read' | 'notice' | 'closed'
  readonly text?: string
  readonly lineBegin?: number
  readonly lineEnd?: number
  readonly totalLines?: number
  readonly truncated?: boolean
  readonly notice?: string
}

export interface SessionRegionProps {
  readonly store: AppBridgeStore
  /** The `#sage-region-session` article; the region publishes its machine state here. */
  readonly container: HTMLElement
}

export function SessionRegion({ store, container }: SessionRegionProps): JSX.Element {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const message = regionMessage<SessionRegionMessage>(snapshot, 'session', SESSION_UNAVAILABLE)
  const known = message.kind === 'read'
  const slot = known ? message.slot : null
  const channel = slot !== null ? asRecord(slot.channel) : null
  const state = channel !== null ? text(channel.state, 'unavailable') : 'unavailable'
  const unavailable = !known || state === 'unavailable'
  const paused = known && channel !== null && channel.paused === true

  const transcript = rows(channel?.transcript)
  const echoes = transcript.filter((entry) => entry.source === 'echo')
  const pendingItems = rows(channel?.pending)
  const queueSlice = asRecord(channel?.queue)
  const queueRead = !paused && known && queueSlice !== null && queueSlice.state === 'read'
  const history = slot !== null ? asRecord(slot.history) : null
  const historyKnown = history !== null && history.state === 'read'
  const runs = historyKnown ? rows(history?.runs) : []
  const anchorsSlice = slot !== null ? asRecord(slot.anchors) : null
  const anchorsKnown = anchorsSlice !== null && anchorsSlice.state === 'read'
  const anchorList = (anchorsKnown ? rows(anchorsSlice?.anchors) : []).filter((entry) => typeof entry.runSeq === 'number').map((entry) => ({
    runSeq: entry.runSeq as number,
    turn: typeof entry.turn === 'number' ? entry.turn : null,
    promptPreview: text(entry.promptPreview),
  }))
  const locatedAnchor = anchorsSlice !== null && asRecord(anchorsSlice.located) !== null && typeof (anchorsSlice.located as Row).runSeq === 'number' ? (anchorsSlice.located as Row).runSeq as number : null
  const editsSlice = slot !== null ? asRecord(slot.edits) : null
  const editRecords = editsSlice !== null && editsSlice.state === 'read' ? rows(editsSlice.records) : []
  const clarifications = slot !== null ? asRecord(slot.clarifications) : null
  const clarificationsRead = clarifications !== null && clarifications.state === 'read'
  const clarifyCards = clarificationsRead ? rows(clarifications?.pending) : []
  const clarifyDeferred = clarificationsRead ? rows(clarifications?.deferred) : []
  const clarifyReceipts = clarificationsRead ? rows(clarifications?.receipts) : []
  const approvals = slot !== null ? asRecord(slot.approvals) : null
  const approvalsRead = approvals !== null && approvals.state === 'read'
  const approvalCards = approvalsRead ? rows(approvals?.pending) : []
  const approvalLapsed = approvalsRead ? rows(approvals?.lapsed) : []
  const approvalReceipts = approvalsRead ? rows(approvals?.receipts) : []
  const planMode = slot !== null ? asRecord(slot.planMode) : null
  const planModeRead = planMode !== null && planMode.state === 'read'
  const planModeActive = planModeRead && planMode !== null && planMode.active === true
  const planModePending = planModeRead && planMode !== null && planMode.pending === true
  const selections = slot !== null ? asRecord(slot.selections) : null
  const selectionsRead = selections !== null && selections.state === 'read'
  const skillRows = selectionsRead ? rows(selections?.skills) : []
  const pluginRows = selectionsRead ? rows(selections?.plugins) : []
  const selectedRows = selections !== null ? rows(selections?.selected) : []
  const modelQueue = slot !== null ? asRecord(slot.modelQueue) : null
  const modelQueueRead = modelQueue !== null && modelQueue.state === 'read'
  const modelQueueVerdict = modelQueueRead && modelQueue !== null && typeof modelQueue.verdict === 'string' ? modelQueue.verdict : null
  const modelQueueRetries = modelQueueRead ? rows(modelQueue?.retries) : []
  const modelQueueLast = modelQueueRetries.length > 0 ? modelQueueRetries[modelQueueRetries.length - 1] ?? null : null
  const terminal = slot !== null ? asRecord(slot.terminal) : null
  const terminalRead = terminal !== null && terminal.state === 'read'
  const terminalSessions = terminalRead ? rows(terminal?.terminals) : []
  const attachments = slot !== null ? asRecord(slot.attachments) : null
  const attachmentItems = attachments !== null ? rows(attachments.items) : []
  const suggestions = slot !== null && slot.suggestions !== undefined ? slot.suggestions : null
  const reply = known && state === 'read' ? asRecord(channel?.reply) : null
  const replyActionsList = reply !== null ? (Array.isArray(reply.actions) ? reply.actions.filter((entry): entry is string => typeof entry === 'string') : []) : []
  const replyUncertain = known && state === 'read' && channel?.streamBroken === true
  const replyText = reply !== null && typeof reply.text === 'string' ? reply.text : null
  const storedCount = attachmentItems.filter((item) => item.stage === 'stored').length

  const [inputText, setInputText] = useState('')
  const [mode, setMode] = useState('queue')
  const [sessionNoteOverride, setSessionNoteOverride] = useState<string | null>(null)
  const [attachmentNoteOverride, setAttachmentNoteOverride] = useState<string | null>(null)
  const [selectionNoteOverride, setSelectionNoteOverride] = useState<string | null>(null)
  const [queueNoteOverride, setQueueNoteOverride] = useState<string | null>(null)
  const [historyNoteOverride, setHistoryNoteOverride] = useState<string | null>(null)
  const [clarificationNoteOverride, setClarificationNoteOverride] = useState<string | null>(null)
  const [approvalNoteOverride, setApprovalNoteOverride] = useState<string | null>(null)
  const [modelQueueNoteOverride, setModelQueueNoteOverride] = useState<string | null>(null)
  const [anchorNoteOverride, setAnchorNoteOverride] = useState<string | null>(null)
  const [editNoteOverride, setEditNoteOverride] = useState<string | null>(null)
  const [replyNoteOverride, setReplyNoteOverride] = useState<string | null>(null)
  const [suggestionNoteOverride, setSuggestionNoteOverride] = useState<string | null>(null)
  const [planModeNoteOverride, setPlanModeNoteOverride] = useState<string | null>(null)
  const [editTransient, setEditTransient] = useState<string | null>(null)
  const [anchorTransient, setAnchorTransient] = useState<string | null>(null)
  const [anchorSelected, setAnchorSelected] = useState<number | null>(null)
  const [anchorPreviewOverride, setAnchorPreviewOverride] = useState<string | null>(null)
  const [editTargetRef, setEditTargetRef] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [terminalOpenedId, setTerminalOpenedId] = useState<string | null>(null)
  const [terminalOutput, setTerminalOutput] = useState<TerminalOutputState | null>(null)
  const [pendingDrafts, setPendingDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [queueDrafts, setQueueDrafts] = useState<ReadonlyMap<string, string>>(new Map())
  const [clarifyAnswers, setClarifyAnswers] = useState<ReadonlyMap<string, { selected: readonly string[], custom: string }>>(new Map())
  const [sending, setSending] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [attachmentBusy, setAttachmentBusy] = useState<string | null>(null)
  const [selectionBusy, setSelectionBusy] = useState<string | null>(null)
  const [pendingBusyId, setPendingBusyId] = useState<string | null>(null)
  const [queueBusyId, setQueueBusyId] = useState<string | null>(null)
  const [clarifyBusy, setClarifyBusy] = useState(false)
  const [approvalBusyKey, setApprovalBusyKey] = useState<string | null>(null)
  const [anchorBusy, setAnchorBusy] = useState(false)
  const [editBusyKey, setEditBusyKey] = useState<string | null>(null)
  const [historyBusy, setHistoryBusy] = useState(false)
  const [replyBusy, setReplyBusy] = useState<string | null>(null)
  const [planModeBusy, setPlanModeBusy] = useState(false)
  const [modelQueueBusy, setModelQueueBusy] = useState(false)

  useEffect(() => {
    container.setAttribute('data-region-state', message.kind === 'read' ? 'read' : 'unavailable')
  }, [container, message.kind])

  // The legacy script rebuilt the queue/pending/clarification rows (and the direct-write
  // sentences) on every projection message; the same resets happen here, keyed on the message.
  useEffect(() => {
    setPendingDrafts(new Map())
    setQueueDrafts(new Map())
    setClarifyAnswers(new Map())
    setEditTransient(null)
    setAnchorTransient(null)
  }, [message])

  const send = (): void => {
    const trimmed = inputText.trim()
    if (trimmed === '' && storedCount === 0) {
      setSessionNoteOverride('先写一条输入再发送（或先上传附件）。')
      return
    }
    setSessionNoteOverride(null)
    setSending(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.sendSession?.(trimmed, mode === 'steer' ? 'steer' : 'queue')
        if (typeof notice === 'string') setSessionNoteOverride(notice)
      } finally {
        setSending(false)
      }
    })()
  }

  const stop = (): void => {
    setSessionNoteOverride(null)
    setStopping(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.stopSession?.()
        if (typeof notice === 'string') setSessionNoteOverride(notice)
      } finally {
        setStopping(false)
      }
    })()
  }

  const resume = (): void => {
    setSessionNoteOverride(null)
    setResuming(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.resumeSession?.()
        if (typeof notice === 'string') setSessionNoteOverride(notice)
      } finally {
        setResuming(false)
      }
    })()
  }

  const pickAttachments = (): void => {
    if (attachmentBusy !== null) return
    setAttachmentBusy('pick')
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.pickAttachments?.()
        if (typeof notice === 'string') setAttachmentNoteOverride(notice)
      } finally {
        setAttachmentBusy(null)
      }
    })()
  }

  const uploadAttachment = (itemId: string): void => {
    if (attachmentBusy !== null) return
    setAttachmentBusy(itemId)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.uploadAttachment?.(itemId)
        if (typeof notice === 'string') setAttachmentNoteOverride(notice)
      } finally {
        setAttachmentBusy(null)
      }
    })()
  }

  const cancelAttachment = (itemId: string): void => {
    if (attachmentBusy !== null) return
    setAttachmentBusy(itemId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.cancelAttachment?.(itemId)
      } finally {
        setAttachmentBusy(null)
      }
    })()
  }

  const selectRef = (kind: 'skill' | 'plugin', ref: string): void => {
    const key = kind + ':' + ref
    if (selectionBusy !== null) return
    setSelectionBusy(key)
    setSelectionNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.selectInputRef?.(kind, ref)
        if (typeof notice === 'string') setSelectionNoteOverride(notice)
      } finally {
        setSelectionBusy(null)
      }
    })()
  }

  const clearRef = (kind: 'skill' | 'plugin', ref: string): void => {
    const key = kind + ':' + ref
    if (selectionBusy !== null) return
    setSelectionBusy(key)
    setSelectionNoteOverride(null)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.clearInputRef?.(kind, ref)
      } finally {
        setSelectionBusy(null)
      }
    })()
  }

  const replyCopy = (): void => {
    const body = replyText ?? ''
    void (async () => {
      let clipped = false
      try {
        if (typeof navigator !== 'undefined' && navigator !== null && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(body)
          clipped = true
        }
      } catch { clipped = false }
      setReplyNoteOverride(clipped ? '已复制回复文本（本机剪贴板；未走任何后端）。' : '本机剪贴板不可用：复制未执行（不伪造成功）。')
    })()
  }

  const replyQuote = (): void => {
    const body = replyText ?? ''
    const excerpt = body.length > 200 ? body.slice(0, 200) + '…' : body
    setInputText('> ' + excerpt + '\n')
    setReplyNoteOverride('引用已填入输入区（未发送）：可编辑后再显式发送。')
  }

  const replyRetryNow = (): void => {
    if (replyBusy !== null) return
    setReplyNoteOverride(null)
    setReplyBusy('retry')
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.replyRetry?.()
        if (typeof notice === 'string') setReplyNoteOverride(notice)
      } finally {
        setReplyBusy(null)
      }
    })()
  }

  const replyAuditNow = (): void => {
    if (replyBusy !== null) return
    setReplyBusy('audit')
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.auditReply?.()
        if (typeof notice === 'string') setReplyNoteOverride(notice)
      } finally {
        setReplyBusy(null)
      }
    })()
  }

  const useSuggestion = (title: string): void => {
    setInputText(title)
    setSuggestionNoteOverride('建议已填入输入区（未发送）：可编辑后再显式发送。')
  }

  const selectTranscriptEdit = (messageRef: string, entryText: string): void => {
    setEditTargetRef(messageRef)
    setEditInput(entryText)
    setEditNoteOverride(null)
    setEditTransient('正在编辑这条消息：保存后产生新版本（原消息保持原样，不被历史改写）。')
  }

  const saveEditNow = (): void => {
    if (editTargetRef === null) {
      setEditNoteOverride('先从下方会话记录里选一条已发消息。')
      return
    }
    if (editBusyKey !== null) return
    setEditBusyKey('save')
    setEditNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.saveEdit?.(editTargetRef, editInput)
        if (typeof notice === 'string') setEditNoteOverride(notice)
      } finally {
        setEditBusyKey(null)
      }
    })()
  }

  const resendEditNow = (editId: string): void => {
    if (editBusyKey !== null) return
    setEditBusyKey(editId)
    setEditNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.resendEdit?.(editId)
        if (typeof notice === 'string') setEditNoteOverride(notice)
      } finally {
        setEditBusyKey(null)
      }
    })()
  }

  const verifyEditNow = (editId: string): void => {
    if (editBusyKey !== null) return
    setEditBusyKey(editId)
    setEditNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.verifyEdit?.(editId)
        if (typeof notice === 'string') setEditNoteOverride(notice)
      } finally {
        setEditBusyKey(null)
      }
    })()
  }

  const readHistoryNow = (beforeSeq?: number): void => {
    if (historyBusy) return
    setHistoryBusy(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.readHistory?.(beforeSeq)
        if (typeof notice === 'string') setHistoryNoteOverride(notice)
      } finally {
        setHistoryBusy(false)
      }
    })()
  }

  const readHistoryMore = (): void => {
    const beforeSeq = history !== null && typeof history.nextBeforeSeq === 'number' ? history.nextBeforeSeq : undefined
    if (beforeSeq === undefined) return
    readHistoryNow(beforeSeq)
  }

  const readDetailNow = (runSeq: number): void => {
    if (historyBusy) return
    setHistoryBusy(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.readHistoryDetail?.(runSeq)
      } finally {
        setHistoryBusy(false)
      }
    })()
  }

  const readAnchorsNow = (): void => {
    if (anchorBusy) return
    setAnchorBusy(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.readAnchors?.()
        if (typeof notice === 'string') setAnchorNoteOverride(notice)
      } finally {
        setAnchorBusy(false)
      }
    })()
  }

  const previewAnchor = (entry: { readonly runSeq: number, readonly turn: number | null, readonly promptPreview: string }): void => {
    setAnchorSelected(entry.runSeq)
    setAnchorPreviewOverride(null)
    setAnchorTransient('锚点短预览（运行 @' + String(entry.runSeq) + '）：有界短预览，未载入整段正文；点「定位到此轮消息」再显式定位。')
  }

  const locateAnchorNow = (): void => {
    if (anchorSelected === null || anchorBusy) return
    setAnchorBusy(true)
    setAnchorNoteOverride(null)
    void (async () => {
      try {
        const result = await window.__SAGE_LEGACY_ACTIONS__?.locateAnchor?.(anchorSelected)
        if (result !== undefined && result !== null) {
          if (result.kind === 'located') {
            setAnchorPreviewOverride(result.previewText)
            setAnchorNoteOverride(result.notice)
          } else if (typeof result.notice === 'string') {
            setAnchorNoteOverride(result.notice)
          }
        }
      } finally {
        setAnchorBusy(false)
      }
    })()
  }

  const closeAnchorPreview = (): void => {
    setAnchorSelected(null)
    setAnchorPreviewOverride(null)
  }

  const submitClarificationNow = (requestId: string): void => {
    if (clarifyBusy) return
    const card = clarifyCards.find((entry) => entry.requestId === requestId) ?? null
    if (card === null) return
    const questions = rows(card.questions)
    const answers = questions.map((question) => {
      const questionId = text(question.questionId)
      const answer = clarifyAnswers.get(requestId + ':' + questionId) ?? { selected: [], custom: '' }
      const custom = answer.custom.trim()
      return { questionId, selected: answer.selected, ...(custom === '' ? {} : { custom }) }
    })
    setClarifyBusy(true)
    setClarificationNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.submitClarification?.(requestId, answers)
        if (typeof notice === 'string') setClarificationNoteOverride(notice)
      } finally {
        setClarifyBusy(false)
      }
    })()
  }

  const verifyClarificationNow = (): void => {
    if (clarifyBusy) return
    setClarifyBusy(true)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.verifyClarification?.()
      } finally {
        setClarifyBusy(false)
      }
    })()
  }

  const answerApprovalNow = (requestId: string, outcome: 'allowed-once' | 'rejected'): void => {
    if (approvalBusyKey !== null) return
    setApprovalBusyKey(requestId)
    setApprovalNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.answerApproval?.(requestId, outcome)
        if (typeof notice === 'string') setApprovalNoteOverride(notice)
      } finally {
        setApprovalBusyKey(null)
      }
    })()
  }

  const withdrawApprovalNow = (requestId: string): void => {
    if (approvalBusyKey !== null) return
    setApprovalBusyKey(requestId)
    setApprovalNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.withdrawApproval?.(requestId)
        if (typeof notice === 'string') setApprovalNoteOverride(notice)
      } finally {
        setApprovalBusyKey(null)
      }
    })()
  }

  const verifyApprovalNow = (): void => {
    if (approvalBusyKey !== null) return
    setApprovalBusyKey('verify')
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.verifyApproval?.()
        if (typeof notice === 'string') setApprovalNoteOverride(notice)
      } finally {
        setApprovalBusyKey(null)
      }
    })()
  }

  const verifyModelQueueNow = (): void => {
    if (modelQueueBusy) return
    setModelQueueBusy(true)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.verifyModelQueue?.()
        if (typeof notice === 'string') setModelQueueNoteOverride(notice)
      } finally {
        setModelQueueBusy(false)
      }
    })()
  }

  const editPending = (itemId: string): void => {
    const draft = pendingDrafts.get(itemId)
    const trimmed = draft !== undefined ? draft.trim() : ''
    if (trimmed === '') return
    if (pendingBusyId !== null) return
    setPendingBusyId(itemId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.editPendingItem?.(itemId, trimmed)
      } finally {
        setPendingBusyId(null)
      }
    })()
  }

  const removePending = (itemId: string): void => {
    if (pendingBusyId !== null) return
    setPendingBusyId(itemId)
    void (async () => {
      try {
        await window.__SAGE_LEGACY_ACTIONS__?.removePendingItem?.(itemId)
      } finally {
        setPendingBusyId(null)
      }
    })()
  }

  const editQueue = (itemId: string): void => {
    const draft = queueDrafts.get(itemId)
    const trimmed = draft !== undefined ? draft.trim() : ''
    if (trimmed === '') return
    if (queueBusyId !== null) return
    setQueueBusyId(itemId)
    setQueueNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.editQueueItem?.(itemId, trimmed)
        if (typeof notice === 'string') setQueueNoteOverride(notice)
      } finally {
        setQueueBusyId(null)
      }
    })()
  }

  const removeQueue = (itemId: string): void => {
    if (queueBusyId !== null) return
    setQueueBusyId(itemId)
    setQueueNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.removeQueueItem?.(itemId)
        if (typeof notice === 'string') setQueueNoteOverride(notice)
      } finally {
        setQueueBusyId(null)
      }
    })()
  }

  const setPlanModeNow = (active: boolean): void => {
    if (planModeBusy) return
    setPlanModeBusy(true)
    setPlanModeNoteOverride(null)
    void (async () => {
      try {
        const notice = await window.__SAGE_LEGACY_ACTIONS__?.setPlanMode?.(active)
        if (typeof notice === 'string') setPlanModeNoteOverride(notice)
      } finally {
        setPlanModeBusy(false)
      }
    })()
  }

  const openTerminalNow = (terminalId: string): void => {
    if (terminalOpenedId === terminalId) {
      // 关闭是纯本地开关：零请求，也不影响执行（没有任何写路径可触达）。
      setTerminalOpenedId(null)
      setTerminalOutput({ kind: 'closed' })
      return
    }
    void (async () => {
      const result = await window.__SAGE_LEGACY_ACTIONS__?.openTerminal?.(terminalId)
      if (result === undefined || result === null) return
      if (result.kind === 'read') {
        setTerminalOpenedId(terminalId)
        setTerminalOutput({
          kind: 'read',
          text: result.text,
          lineBegin: result.lineBegin,
          lineEnd: result.lineEnd,
          totalLines: result.totalLines,
          truncated: result.truncated,
        })
      } else {
        setTerminalOpenedId(null)
        setTerminalOutput({ kind: 'notice', notice: result.notice })
      }
    })()
  }

  // ---- derived display words (the legacy renderer's own sentences) ----
  const sessionIdText = channel !== null && typeof channel.sessionId === 'string' && channel.sessionId !== ''
    ? channel.sessionId
    : state === 'no-session' ? '还没有会话（发送后才会创建）' : '未核验'
  const sendStateText = echoes.length === 0 ? '尚未发送' : '已受理 · ' + String(echoes.length) + ' 条（进入队列；执行与否看下一行）'
  const executionText = unavailable ? '未核验'
    : channel !== null && channel.execution === 'executing' ? '执行中（日志里有一轮未结束）'
      : channel !== null && typeof channel.lastTurnEnd === 'string' && channel.lastTurnEnd !== '' ? '本轮已结束（' + channel.lastTurnEnd + '）'
        : '空闲（没有未结束的一轮）'
  const sessionNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : state === 'no-session' ? '还没有为这个事项建立会话；发出第一条输入时才会创建。'
      : channel !== null && channel.streamBroken === true ? '流已断开：' + String(channel.code ?? 'unknown') + '（最终文本以历史对账为准）'
        : channel !== null && channel.reconciled === true ? '已按历史对账：下面助手这一段是从会话历史读回的最终文本。'
          : ''
  const sessionNote = sessionNoteOverride ?? sessionNoteDerived
  const pendingNoteText = !known ? ''
    : paused ? '已暂停：新输入只会存成待继续项，不会自动送去执行；点「继续」才按顺序派发。'
      : pendingItems.length > 0 ? '未暂停；下列待继续项要等一次显式「继续」才会派发。' : ''
  const modelQueueNoteDerived = modelQueue === null || modelQueue.state === 'unavailable'
    ? '未核验：模型排队读取端口未接线（' + String(modelQueue?.reason ?? 'model-queue-provider-unavailable') + '）；不以空状态冒充。'
    : modelQueue.state === 'no-session' ? '还没有会话：没有模型排队或重试可读（读取不会创建会话）。'
      : modelQueueVerdict === 'waiting' && modelQueueLast !== null ? '排队等待恢复（' + attemptText(modelQueueLast) + '，全部为服务事实）：服务端安排 ' + String(modelQueueLast.delayMs) + ' ms 后继续，原因 ' + String(modelQueueLast.failureCode) + '——就绪只看日志事实，不用界面倒计时。'
        : modelQueueVerdict === 'retrying' && modelQueueLast !== null ? '重试进行中（' + attemptText(modelQueueLast) + ' 尝试已开始）：等待本轮进展；这不是失败，也不是需要重复提交。'
          : modelQueueVerdict === 'ready' ? '已恢复（就绪）：重试等待成功后本轮已有输出（服务事实：llm/retry-started + 消息）——无需重复提交。'
            : modelQueueVerdict === 'unknown' ? '结果未知：该等待所在轮次已结束且未见恢复证据——只给核对（重新读取），不给重试。'
              : '当前没有进行中的模型排队或重试。'
  const modelQueueNote = modelQueueNoteOverride ?? modelQueueNoteDerived
  const terminalNoteDerived = terminal === null || terminal.state === 'unavailable'
    ? '未就绪：终端能力不可用（' + String(terminal?.reason ?? 'terminals-provider-unavailable') + '）——缺项未满足，不显示空终端。'
    : terminal.state === 'no-session' ? '还没有会话：没有可观察的终端（读取不会创建会话）。'
      : terminalSessions.length === 0 ? '当前没有终端会话：这里只作只读观察，不在此创建终端。'
        : '终端 ' + String(terminalSessions.length) + ' 项（只读运行观察；打开/关闭面板不影响执行）。'
  const terminalOutputNote = terminalOutput === null ? ''
    : terminalOutput.kind === 'read' ? '只读运行观察（第 ' + String(terminalOutput.lineBegin) + '–' + String(terminalOutput.lineEnd) + ' 行 / 共 ' + String(terminalOutput.totalLines) + ' 行'
      + (terminalOutput.truncated === true ? '；已被上限截断' : '') + '）——不进对话历史、不作交付产物，也不接收操作输入。'
      : terminalOutput.kind === 'closed' ? '已关闭输出面板（纯本地；运行不受影响）。'
        : String(terminalOutput.notice ?? '')
  const selectionNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : selections === null || selections.state === 'unavailable' ? '未核验：技能清单不可读（不以空列表冒充能力）；挂载行见下。'
      : typeof selections.skillsNote === 'string' ? selections.skillsNote
        : '引用只随下一次发送携带；本次请求受理后自动清空（不改变任何启用状态）。'
  const selectionNote = selectionNoteOverride ?? selectionNoteDerived
  const planModeNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : planMode === null || planMode.state === 'unavailable' ? '未核验：模式状态未接线（' + String(planMode?.reason ?? 'plan-mode-unavailable') + '）；不以默认值冒充。'
      : planMode.state === 'no-session' ? '还没有会话：没有可切换的模式状态（读取不会创建会话）。'
        : planModePending ? '切换已登记：将在下一步生效；当前实际为' + (planModeActive ? '计划模式' : '目标模式') + '。'
          : '当前：' + (planModeActive ? '计划模式（只出方案；其中动作仍需执行前确认）' : '目标模式。')
  const planModeNote = planModeNoteOverride ?? planModeNoteDerived
  const attachmentNoteDerived = attachments === null ? '未核验：这一版还没有接上附件端口。'
    : storedCount > 0 ? String(storedCount) + ' 项已上传（内容核验通过），将随下一条消息发送；发送与否以会话受理回执为准。'
      : attachmentItems.length > 0 ? '候选尚未上传；"确认上传"才会经运行时上传并核验内容。'
        : ''
  const attachmentNote = attachmentNoteOverride ?? attachmentNoteDerived
  const replyNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : state === 'no-session' ? '还没有为这个事项建立会话；发出第一条输入时才会创建。'
      : reply === null || replyText === null ? '还没有可操作的回复（读到回复文本后才会出现操作）。'
        : replyUncertain ? '会话流已断：状态未知——只给核对入口，不给重试。'
          : reply !== null && reply.failed === true ? '上一轮以确定失败结束（' + String(reply.endKind) + '）：只提供已核实动作——复制、引用、重试。'
            : '回复操作只提供已核实动作（复制、引用）；本版不会在非确定失败时提供重试。'
  const replyNote = replyNoteOverride ?? replyNoteDerived
  const suggestionNoteDerived = suggestions === null ? '后续建议未核验：方案投影未接线（不以固定文案冒充建议）。'
    : suggestions.length === 0 ? '当前没有可用的后续建议（建议来自方案投影中可推进的步骤）。'
      : '共 ' + String(suggestions.length) + ' 条后续建议（点击只填入输入区）。'
  const suggestionNote = suggestionNoteOverride ?? suggestionNoteDerived
  const queueNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : paused ? '已暂停：队列面板只显示待继续（见上）；恢复后才按顺序派发。本版没有定时或循环自动化入口。'
      : queueSlice === null || queueSlice.state !== 'read' ? '未核验：这一版没有读到队列快照（不以空列表冒充）。本版没有定时或循环自动化入口。'
        : rows(queueSlice.occurrences).length === 0 ? '队列为空（权威快照；不是能力清单）。本版没有定时或循环自动化入口。'
          : '来自基座权威队列快照（' + String(rows(queueSlice.occurrences).length) + ' 项；steer 只在步骤边界消费）。本版没有定时或循环自动化入口。'
  const queueNote = queueNoteOverride ?? queueNoteDerived
  const clarificationNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : clarifications === null || clarifications.state === 'unavailable' ? '未核验：澄清读取端口未接线（不以空列表冒充能力）。'
      : clarifications.state === 'no-session' ? '还没有会话：没有运行中的澄清提问可读（读取不会创建会话）。'
        : clarifyCards.length === 0 ? '当前没有待回答的澄清提问（提问只在运行中由模型发出）。'
          : '共 ' + String(clarifyCards.length) + ' 个待回答的澄清提问（回答前不派发依赖该答案的后续步骤）。'
  const clarificationNote = clarificationNoteOverride ?? clarificationNoteDerived
  const approvalNoteDerived = approvals === null || approvals.state === 'unavailable'
    ? '未核验：授权等待端口未接线（' + String(approvals?.code ?? 'approval-relay-unavailable') + '）；不以空列表冒充。'
    : approvals.state === 'no-session' ? '还没有会话：没有进行中的外部授权等待（读取不会创建会话）。'
      : approvalCards.length > 0 ? '等待授权 ' + String(approvalCards.length) + ' 项：未批准前依赖动作保持阻断（等待≠失败，也≠已批准）。'
        : '当前没有进行中的授权等待：未获授权的依赖动作保持阻断。'
  const approvalNote = approvalNoteOverride ?? approvalNoteDerived
  const anchorNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : anchorsSlice === null || anchorsSlice.state === 'unavailable' ? '未核验：锚点读取端口未接线（不以空列表冒充能力）。'
      : anchorsSlice.state === 'no-session' ? '还没有会话：没有可定位的轮次锚点（读取不会创建会话）。'
        : anchorList.length === 0 ? '还没有读取锚点：点「读取锚点（最近轮次）」走纯历史接点（不会激活执行）。'
          : '共 ' + String(anchorList.length) + ' 个轮次锚点（按时间倒序；点击先看短预览，再显式定位）。'
  const anchorNote = anchorNoteOverride ?? anchorTransient ?? anchorNoteDerived
  const anchorPreviewText = anchorPreviewOverride ?? (anchorSelected !== null
    ? (() => {
        const entry = anchorList.find((candidate) => candidate.runSeq === anchorSelected) ?? null
        if (entry === null) return ''
        return '运行 @' + String(entry.runSeq) + (entry.turn !== null ? '·第 ' + String(entry.turn) + ' 轮' : '')
          + '：' + (entry.promptPreview !== '' ? entry.promptPreview : '（该轮没有用户文本预览）')
      })()
    : '')
  const editNoteDerived = editsSlice === null ? '未核验：编辑记录端口未接线（不以空列表冒充能力）。'
    : editRecords.length === 0 ? '还没有编辑稿：在会话记录里点某条已发消息的「编辑」。'
      : '共 ' + String(editRecords.length) + ' 份编辑稿（原消息保持原样；重发只走高版本链、同一发送入口）。'
  const editNote = editNoteOverride ?? editTransient ?? editNoteDerived
  const historyNoteDerived = unavailable ? '未核验：这一版还没有接上会话通道。'
    : !historyKnown ? '未核验：历史读取端口未接线（不以空列表冒充能力）。'
      : runs.length === 0 ? '还没有读取历史运行：点「读取历史运行」走纯历史接点（打开历史不会激活执行）。'
        : '共 ' + String(runs.length) + ' 次运行（按时间倒序；默认展开最近一次的输出与产物卡；更早的运行按页加载）。'
  const historyNote = historyNoteOverride ?? historyNoteDerived
  const editRecordViews = editRecords.filter((record) => typeof record.editId === 'string' && Array.isArray(record.versions)).map((record) => {
    const editId = record.editId as string
    const versions = rows(record.versions).filter((version) => typeof version.version === 'number').map((version) => ({
      version: version.version as number,
      active: version.version === record.activeVersion,
      text: bounded(version.text),
      status: submissionText(version),
    }))
    const activeRaw = rows(record.versions).find((version) => version.version === record.activeVersion) ?? null
    const activeAction = activeRaw === null ? null
      : activeRaw.submission === 'unknown' || activeRaw.submission === 'accepted' ? { kind: 'verify' as const, version: activeRaw.version as number }
        : { kind: 'resend' as const, version: activeRaw.version as number }
    return { editId, messageRef: String(record.messageRef ?? ''), originalText: bounded(record.originalText), versions, activeAction }
  })
  const detailRaw = historyKnown && history !== null ? asRecord(history.detail) : null
  const historyDetail: HistoryDetailView | null = detailRaw === null ? null : {
    state: text(detailRaw.state),
    code: text(detailRaw.code),
    runSeq: typeof detailRaw.runSeq === 'number' ? detailRaw.runSeq : null,
    model: text(detailRaw.model),
    provider: text(detailRaw.provider),
    userTexts: Array.isArray(detailRaw.userTexts) ? detailRaw.userTexts.filter((entry): entry is string => typeof entry === 'string') : [],
    outputPreview: typeof detailRaw.outputPreview === 'string' ? detailRaw.outputPreview : '',
    outputTruncated: detailRaw.outputTruncated === true,
    clarifications: Array.isArray(detailRaw.clarifications) ? rows(detailRaw.clarifications) : [],
  }

  return (
    <>
      <div className="sage-card-head"><span className="sage-card-label">MAIN CONVERSATION · ACK ≠ EXECUTION</span><span className="sage-card-index">D3</span></div>
      <h2>事项主对话</h2>
      <p className="sage-card-note">发出输入后基座先回执"已受理"——<strong>回执只表示进了队列，不表示模型已开始工作</strong>；执行中与否只看会话日志里有没有未结束的一轮。流断了会自动按历史重新对账，最终文本以历史为准；重开只读历史，不会重复发送。</p>
      <div className="sage-state-row"><span>会话</span><strong id="session-id">{sessionIdText}</strong></div>
      <div className="sage-state-row"><span>受理</span><strong id="session-send-state" data-session-fact>{sendStateText}</strong></div>
      <div className="sage-state-row">
        <span>发送方式</span>
        <select className="sage-row-input" id="session-mode" aria-label="发送方式" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="queue">排队（本轮结束后处理）</option>
          <option value="steer">步骤边界转向（不打断当前步骤）</option>
        </select>
      </div>
      <div className="sage-state-row"><span>执行</span><strong id="session-execution" data-session-fact>{executionText}</strong></div>
      <span className="sage-card-label">模型排队（服务事实投影：排队等待 / 重试进行中 / 已恢复；与错误三态分开，不提供界面倒计时）</span>
      <p id="model-queue-note" className="sage-card-note" role="status" aria-live="polite">{modelQueueNote}</p>
      <ul className="sage-roster-list" id="model-queue-rows">
        {modelQueueRetries.map((entry) => {
          const retryId = text(entry.retryId)
          if (retryId === '') return null
          return (
            <li key={retryId} className="sage-roster-row" data-model-queue-retry={retryId}>
              <strong>{attemptText(entry) + ' · 服务端延迟 ' + String(entry.delayMs) + ' ms'}</strong>
              <span className="sage-roster-tag">{'提供方：' + String(entry.provider ?? '未标注') + ' · 原因：' + String(entry.failureCode ?? '未标注')}</span>
              <span className="sage-roster-tag">{entry.started === true ? '尝试已开始' : '等待中（服务端安排）'}</span>
            </li>
          )
        })}
        {modelQueueVerdict === 'unknown' ? (
          <li className="sage-roster-row">
            <button className="sage-row-button" type="button" data-model-queue-verify="last" disabled={modelQueueBusy} onClick={verifyModelQueueNow}>核对（重新读取）</button>
          </li>
        ) : null}
      </ul>
      <span className="sage-card-label">集成终端（只读运行观察：面板内打开/关闭不影响执行；输出不进对话历史、不作产物；不接收操作输入）</span>
      <p id="terminal-note" className="sage-card-note" role="status" aria-live="polite">{terminalNoteDerived}</p>
      <ul className="sage-roster-list" id="terminal-rows">
        {terminalSessions.map((session) => {
          const terminalId = text(session.terminalId)
          if (terminalId === '') return null
          const status = asRecord(session.status)
          const statusText = status !== null && status.kind === 'exited'
            ? '已退出' + (typeof status.exitCode === 'number' ? '（exitCode ' + String(status.exitCode) + '）' : '') + (typeof status.signal === 'string' && status.signal !== '' ? '（' + status.signal + '）' : '')
            : '运行中'
          return (
            <li key={terminalId} className="sage-roster-row" data-terminal-row={terminalId}>
              <strong>{(typeof session.name === 'string' && session.name !== '' ? session.name : terminalId) + ' · ' + String(session.type ?? '')}</strong>
              <span className="sage-roster-tag">{statusText}</span>
              <button className="sage-row-button" type="button" data-terminal-open={terminalId} onClick={() => openTerminalNow(terminalId)}>{terminalOpenedId === terminalId ? '关闭输出' : '打开输出（只读）'}</button>
            </li>
          )
        })}
      </ul>
      <pre id="terminal-output" className="sage-plan-preview" hidden={terminalOutput === null || terminalOutput.kind !== 'read'}>{terminalOutput !== null && terminalOutput.kind === 'read' ? String(terminalOutput.text ?? '') : ''}</pre>
      <p id="terminal-output-note" className="sage-card-note" role="status" aria-live="polite">{terminalOutputNote}</p>
      <textarea className="sage-draft-input" id="session-input" rows={2} aria-label="发给事项主对话的输入" value={inputText} onChange={(event) => setInputText(event.target.value)} />
      <button className="sage-secondary-button" id="session-send" type="button" disabled={sending} onClick={send}>发送</button>
      <button className="sage-secondary-button" id="session-stop" type="button" disabled={unavailable || paused || stopping} onClick={stop}>停止</button>
      <button className="sage-secondary-button" id="session-resume" type="button" disabled={unavailable || !paused || resuming} onClick={resume}>继续（派发待继续项）</button>
      <span className="sage-card-label">引用（只读清单：来自实际挂载；选择只随下一次发送携带，不改变启用状态）</span>
      <p id="selection-note" className="sage-card-note" role="status" aria-live="polite">{selectionNote}</p>
      <ul className="sage-roster-list" id="selection-skills">
        {skillRows.map((skill) => {
          const name = text(skill.name)
          if (name === '') return null
          const key = 'skill:' + name
          return (
            <li key={name} className="sage-roster-row" data-skill-row={name}>
              <strong>{name}</strong>
              <span className="sage-roster-tag">{'来源：' + String(skill.source ?? '未标注') + (typeof skill.provider === 'string' && skill.provider !== '' ? '·' + skill.provider : '')}</span>
              <span className="sage-roster-tag">{skill.userInvocable === true ? '可选用（本入口）' : '仅模型可调用（本入口不可选）'}</span>
              {skill.userInvocable === true ? (
                <button className="sage-row-button" type="button" data-selection-action="select" data-selection-kind="skill" data-selection-ref={name} disabled={selectionBusy === key} onClick={() => selectRef('skill', name)}>选用</button>
              ) : (
                <button className="sage-row-button" type="button" disabled>选用</button>
              )}
            </li>
          )
        })}
      </ul>
      <ul className="sage-roster-list" id="selection-plugins">
        {selections !== null && selections.pluginsNote !== null && selections.pluginsNote !== undefined ? (
          <li className="sage-roster-row">{String(selections.pluginsNote)}</li>
        ) : (
          pluginRows.map((plugin) => {
            const identity = text(plugin.identity)
            if (identity === '') return null
            const key = 'plugin:' + identity
            return (
              <li key={identity} className="sage-roster-row" data-plugin-row={identity}>
                <strong>{identity}</strong>
                <span className="sage-roster-tag">{'已挂载（组合内实际存在）' + (typeof plugin.version === 'string' && plugin.version !== '' ? '·v' + plugin.version : '')}</span>
                <button className="sage-row-button" type="button" data-selection-action="select" data-selection-kind="plugin" data-selection-ref={identity} disabled={selectionBusy === key} onClick={() => selectRef('plugin', identity)}>选用</button>
              </li>
            )
          })
        )}
      </ul>
      <ul className="sage-roster-list" id="selection-chips">
        {selectedRows.map((entry) => {
          const ref = text(entry.ref)
          if (ref === '') return null
          const key = text(entry.kind) + ':' + ref
          return (
            <li key={key} className="sage-roster-row" data-selection-chip={ref}>
              <span className="sage-roster-tag">{entry.kind === 'skill' ? '已选：技能 ' + ref + '（随下一次发送携带）' : '已选：插件 ' + ref + '（随下一次发送携带；不改变启用状态，也不代表已获得能力）'}</span>
              <button className="sage-row-button" type="button" data-selection-clear={ref} data-selection-kind={String(entry.kind)} disabled={selectionBusy === key} onClick={() => clearRef(entry.kind === 'skill' ? 'skill' : 'plugin', ref)}>清除</button>
            </li>
          )
        })}
      </ul>
      <span className="sage-card-label">模式（目标=执行；计划=只出方案。状态来自服务投影；切换经具名请求，回执后才显示为新模式；不写任何默认值）</span>
      <div className="sage-mode-bar" id="plan-mode-bar">
        <button className="sage-row-button" id="plan-mode-goal" data-plan-mode="goal" type="button" disabled={!planModeRead || planModeBusy} data-plan-mode-state={planModeRead ? (planModeActive ? (planModePending ? 'pending-target' : 'idle') : 'active') : 'unavailable'} onClick={() => setPlanModeNow(false)}>目标模式{planModeRead && !planModeActive ? '（当前）' : planModeRead && planModeActive && planModePending ? '（下一步生效）' : ''}</button>
        <button className="sage-row-button" id="plan-mode-plan" data-plan-mode="plan" type="button" disabled={!planModeRead || planModeBusy} data-plan-mode-state={planModeRead ? (planModeActive ? 'active' : planModePending ? 'pending-target' : 'idle') : 'unavailable'} onClick={() => setPlanModeNow(true)}>计划模式{planModeRead && planModeActive ? '（当前）' : planModeRead && !planModeActive && planModePending ? '（下一步生效）' : ''}</button>
      </div>
      <p id="plan-mode-note" className="sage-card-note" role="status" aria-live="polite">{planModeNote}</p>
      <div className="sage-attachment-block" aria-label="附件">
        <span className="sage-card-label">ATTACHMENTS · PICK → UPLOAD → SEND</span>
        <p className="sage-card-note">附件只随消息走：选择文件只产生候选（不读取、不上传）；确认上传后走运行时流式上传——回执内容摘要与本地封存一致才算内容核验通过，<strong>上传成功不等于模型已读取</strong>。已上传未发送的附件随下一条消息发出；重开事项沿历史回看、不重跑上传；本版没有独立附件面板与跨消息复用。</p>
        <button className="sage-secondary-button" id="attachment-pick" type="button" disabled={attachmentBusy !== null} onClick={pickAttachments}>选择文件…</button>
        <p id="attachment-note" className="sage-card-note" role="status" aria-live="polite">{attachmentNote}</p>
        <ul className="sage-roster-list" id="attachment-items">
          {attachmentItems.map((item) => {
            const itemId = text(item.itemId)
            if (itemId === '') return null
            const stage = text(item.stage, 'candidate')
            const stageText = stage === 'candidate' ? '候选（未上传）'
              : stage === 'uploading' ? '传输中 ' + String(item.sentBytes ?? 0) + '/' + String(item.bytes) + ' 字节'
                : stage === 'stored' ? '已上传 · 内容核验通过（将随下一条消息发送）'
                  : stage === 'sent' ? '已随消息发送（关联于该会话）'
                    : stage === 'failed' ? '上传失败（可重试同一封存版本）'
                      : stage === 'source-changed' ? '源内容在选取与上传间发生变化（需重新选择）'
                        : '已取消（不会随消息发送）'
            const itemActions = stage === 'candidate' ? ['upload', 'cancel'] : stage === 'failed' ? ['upload', 'cancel'] : stage === 'uploading' ? ['cancel'] : stage === 'stored' ? ['cancel'] : []
            return (
              <li key={itemId} className="sage-roster-row" data-attachment-id={itemId} data-attachment-stage={stage}>
                <span className="sage-roster-tag">{stageText}</span>
                <span>{String(item.name ?? '') + '（' + String(item.bytes ?? 0) + ' 字节）'}</span>
                {itemActions.map((action) => (
                  <button
                    key={action}
                    className="sage-row-button"
                    type="button"
                    data-attachment-action={action}
                    data-attachment-id={itemId}
                    disabled={attachmentBusy !== null}
                    onClick={() => { if (action === 'upload') uploadAttachment(itemId); else cancelAttachment(itemId) }}
                  >
                    {action === 'upload' ? (stage === 'failed' ? '重试上传' : '确认上传') : action === 'cancel' ? (stage === 'uploading' ? '取消上传' : '移除') : action}
                  </button>
                ))}
              </li>
            )
          })}
        </ul>
      </div>
      <p id="session-note" className="sage-card-note" role="status" aria-live="polite">{sessionNote}</p>
      <ul className="sage-roster-list" id="session-transcript">
        {transcript.map((entry, index) => {
          const entryText = text(entry.text)
          const role = text(entry.role)
          const source = text(entry.source)
          const tag = role === 'user' ? (source === 'history' ? '我 · 历史' : '我（本机回显）') : source === 'history' ? '助手 · 历史' : '助手'
          const messageRef = typeof entry.messageRef === 'string' ? entry.messageRef : ''
          const files = rows(entry.attachments)
          return (
            <li key={'entry-' + String(index)} className="sage-roster-row" data-session-role={role} data-session-source={source}>
              <span className="sage-roster-tag">{tag}</span>
              <span>{entryText}</span>
              {role === 'user' && messageRef !== '' ? (
                <button className="sage-row-button" type="button" data-edit-message={messageRef} data-edit-text={entryText} onClick={() => selectTranscriptEdit(messageRef, entryText)}>编辑</button>
              ) : null}
              {files.map((file) => {
                const name = text(file.name)
                if (name === '') return null
                return (
                  <span key={String(file.attachmentId)} className="sage-roster-tag" data-session-attachment={String(file.attachmentId)}>
                    {'附件：' + name + '（' + String(file.bytes) + ' 字节 · 内容核验通过）'}
                  </span>
                )
              })}
            </li>
          )
        })}
      </ul>
      <span className="sage-card-label">回复操作（只提供已核实动作：复制、引用、仅确定失败时重试；未知只给核对）</span>
      <div id="reply-actions">
        {reply !== null ? (
          <>
            {replyActionsList.map((action) => {
              if (action !== 'copy' && action !== 'quote' && action !== 'retry') return null
              if (action === 'retry' && replyUncertain) return null
              return (
                <button
                  key={action}
                  className="sage-row-button"
                  type="button"
                  data-reply-action={action}
                  disabled={action === 'retry' ? replyBusy !== null : false}
                  onClick={() => { if (action === 'copy') replyCopy(); else if (action === 'quote') replyQuote(); else replyRetryNow() }}
                >
                  {action === 'copy' ? '复制回复' : action === 'quote' ? '引用' : '重试上一轮（确定失败）'}
                </button>
              )
            })}
            {replyUncertain ? (
              <button className="sage-row-button" type="button" data-reply-audit="true" disabled={replyBusy !== null} onClick={replyAuditNow}>核对（重新读取会话）</button>
            ) : null}
          </>
        ) : null}
      </div>
      <p id="reply-note" className="sage-card-note" role="status" aria-live="polite">{replyNote}</p>
      <span className="sage-card-label">后续建议（点击只填入输入区，不自动发送）</span>
      <p id="suggestion-note" className="sage-card-note">{suggestionNote}</p>
      <ul className="sage-roster-list" id="suggestion-chips">
        {(suggestions ?? []).map((title) => (
          <li key={title} className="sage-roster-row">
            <button className="sage-row-button" type="button" data-suggestion-text={title} onClick={() => useSuggestion(title)}>{'建议：' + title.slice(0, 200)}</button>
          </li>
        ))}
      </ul>
      <PendingBlock
        pending={known ? pendingItems : []}
        drafts={pendingDrafts}
        busyId={pendingBusyId}
        onDraft={(itemId, value) => setPendingDrafts((current) => { const next = new Map(current); next.set(itemId, value); return next })}
        onEdit={editPending}
        onRemove={removePending}
        note={pendingNoteText}
      />
      <p className="sage-card-note">会话内队列（只读快照 + 逐项修改；本版没有定时或循环自动化入口）。</p>
      <QueueBlock
        occurrences={queueRead && queueSlice !== null ? rows(queueSlice.occurrences) : []}
        drafts={queueDrafts}
        busyId={queueBusyId}
        onDraft={(itemId, value) => setQueueDrafts((current) => { const next = new Map(current); next.set(itemId, value); return next })}
        onEdit={editQueue}
        onRemove={removeQueue}
        note={queueNote}
      />
      <p className="sage-card-note">澄清问答（提问来自运行中的提问工具；<strong>回答前不派发依赖该答案的后续步骤</strong>；候选项与自定义回答同权，一次只提交所属会话——答案不写成事项事实或交付字段）。</p>
      <ClarificationsBlock
        cards={clarifyCards}
        deferred={clarifyDeferred}
        receipts={clarifyReceipts}
        answerOf={(requestId, questionId) => clarifyAnswers.get(requestId + ':' + questionId) ?? { selected: [], custom: '' }}
        onAnswer={(requestId, questionId, next) => setClarifyAnswers((current) => { const map = new Map(current); map.set(requestId + ':' + questionId, next); return map })}
        onSubmit={submitClarificationNow}
        onVerify={verifyClarificationNow}
        busy={clarifyBusy}
        note={clarificationNote}
      />
      <span className="sage-card-label">外部授权（等待中：未批准也未失败；撤回是具名动作；失效需重新申请）</span>
      <ApprovalsBlock
        cards={approvalCards}
        lapsed={approvalLapsed}
        receipts={approvalReceipts}
        busyKey={approvalBusyKey}
        onAnswer={answerApprovalNow}
        onWithdraw={withdrawApprovalNow}
        onVerify={verifyApprovalNow}
        note={approvalNote}
      />
      <p className="sage-card-note">消息锚点（轮次跳转：读取只走纯历史接点——<strong>不整段载入正文、不激活执行</strong>；点击锚点先给短预览，再显式定位；hover 不提交任何命令）。</p>
      <AnchorsBlock
        anchors={anchorList}
        located={locatedAnchor}
        selected={anchorSelected}
        previewText={anchorPreviewText}
        busy={anchorBusy}
        onRead={readAnchorsNow}
        onPreview={previewAnchor}
        onLocate={locateAnchorNow}
        onClose={closeAnchorPreview}
        note={anchorNote}
      />
      <p className="sage-card-note">编辑与重发（<strong>原消息不被改写</strong>：编辑产生新版本并保留原版本与提交关系；重发以新版本内容走同一发送入口——重复点击不并行发起、原消息不重复派发；结果未知只给「核对同一操作」，不自动重试）。</p>
      <EditsBlock
        targetRef={editTargetRef}
        input={editInput}
        onInput={setEditInput}
        onSave={saveEditNow}
        records={editRecordViews}
        busyKey={editBusyKey}
        onVerify={verifyEditNow}
        onResend={resendEditNow}
        note={editNote}
      />
      <p className="sage-card-note">历史运行（纯历史接点读取：<strong>打开历史不激活执行、不重复发送、不重跑上传</strong>；默认只展开最近一次；两次运行对照后置）。</p>
      <HistoryBlock
        runs={runs}
        hasMore={historyKnown && history !== null && history.hasMore === true}
        known={historyKnown}
        detail={historyDetail}
        busy={historyBusy}
        onRead={() => readHistoryNow()}
        onMore={readHistoryMore}
        onDetail={readDetailNow}
        note={historyNote}
      />
    </>
  )
}
