/** Ticket 005 (US-012/013): the narrowest execution path — send, ack, stream, reconcile.
 *
 * Three rules carry the ticket's acceptance, and all three follow from the base's own contract
 * (`@deepseek-ai/dsh-api-session-controller`):
 *
 * - **ack ≠ execution.** `prompt` answers `{accepted: true}` — "the prompt entered the agent
 *   inbox" — and that answer never becomes "the model started working". Execution state comes
 *   from the session log: an open `turn/start` without its `turn/end` is the only evidence a turn
 *   is running.
 * - **History is the final word.** The live assistant frames are presentation; the reconciled text
 *   is folded from the durable `assistant/message` events read back through `page`. A broken
 *   stream therefore degrades to "re-read the history", not to "keep the partial text as final".
 * - **Reopening never re-sends.** The matter's session binding is persisted; a read reuses the
 *   session and only reads. Sending is a separate, explicit act with its own client-minted id.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { QueueItemOutcome, SessionChannelEntry, SessionChannelStatus, SessionControlOutcome, SessionReplyView, SessionSendOutcome } from '../appservice/contracts.js'
import type { PendingInput, PendingInputsStore } from './pending-inputs.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_TEXT = 16_384
const MAX_ENTRIES = 64

/** Ticket 014: one attachment riding the next send. The receipt is same-session authority; the
 *  file reference is what a transcript row shows — the receipt itself never enters a projection. */
export interface SessionAttachmentInput {
  readonly receiptId: string
  readonly attachmentId: string
  readonly name: string
  readonly bytes: number
}

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** One durable event envelope (`{type:'event', event:{type,seq,...}}`). */
function eventOf(record: unknown): Record<string, unknown> | undefined {
  if (!isRecord(record) || record.type !== 'event' || !isRecord(record.event)) return undefined
  return record.event
}

/** The text parts of one message-shaped payload; anything else yields no text (never a guess). */
function textOf(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const part of content) {
    if (!isRecord(part) || part.type !== 'text' || typeof part.text !== 'string') continue
    parts.push(part.text)
  }
  return parts.length === 0 ? '' : parts.join('\n')
}

/** Ticket 014: the durable file blocks of one message payload (`{type:'file', attachment}`). */
function filesOf(content: unknown): Array<{ readonly attachmentId: string, readonly name: string, readonly bytes: number }> {
  if (!Array.isArray(content)) return []
  const files: Array<{ attachmentId: string, name: string, bytes: number }> = []
  for (const part of content) {
    if (!isRecord(part) || part.type !== 'file' || !isRecord(part.attachment)) continue
    const { attachmentId, name, bytes } = part.attachment
    if (typeof attachmentId === 'string' && attachmentId !== '' && typeof name === 'string' && typeof bytes === 'number') {
      files.push({ attachmentId, name, bytes })
    }
  }
  return files
}

/** One durable user message that carried attachments (its own request id when the base kept one). */
interface FoldedUserMessage {
  readonly requestId: string | null
  readonly text: string
  readonly files: readonly { readonly attachmentId: string, readonly name: string, readonly bytes: number }[]
}

/** ADR-0301: one write/edit tool run inside the last turn (display facts only). ADR-0302 adds
 *  the bounded diff facts from the tool result's own presentation meta (or, for a created file,
 *  the call's own content) — display text only, capped, never a machine path. */
interface FoldTurnHunk {
  readonly old: string | null
  readonly new: string | null
}

interface FoldTurnItem {
  readonly callId: string
  readonly name: string
  readonly file: string | null
  readonly state: 'running' | 'done' | 'failed'
  readonly startedAt: number | null
  readonly endedAt: number | null
  readonly added: number | null
  readonly removed: number | null
  readonly hunks: readonly FoldTurnHunk[]
  /** ADR-0302: a write call's own content, stashed at call time for the create fallback. */
  readonly createContent: string | null
}

/** ADR-0301: the last turn's process facts the fold accumulates (reset on turn/start). */
interface FoldTurnProcess {
  readonly startedAt: number | null
  readonly endedAt: number | null
  readonly steps: number
  readonly items: readonly FoldTurnItem[]
}

const EMPTY_TURN_PROCESS: FoldTurnProcess = { startedAt: null, endedAt: null, steps: 0, items: [] }
const WRITE_LIKE_TOOLS = new Set(['write', 'edit', 'apply_patch'])
const MAX_TURN_ITEMS = 12
// ADR-0302 diff bounds: at most 4 hunks per item, 60 lines per side.
const MAX_ITEM_HUNKS = 4
const MAX_HUNK_LINES = 60

function boundLines(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= MAX_HUNK_LINES) return text
  return [...lines.slice(0, MAX_HUNK_LINES), '…'].join('\n')
}

function countLines(text: string): number {
  return text === '' ? 0 : text.split('\n').length
}

/** The tool result's presentation diffs, bounded and validated; malformed pieces are dropped. */
function hunksFromMeta(meta: unknown): { readonly hunks: readonly FoldTurnHunk[], readonly added: number, readonly removed: number } | undefined {
  if (!isRecord(meta) || !Array.isArray(meta.diffs)) return undefined
  const hunks: FoldTurnHunk[] = []
  let added = 0
  let removed = 0
  for (const entry of meta.diffs) {
    if (hunks.length >= MAX_ITEM_HUNKS) break
    if (!isRecord(entry)) continue
    const oldText = typeof entry.oldText === 'string' ? entry.oldText : null
    const newText = typeof entry.newText === 'string' ? entry.newText : null
    if (oldText === null && newText === null) continue
    if (oldText !== null) removed += countLines(oldText)
    if (newText !== null) added += countLines(newText)
    hunks.push({ old: oldText === null ? null : boundLines(oldText), new: newText === null ? null : boundLines(newText) })
  }
  // An empty (or unparsable) diff set is "no diff facts": the create fallback may still apply.
  if (hunks.length === 0 && added === 0 && removed === 0) return undefined
  return { hunks, added, removed }
}

/** ADR-0301: the status face of the fold's turn process (bounded, display-only). */
export function turnProcessView(process: FoldTurnProcess): {
  readonly durationMs: number | null
  readonly iterations: number | null
  readonly fileWrites: readonly {
    readonly name: string
    readonly file: string | null
    readonly state: 'running' | 'done' | 'failed'
    readonly durationMs: number | null
    readonly added: number | null
    readonly removed: number | null
    readonly hunks: readonly {
      readonly old: string | null
      readonly new: string | null
    }[]
  }[]
} {
  const durationMs = process.startedAt !== null && process.endedAt !== null && process.endedAt >= process.startedAt
    ? process.endedAt - process.startedAt
    : null
  return {
    durationMs,
    iterations: process.steps > 0 ? process.steps : null,
    fileWrites: process.items.map((item) => ({
      name: item.name,
      file: item.file,
      state: item.state,
      durationMs: item.startedAt !== null && item.endedAt !== null && item.endedAt >= item.startedAt
        ? item.endedAt - item.startedAt
        : null,
      added: item.added,
      removed: item.removed,
      hunks: item.hunks,
    })),
  }
}

/** The log's own millisecond stamp, or null when the record carries none. */
function eventTime(event: Record<string, unknown>): number | null {
  return typeof event.time === 'number' && Number.isSafeInteger(event.time) && event.time >= 0 ? event.time : null
}

/** ADR-0303: the snapshot's context-pressure projection, validated; null when absent or malformed
 *  (the host may carry none at all — the surface then simply has no occupancy figure). */
function contextPressureOf(projections: unknown): { readonly pressureTokens: number | null, readonly contextWindow: number | null } | null {
  if (!isRecord(projections)) return null
  const pressure = projections.contextPressure
  if (!isRecord(pressure)) return null
  const tokens = typeof pressure.pressureTokens === 'number' && Number.isSafeInteger(pressure.pressureTokens) && pressure.pressureTokens >= 0
    ? pressure.pressureTokens : null
  const window = typeof pressure.contextWindow === 'number' && Number.isSafeInteger(pressure.contextWindow) && pressure.contextWindow > 0
    ? pressure.contextWindow : null
  if (tokens === null && window === null) return null
  return { pressureTokens: tokens, contextWindow: window }
}

/** Display basename only — a machine path never crosses this fold. */
function baseNameOf(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null
  const parts = value.split(/[\\/]/u)
  const name = parts[parts.length - 1]
  return name === undefined || name === '' ? null : name
}

interface Fold {
  readonly assistantText: string | null
  readonly cursor: number
  readonly executingTurn: number | null
  readonly lastTurnEnd: string | null
  /** ADR-0293: `${cursor}:${kind}` of the last turn end — the observers' edge key. */
  readonly lastTurnEndEdge: string | null
  readonly records: number
  readonly unapplied: number
  /** Only attachment-bearing user messages are folded: plain text history rows stayed hidden (005). */
  readonly userMessages: readonly FoldedUserMessage[]
  readonly turnProcess: FoldTurnProcess
  /** ADR-0303: the newest snapshot's context-pressure projection (null until the host carries
   *  one). Fields stay independent — a fresh capacity may pair with an older pressure. */
  readonly contextPressure: { readonly pressureTokens: number | null, readonly contextWindow: number | null } | null
}

const EMPTY_FOLD: Fold = { assistantText: null, cursor: -1, executingTurn: null, lastTurnEnd: null, lastTurnEndEdge: null, records: 0, unapplied: 0, userMessages: [], turnProcess: EMPTY_TURN_PROCESS, contextPressure: null }

/** Fold the session log: an open turn is the only "executing" evidence; the final text is the last
 *  `assistant/message`. Unknown frames are counted, never interpreted. */
/** Ticket 037: the base writes `turn/end` reasons as objects (`{kind: 'completed'|'blocked'|
 *  'max-tokens'|'aborted'|'error'}`); older evidence and fakes use plain strings. Normalize both
 *  to the kind string so "determinate failure" is judgeable (`kind === 'error'`). */
export function turnEndKind(data: unknown): string {
  if (!isRecord(data)) return 'ended'
  const reason = data.reason
  if (typeof reason === 'string' && reason !== '') return reason
  if (isRecord(reason) && typeof reason.kind === 'string' && reason.kind !== '') return reason.kind
  return 'ended'
}

export function foldSessionFrames(frames: readonly unknown[]): Fold {
  let fold = EMPTY_FOLD
  for (const frame of frames) {
    if (!isRecord(frame)) {
      fold = { ...fold, unapplied: fold.unapplied + 1 }
      continue
    }
    if (frame.type === 'snapshot') {
      const records = Array.isArray(frame.records) ? frame.records : []
      const snapshotFold = foldSessionRecords(records)
      const cursor = typeof frame.cursor === 'number' && Number.isSafeInteger(frame.cursor) ? frame.cursor : snapshotFold.cursor
      fold = { ...snapshotFold, cursor, records: records.length, contextPressure: contextPressureOf(frame.projections) }
      continue
    }
    if (frame.type === 'assistant-stream') {
      // Live presentation only: it never becomes the final text (history owns that).
      continue
    }
    const event = eventOf(frame)
    if (event === undefined) {
      fold = { ...fold, unapplied: fold.unapplied + 1 }
      continue
    }
    fold = applyEvent(fold, event)
    fold = { ...fold, records: fold.records + 1 }
  }
  return fold
}

function foldSessionRecords(records: readonly unknown[]): Fold {
  let fold = EMPTY_FOLD
  for (const record of records) {
    const event = eventOf(record)
    if (event === undefined) {
      fold = { ...fold, unapplied: fold.unapplied + 1 }
      continue
    }
    fold = applyEvent(fold, event)
    fold = { ...fold, records: fold.records + 1 }
  }
  return fold
}

function applyEvent(fold: Fold, event: Record<string, unknown>): Fold {
  const seq = typeof event.seq === 'number' && Number.isSafeInteger(event.seq) ? event.seq : fold.cursor
  const data = event.data
  if (event.type === 'turn/start') {
    const turn = isRecord(data) && typeof data.turn === 'number' ? data.turn : null
    return {
      ...fold, cursor: seq, executingTurn: turn, lastTurnEnd: null, lastTurnEndEdge: null,
      turnProcess: { startedAt: eventTime(event), endedAt: null, steps: 0, items: [] },
    }
  }
  if (event.type === 'turn/end') {
    return {
      ...fold, cursor: seq, executingTurn: null, lastTurnEnd: turnEndKind(data), lastTurnEndEdge: `${seq}:${turnEndKind(data)}`,
      turnProcess: { ...fold.turnProcess, endedAt: eventTime(event) },
    }
  }
  if (event.type === 'step/start') {
    // ADR-0301: one model iteration of the turn ("模型迭代").
    return { ...fold, cursor: seq, turnProcess: { ...fold.turnProcess, steps: fold.turnProcess.steps + 1 } }
  }
  if (event.type === 'tool/call') {
    // ADR-0301: only the write/edit family feeds the file-process list; basename only.
    const name = isRecord(data) && typeof data.name === 'string' ? data.name : null
    if (name === null || !WRITE_LIKE_TOOLS.has(name)) return { ...fold, cursor: seq }
    const callId = isRecord(data) && typeof data.callId === 'string' && data.callId !== '' ? data.callId : null
    if (callId === null) return { ...fold, cursor: seq }
    const args = isRecord(data) ? (isRecord(data.arguments) ? data.arguments : undefined) : undefined
    const file = args === undefined ? null : baseNameOf(args.file_path) ?? baseNameOf(args.path)
    const createContent = name === 'write' && args !== undefined && typeof args.content === 'string' ? args.content : null
    const item: FoldTurnItem = {
      callId, name, file, state: 'running', startedAt: eventTime(event), endedAt: null,
      added: null, removed: null, hunks: [], createContent,
    }
    const items = [...fold.turnProcess.items, item]
    return {
      ...fold, cursor: seq,
      turnProcess: { ...fold.turnProcess, items: items.length > MAX_TURN_ITEMS ? items.slice(items.length - MAX_TURN_ITEMS) : items },
    }
  }
  if (event.type === 'tool/result') {
    const message = isRecord(data) ? data.message : undefined
    const callId = isRecord(message) && typeof message.callId === 'string' ? message.callId : null
    if (callId === null || !fold.turnProcess.items.some((item) => item.callId === callId && item.state === 'running')) {
      return { ...fold, cursor: seq }
    }
    const failed = isRecord(message) && message.isError === true
    const at = eventTime(event)
    const meta = isRecord(data) ? data.meta : undefined
    const fromMeta = hunksFromMeta(meta)
    return {
      ...fold, cursor: seq,
      turnProcess: {
        ...fold.turnProcess,
        items: fold.turnProcess.items.map((item) => {
          if (item.callId !== callId || item.state !== 'running') return item
          const diff = failed ? undefined
            : fromMeta !== undefined ? fromMeta
              // ADR-0302 create fallback: a new file's result meta carries no hunks; the call's
              // own content is the insertion.
              : item.createContent !== null
                ? { hunks: [{ old: null, new: boundLines(item.createContent) }] as readonly FoldTurnHunk[], added: countLines(item.createContent), removed: 0 }
                : undefined
          return {
            ...item,
            state: failed ? 'failed' as const : 'done' as const,
            endedAt: at,
            ...(diff === undefined ? {} : { added: diff.added, removed: diff.removed, hunks: diff.hunks }),
          }
        }),
      },
    }
  }
  if (event.type === 'assistant/message') {
    // "Assembled assistant message for one step (derived history uses this)." The message is the
    // durable final text; the stream record beside it is not.
    const message = isRecord(data) ? data.message : undefined
    const text = isRecord(message) ? textOf(message.content) : undefined
    if (text === undefined) return { ...fold, cursor: seq, unapplied: fold.unapplied + 1 }
    return { ...fold, cursor: seq, assistantText: text }
  }
  if (event.type === 'user/message') {
    // Ticket 014: a user message with file blocks is how a reopened matter shows its attachments
    // (US-076). Text-only user rows remain out of the transcript — 005's echo model is unchanged.
    const message = isRecord(data) ? data.message : undefined
    if (!isRecord(message)) return { ...fold, cursor: seq }
    const files = filesOf(message.content)
    if (files.length === 0) return { ...fold, cursor: seq }
    const source = isRecord(message.source) ? message.source : undefined
    const requestId = isRecord(source) && source.kind === 'user' && typeof source.rpcId === 'string' && source.rpcId !== ''
      ? source.rpcId
      : null
    const text = textOf(message.content) ?? ''
    const folded: FoldedUserMessage = { requestId, text, files }
    return { ...fold, cursor: seq, userMessages: [...fold.userMessages, folded] }
  }
  return { ...fold, cursor: seq }
}

/** Append page-folded attachment messages the stream fold has not already seen (same event, one row). */
function appendUserMessages(
  base: readonly FoldedUserMessage[],
  extra: readonly FoldedUserMessage[],
): readonly FoldedUserMessage[] {
  const seen = new Set(base.map((message) => message.requestId
    ?? (message.text + '|' + message.files.map((file) => file.attachmentId).join(','))))
  const out = [...base]
  for (const message of extra) {
    const key = message.requestId ?? (message.text + '|' + message.files.map((file) => file.attachmentId).join(','))
    if (seen.has(key)) continue
    seen.add(key)
    out.push(message)
  }
  return out
}

export interface SessionChannelDeps {
  readonly bindingsFile: string
  readonly now: () => string
  readonly nextId: () => string
  /** The stream half of the same bridge (`bridgeStream` on main's side). */
  readonly streamCall: (endpoint: string, payload: readonly unknown[], onFrame: (frame: unknown) => boolean) => Promise<unknown>
  /** Ticket 006: the Sage-side pause state and pending inputs; without it nothing can be deferred. */
  readonly pending?: PendingInputsStore
}

/** One queue occurrence as the control baseline reports it (ticket 008 adds the placement and a
 *  bounded text preview — the projection carries only these, never the whole message). */
interface QueueOccurrence {
  readonly queueItemId: string
  readonly position: 'queued' | 'steering' | 'context'
  readonly requestId?: string
  readonly preview: string
}

const MAX_QUEUE_PREVIEW = 140

function queuePreview(message: unknown): string {
  if (!isRecord(message) || !Array.isArray(message.content)) return ''
  for (const part of message.content) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') return part.text.slice(0, MAX_QUEUE_PREVIEW)
  }
  return ''
}

/** Read the authoritative queue snapshot for one session (control stream, bounded window). */
async function readQueue(deps: SessionChannelDeps, sessionId: string): Promise<{ readonly ok: boolean, readonly occurrences: readonly QueueOccurrence[], readonly code: string | null }> {
  const frames: unknown[] = []
  try {
    const answer = asAnswer(await deps.streamCall('session/control', [], (frame) => { frames.push(frame); return frames.length < 256 }))
    if (!answer.ok) return { ok: false, occurrences: [], code: answer.code }
  } catch (error) {
    return { ok: false, occurrences: [], code: error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : 'bridge-host-not-ready' }
  }
  let items: readonly unknown[] | undefined
  for (const frame of frames) {
    if (!isRecord(frame)) continue
    if (frame.type === 'baseline' && isRecord(frame.value) && isRecord(frame.value.queues)) {
      items = Array.isArray(frame.value.queues[sessionId]) ? frame.value.queues[sessionId] as readonly unknown[] : []
      continue
    }
    if (frame.type === 'queue' && frame.sessionId === sessionId && Array.isArray(frame.items)) items = frame.items
  }
  if (items === undefined) return { ok: false, occurrences: [], code: 'queue-snapshot-absent' }
  const occurrences: QueueOccurrence[] = []
  for (const item of items) {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id === '') continue
    const position = item.placement === 'steering' ? 'steering' as const : item.placement === 'context' ? 'context' as const : 'queued' as const
    occurrences.push({
      queueItemId: item.id,
      position,
      ...(typeof item.rpcId === 'string' ? { requestId: item.rpcId } : {}),
      preview: queuePreview(item.message),
    })
  }
  return { ok: true, occurrences, code: null }
}

export interface SessionChannel {
  readonly send: (input: {
    readonly matterRef: string
    readonly workspaceRoot: string
    readonly text: string
    readonly attachments?: readonly SessionAttachmentInput[]
    /** Ticket 008 (US-025): `steer` inserts at the next step boundary; default is `queue`. */
    readonly mode?: 'queue' | 'steer'
    /** Ticket 036: a caller-minted stable identity (the resend of one edit version). The base
     *  dedupes by `source.rpcId`, so the same identity can never be dispatched twice. */
    readonly requestId?: string
  }) => Promise<SessionSendOutcome>
  readonly read: (input: { readonly matterRef: string }) => Promise<SessionChannelStatus>
  /** ADR-0298: the live half of the same follow stream — assistant chunks are pushed as they
   *  arrive (bounded re-subscribes until the turn ends or the caller aborts). It never becomes
   *  history and never writes: the durable fold stays the final word. */
  readonly followLive: (input: {
    readonly matterRef: string
    readonly signal: AbortSignal
    readonly onDelta: (text: string) => void
  }) => Promise<void>
  /** Ticket 008 (US-027): edit/remove one still-pending queue occurrence; `queue-item-not-found`
   *  means the base already started processing it. */
  readonly queueItem: (input: { readonly matterRef: string, readonly itemId: string, readonly action: 'edit' | 'remove', readonly text?: string }) => Promise<QueueItemOutcome>
  /** Ticket 006: stop — cancel the active turn, keep everything else in Sage's pending list. */
  readonly stop: (input: { readonly matterRef: string }) => Promise<SessionControlOutcome>
  /** Ticket 006: resume — dispatch pending inputs in order; the only path that re-enables sending. */
  readonly resume: (input: { readonly matterRef: string, readonly workspaceRoot: string }) => Promise<SessionControlOutcome>
  /** Ticket 014: the explicit act that binds (or creates) this matter's session — shared by send,
   *  resume, and attachment upload so the receipt's session is the one a send will use. */
  readonly ensureSession: (matterRef: string, workspaceRoot: string) => Promise<{ readonly ok: true, readonly sessionId: string } | { readonly ok: false, readonly code: string }>
  /** Ticket 036: this matter's most recently read transcript rows (echo + history). Synchronous
   *  on purpose: the edit store resolves a message's original text from what the log last said,
   *  never from a client-supplied claim. Empty until the first read. */
  readonly transcriptOf: (matterRef: string) => readonly SessionChannelEntry[]
}

export function createSessionChannel(callBridge: BridgeCaller, deps: SessionChannelDeps): SessionChannel {
  /** matterRef → sessionId; persisted so a restart reuses the session instead of re-sending. */
  let lastTranscript: { matterRef: string, rows: readonly SessionChannelEntry[] } | null = null
  const readBindings = (): Record<string, string> => {
    try {
      const value = JSON.parse(readFileSync(deps.bindingsFile, 'utf8')) as unknown
      if (!isRecord(value)) return {}
      const out: Record<string, string> = {}
      for (const [key, entry] of Object.entries(value)) if (typeof entry === 'string' && entry !== '') out[key] = entry
      return out
    } catch {
      return {}
    }
  }
  const writeBinding = (matterRef: string, sessionId: string): void => {
    const bindings = readBindings()
    bindings[matterRef] = sessionId
    mkdirSync(join(deps.bindingsFile, '..'), { recursive: true, mode: 0o700 })
    writeFileSync(deps.bindingsFile, JSON.stringify(bindings, null, 2), { mode: 0o600 })
  }
  /** The local echo of what this device sent, so the transcript shows the user's own prompt even
   *  when the session was created before this run. */
  const echoes: Array<{
    readonly matterRef: string
    readonly requestId: string
    readonly text: string
    readonly at: string
    readonly accepted: boolean
    readonly attachments: readonly { readonly attachmentId: string, readonly name: string, readonly bytes: number }[]
  }> = []

  const ensureSession = async (matterRef: string, workspaceRoot: string): Promise<{ readonly ok: true, readonly sessionId: string } | { readonly ok: false, readonly code: string }> => {
    const bound = readBindings()[matterRef]
    if (bound !== undefined) return { ok: true, sessionId: bound }
    // "Create or idempotently adopt one ordinary Session": the base owns session identity.
    const answer = asAnswer(await callBridge('session/create', [{ cwd: workspaceRoot }]))
    if (!answer.ok) return { ok: false, code: answer.code }
    const sessionId = isRecord(answer.result) && typeof answer.result.sessionId === 'string' && answer.result.sessionId !== ''
      ? answer.result.sessionId
      : undefined
    if (sessionId === undefined) return { ok: false, code: 'bridge-answer-unrecognised' }
    writeBinding(matterRef, sessionId)
    return { ok: true, sessionId }
  }

  return {
    ensureSession,
    transcriptOf: (matterRef) => lastTranscript !== null && lastTranscript.matterRef === matterRef ? lastTranscript.rows : [],
    async send(input) {
      const attachments = input.attachments ?? []
      if (input.text.length > MAX_TEXT) return { state: 'refused', code: 'session-text-invalid' }
      if (input.text.trim() === '' && attachments.length === 0) return { state: 'refused', code: 'session-text-invalid' }
      // US-014/020: while paused the input never reaches the agent inbox — an inbox item can be
      // consumed by a later turn, so the text stays in Sage's own record until an explicit resume.
      // An attachment has no place in that text-only record: its receipt would expire with this run
      // while the pending item outlives it, so a paused attachment send is refused, not half-kept.
      if (deps.pending?.isPaused(input.matterRef) === true) {
        if (attachments.length > 0) return { state: 'refused', code: 'session-paused-attachments' }
        const item = deps.pending.enqueue(input.matterRef, input.text)
        return { state: 'deferred', itemId: item.itemId }
      }
      const session = await ensureSession(input.matterRef, input.workspaceRoot)
      if (!session.ok) return { state: 'refused', code: session.code }
      if (input.requestId !== undefined && (input.requestId.trim() !== input.requestId || input.requestId === '' || input.requestId.length > 160)) {
        return { state: 'refused', code: 'session-request-id-invalid' }
      }
      const requestId = input.requestId ?? `req-${deps.nextId()}`
      const mode = input.mode === 'steer' ? 'steer' : 'queue'
      const answer = asAnswer(await callBridge('session/prompt', [{
        requestId,
        sessionId: session.sessionId,
        mode,
        text: input.text,
        ...(attachments.length === 0 ? {} : { receipts: attachments.map((attachment) => attachment.receiptId) }),
      }]))
      if (!answer.ok) return { state: 'refused', code: answer.code }
      // The base's ack is exactly `{accepted: true}`: admitted, and nothing more is claimed here.
      const accepted = isRecord(answer.result) && answer.result.accepted === true
      if (!accepted) return { state: 'refused', code: 'bridge-answer-unrecognised' }
      echoes.push({
        matterRef: input.matterRef,
        requestId,
        text: input.text,
        at: deps.now(),
        accepted: true,
        attachments: attachments.map(({ attachmentId, name, bytes }) => ({ attachmentId, name, bytes })),
      })
      if (echoes.length > MAX_ENTRIES) echoes.splice(0, echoes.length - MAX_ENTRIES)
      return { state: 'accepted', sessionId: session.sessionId, requestId, mode }
    },
    async read(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) {
        // Nothing was ever sent for this matter: no session exists, and reading must not create one.
        return {
          state: 'no-session', sessionId: null, execution: 'idle', lastTurnEnd: null, lastTurnEndEdge: null,
          turnProcess: turnProcessView(EMPTY_TURN_PROCESS),
          contextUsage: null,
          reply: { text: null, endKind: null, failed: false, actions: [] },
          transcript: [],
          reconciled: false, streamBroken: false, code: null, records: 0, unapplied: 0,
          paused: deps.pending?.isPaused(input.matterRef) === true,
          pending: (deps.pending?.snapshot(input.matterRef).items ?? []).map((item) => ({
            itemId: item.itemId, text: item.text, state: item.state, note: item.note ?? null, editable: item.state === 'pending',
          })),
          queue: { state: 'unavailable' as const, occurrences: [] },
        }
      }
      const frames: unknown[] = []
      let streamBroken = false
      let code: string | null = null
      try {
        const answer = asAnswer(await deps.streamCall('session/follow', [{ sessionId }], (frame) => { frames.push(frame); return frames.length < 512 }))
        if (!answer.ok) {
          streamBroken = true
          code = answer.code
        }
      } catch (error) {
        streamBroken = true
        code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : 'bridge-host-not-ready'
      }
      let fold = foldSessionFrames(frames)
      let reconciled = false
      if (streamBroken || fold.assistantText === null) {
        // Reconcile against the history: the durable log is the final word, and a broken stream is
        // exactly the case this read exists for.
        const page = asAnswer(await callBridge('session/page', [{
          sessionId,
          throughSeq: fold.cursor < 0 ? 0 : fold.cursor,
          maxMessages: 200,
        }]))
        if (page.ok && isRecord(page.result) && Array.isArray(page.result.records)) {
          const pageFold = foldSessionRecords(page.result.records)
          fold = {
            ...fold,
            assistantText: pageFold.assistantText ?? fold.assistantText,
            executingTurn: pageFold.executingTurn,
            lastTurnEnd: pageFold.lastTurnEnd,
            lastTurnEndEdge: pageFold.lastTurnEndEdge,
            turnProcess: pageFold.turnProcess,
            contextPressure: pageFold.contextPressure ?? fold.contextPressure,
            unapplied: fold.unapplied + pageFold.unapplied,
            records: fold.records + page.result.records.length,
            userMessages: appendUserMessages(fold.userMessages, pageFold.userMessages),
          }
          reconciled = true
          if (streamBroken && pageFold.assistantText !== null) streamBroken = false
          if (streamBroken) code = code ?? 'reconcile-empty'
        } else if (streamBroken) {
          code = code ?? (page.ok ? 'reconcile-unrecognised' : page.code)
        }
      }
      const transcript: SessionChannelEntry[] = []
      const echoRequestIds = new Set<string>()
      for (const echo of echoes.filter((entry) => entry.matterRef === input.matterRef)) {
        echoRequestIds.add(echo.requestId)
        transcript.push({ role: 'user', text: echo.text, source: 'echo', at: echo.at, attachments: echo.attachments, messageRef: echo.requestId })
      }
      // Ticket 014 (US-076): attachments reappear from the durable log on reopen. Rows already
      // echoed by this run are skipped on their request id — one message, one row.
      for (const message of fold.userMessages) {
        if (message.requestId !== null && echoRequestIds.has(message.requestId)) continue
        transcript.push({ role: 'user', text: message.text, source: 'history', at: null, attachments: message.files, ...(message.requestId === null ? {} : { messageRef: message.requestId }) })
      }
      if (fold.assistantText !== null && fold.assistantText !== '') {
        transcript.push({ role: 'assistant', text: fold.assistantText, source: 'history', at: null, attachments: [] })
      }
      const pendingSnapshot = deps.pending?.snapshot(input.matterRef);
      // Ticket 008 (US-028): the queue panel reads the base's authoritative snapshot — bounded
      // stream read, placements and text previews included; a broken stream says unavailable.
      const queueSnapshot = await readQueue(deps, sessionId)
      lastTranscript = { matterRef: input.matterRef, rows: transcript }
      const reply: SessionReplyView = {
        text: fold.assistantText,
        endKind: fold.lastTurnEnd,
        failed: fold.lastTurnEnd === 'error',
        actions: fold.assistantText === null || fold.assistantText === ''
          ? []
          : fold.lastTurnEnd === 'error' ? ['copy', 'quote', 'retry'] : ['copy', 'quote'],
      }
      return {
        state: 'read',
        sessionId,
        execution: fold.executingTurn === null ? 'idle' : 'executing',
        lastTurnEnd: fold.lastTurnEnd,
        lastTurnEndEdge: fold.lastTurnEndEdge,
        turnProcess: turnProcessView(fold.turnProcess),
        contextUsage: fold.contextPressure,
        reply,
        transcript,
        reconciled,
        streamBroken,
        code,
        records: fold.records,
        unapplied: fold.unapplied,
        paused: pendingSnapshot?.paused ?? false,
        pending: (pendingSnapshot?.items ?? []).map((item) => ({
          itemId: item.itemId,
          text: item.text,
          state: item.state,
          note: item.note ?? null,
          editable: item.state === 'pending',
        })),
        queue: queueSnapshot.ok
          ? {
              state: 'read' as const,
              occurrences: queueSnapshot.occurrences.map((occurrence) => ({
                queueItemId: occurrence.queueItemId,
                position: occurrence.position,
                requestId: occurrence.requestId ?? null,
                preview: occurrence.preview,
              })),
            }
          : { state: 'unavailable' as const, occurrences: [] },
      }
    },
    async queueItem(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'queue-no-session' }
      const text = input.action === 'edit' ? (input.text ?? '').trim() : ''
      if (input.action === 'edit' && (text === '' || text.length > MAX_TEXT)) return { state: 'refused', code: 'queue-edit-invalid' }
      const answer = input.action === 'edit'
        ? asAnswer(await callBridge('session/queue-edit', [{ sessionId, itemId: input.itemId, text }]))
        : asAnswer(await callBridge('session/queue-remove', [{ sessionId, itemId: input.itemId }]))
      if (!answer.ok) return { state: 'refused', code: answer.code === 'bridge-queue-item-not-found' ? 'queue-item-not-found' : answer.code }
      return { state: 'ok' }
    },
    async followLive(input) {
      // ADR-0298: bounded re-subscribes over the same session/follow seam the read uses.
      // Chunk indexes guard against a re-subscribe replaying chunks the consumer already saw;
      // a turn/start resets the index for the next turn. The loop ends on the first turn/end
      // (the renderer then reads the durable fold) or on abort (window closed, matter switched).
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return
      let lastChunkIndex = -1
      while (!input.signal.aborted) {
        let sawTurnEnd = false
        try {
          await deps.streamCall('session/follow', [{ sessionId }], (frame) => {
            if (input.signal.aborted) return false
            if (isRecord(frame) && frame.type === 'assistant-stream' && isRecord(frame.frame)) {
              const chunk = frame.frame
              const index = typeof chunk.index === 'number' && Number.isSafeInteger(chunk.index) ? chunk.index : undefined
              const data = isRecord(chunk.data) ? chunk.data : undefined
              const text = data !== undefined && typeof data.text === 'string' ? data.text : undefined
              if (index !== undefined && text !== undefined && index > lastChunkIndex) {
                lastChunkIndex = index
                input.onDelta(text)
              }
            } else if (isRecord(frame) && frame.type === 'snapshot' && Array.isArray(frame.records)) {
              // A late subscriber's snapshot may already carry the finished turn: exit at once
              // instead of re-subscribing against a turn that is already over.
              for (const record of frame.records) {
                const event = eventOf(record)
                if (event !== undefined && event.type === 'turn/end') sawTurnEnd = true
              }
            } else {
              const event = eventOf(frame)
              if (event !== undefined && event.type === 'turn/start') lastChunkIndex = -1
              if (event !== undefined && event.type === 'turn/end') sawTurnEnd = true
            }
            return !input.signal.aborted
          })
        } catch {
          // A host hiccup between re-subscribes must not fabricate a delta; the loop retries
          // below while the caller still wants the stream.
        }
        if (sawTurnEnd || input.signal.aborted) return
        // Breathe between bounded re-subscribes so a dead host is not hammered.
        await new Promise((resolve) => setTimeout(resolve, 250))
      }
    },
    async stop(input) {
      const pending = deps.pending
      const sessionId = readBindings()[input.matterRef]
      if (pending === undefined) return { state: 'refused', code: 'pending-store-unavailable', paused: false, drained: [], consumed: [], dispatched: [] }
      // 1) Pause first: from here on nothing new can enter the inbox.
      pending.pause(input.matterRef)
      if (sessionId === undefined) return { state: 'stopped', paused: true, drained: [], consumed: [], dispatched: [], code: null }
      // 2) Cancel the active turn. The base keeps its pending inbox, which is exactly why step 3 exists.
      const cancelled = asAnswer(await callBridge('session/cancel', [{ sessionId }]))
      if (!cancelled.ok) return { state: 'refused', code: cancelled.code, paused: true, drained: [], consumed: [], dispatched: [] }
      // 3) Drain still-pending occurrences that belong to our submitted items. The race this closes:
      //    between cancel and this read the loop may already have consumed one — the snapshot says
      //    which. Consumed ones are frozen as such; the rest go back to 待继续.
      const queue = await readQueue(deps, sessionId)
      if (queue.ok) {
        const before = pending.snapshot(input.matterRef).items
        pending.foldQueue(input.matterRef, queue.occurrences)
        const drained: string[] = []
        const consumed: string[] = []
        for (const item of before) {
          if (item.state !== 'submitted' || item.requestId === undefined) continue
          const occurrence = queue.occurrences.find((entry) => entry.requestId === item.requestId)
          if (occurrence === undefined) {
            consumed.push(item.itemId)
            continue
          }
          const removed = asAnswer(await callBridge('session/queue-remove', [{ sessionId, itemId: occurrence.queueItemId }]))
          if (removed.ok) {
            pending.returnToPending(input.matterRef, item.itemId, 'drained-at-stop')
            drained.push(item.itemId)
          } else {
            // The occurrence vanished between our snapshot and the removal: the base took it.
            pending.foldQueue(input.matterRef, [], 'consumed-by-race')
            consumed.push(item.itemId)
          }
        }
        return { state: 'stopped', paused: true, drained, consumed, dispatched: [], code: null }
      }
      // No queue snapshot: nothing could be drained, and we say so instead of pretending otherwise.
      return { state: 'stopped', paused: true, drained: [], consumed: [], dispatched: [], code: queue.code }
    },
    async resume(input) {
      const pending = deps.pending
      const sessionId = readBindings()[input.matterRef]
      if (pending === undefined) return { state: 'refused', code: 'pending-store-unavailable', paused: false, drained: [], consumed: [], dispatched: [] }
      // Dispatch needs a session; with none bound yet, an explicit resume is the act that creates
      // it (unlike a read, which must not).
      let target = sessionId
      if (target === undefined) {
        const created = await ensureSession(input.matterRef, input.workspaceRoot)
        if (!created.ok) return { state: 'refused', code: created.code, paused: true, drained: [], consumed: [], dispatched: [] }
        target = created.sessionId
      }
      pending.resume(input.matterRef)
      // US-021/029 + ticket 007: dispatch pending inputs in order — and only this explicit act does
      // it. Every iteration re-reads the LIVE list (an edit or a new paused send landing between
      // two dispatches is honoured, never a stale snapshot), and a re-pause (a stop racing this
      // resume) halts the loop before the next prompt — nothing past that point is sent.
      const dispatched: string[] = []
      let interrupted = false
      for (;;) {
        if (pending.isPaused(input.matterRef)) { interrupted = true; break }
        const next = pending.snapshot(input.matterRef).items.find((entry) => entry.state === 'pending')
        if (next === undefined) break
        // Freeze before the prompt: the dispatched text is exactly the recorded text — an edit
        // racing this dispatch is refused (`item-frozen`) instead of rewriting what was sent.
        pending.beginDispatch(input.matterRef, next.itemId)
        const requestId = `req-${deps.nextId()}`
        const answer = asAnswer(await callBridge('session/prompt', [{
          requestId,
          sessionId: target,
          mode: 'queue',
          text: next.text,
        }]))
        if (!answer.ok || !(isRecord(answer.result) && answer.result.accepted === true)) {
          // The prompt never left: back to 待继续 so a later resume can try again.
          pending.revertDispatch(input.matterRef, next.itemId)
          const code = answer.ok ? 'bridge-answer-unrecognised' : answer.code
          const snapshot = pending.snapshot(input.matterRef)
          return { state: 'refused', code, paused: snapshot.paused, drained: [], consumed: [], dispatched, revision: snapshot.revision }
        }
        pending.markSubmitted(input.matterRef, next.itemId, requestId)
        echoes.push({ matterRef: input.matterRef, requestId, text: next.text, at: deps.now(), accepted: true, attachments: [] })
        dispatched.push(next.itemId)
      }
      // 队列版本对账（US-021）：dispatch 收束后按权威队列快照折叠一次 —— occurrence 在=记下
      // queueItemId（有据在队）；不在=已被取走，如实标 consumed-by-race。快照拿不到就带 code 说明，
      // 不假装对过账。
      const queue = await readQueue(deps, target)
      if (queue.ok) pending.foldQueue(input.matterRef, queue.occurrences, undefined, { absent: 'keep' })
      const snapshot = pending.snapshot(input.matterRef)
      return { state: interrupted ? 'interrupted' : 'resumed', paused: snapshot.paused, drained: [], consumed: [], dispatched, revision: snapshot.revision, code: queue.ok ? null : queue.code }
    },
  }
}
