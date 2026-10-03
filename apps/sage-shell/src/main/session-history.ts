/** Ticket 009 (US-024/097~100): cold history — the runs of a matter, read through the pure
 *  history seam and never through anything that could wake an Agent.
 *
 * The rules the ticket names:
 *
 * - **Only `session/page` reads history.** No `follow` (its cold-activation difference is exactly
 *   what US-024 warns about), no `prompt`, no attachment verb: opening a historic matter must not
 *   activate anything, must not re-send and must not re-upload — asserted as the exact call table.
 * - **Newest first, and paginated.** Each page is bounded (`maxMessages`), `hasMore` is carried back
 *   with the cursor to walk further; the list itself is data from the durable log only.
 * - **The actual model of each run is its own `request/header` snapshot** (`header.config.model`),
 *   kept separate from the matter's current selection; a run without that snapshot records null
 *   rather than borrowing today's model (US-099).
 * - **Details are read per run, on demand** (US-098), bounded, and an unreadable run stays
 *   missing — never a blank success (US-100). In-flight runs (open `turn/start` without `turn/end`)
 *   are listed honestly with `endSeq: null`.
 */
import type { RunClarificationView, SessionHistoryRunView, SessionHistoryStatus, SessionRunDetailOutcome, SessionRunListOutcome } from '../appservice/contracts.js'
import { turnEndKind } from './session-channel.js'
import type { BridgeCaller } from './workspace-adoption.js'
import { readFileSync } from 'node:fs'

const PAGE_MESSAGES = 400
const MAX_RUNS = 50
const MAX_OUTPUT_CHARS = 2000
const MAX_USER_CHARS = 300
const MAX_USER_LINES = 4
// Ticket 034/US-180: the read-only clarification walk over a run's durable log.
const MAX_CLARIFY_CALLS = 8
const MAX_CLARIFY_QUESTIONS = 8
const MAX_CLARIFY_TEXT = 1000
const MAX_CLARIFY_TOTAL = 24
const MAX_CLARIFY_SELECTED = 16

export interface SessionHistoryDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
}

interface RunAccumulator {
  runSeq: number
  turn: number | null
  provider: string | null
  model: string | null
  endSeq: number | null
  endReason: string | null
  messages: number
  /** Ticket 035: the run's first user text (unbounded here; the anchors seam caps its preview). */
  firstUserText: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function eventOf(record: unknown): Record<string, unknown> | undefined {
  if (!isRecord(record) || record.type !== 'event' || !isRecord(record.event)) return undefined
  return record.event
}

function textOf(content: unknown): string | null {
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const part of content) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
  }
  return parts.length === 0 ? null : parts.join('\n')
}

/** Ticket 034/US-180: fold one run window into read-only clarification views. `tool/call`
 *  names the ask (plus its question ids), the matching `tool/result` carries the recorded
 *  answers; an ask without a result stays `answered: false` — never a guessed answer. */
function clarificationsOf(records: readonly unknown[]): RunClarificationView[] {
  const asks = new Map<string, Array<{ id: string, question: string }>>()
  const answers = new Map<string, Map<string, { selected: string[], custom: string | null }>>()
  for (const record of records) {
    const event = eventOf(record)
    if (event === undefined) continue
    const data = event.data
    if (event.type === 'tool/call' && isRecord(data) && data.name === 'ask_user_question' && typeof data.callId === 'string') {
      const args = isRecord(data.arguments) ? data.arguments : null
      const questions = args !== null && Array.isArray(args.questions) ? args.questions : []
      const parsed: Array<{ id: string, question: string }> = []
      for (const question of questions.slice(0, MAX_CLARIFY_QUESTIONS)) {
        if (!isRecord(question) || typeof question.id !== 'string' || question.id === '' || typeof question.question !== 'string' || question.question === '') continue
        parsed.push({ id: question.id.slice(0, 128), question: question.question.slice(0, MAX_CLARIFY_TEXT) })
      }
      if (parsed.length > 0) asks.set(data.callId, parsed)
    }
    if (event.type === 'tool/result' && isRecord(data) && isRecord(data.message) && typeof data.message.callId === 'string') {
      const content = Array.isArray(data.message.content) ? data.message.content : []
      const text = content
        .filter((part): part is Record<string, unknown> => isRecord(part) && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text as string)
        .join('\n')
      if (text.trim() === '') continue
      try {
        const value: unknown = JSON.parse(text)
        if (!isRecord(value) || !Array.isArray(value.answers)) continue
        const map = new Map<string, { selected: string[], custom: string | null }>()
        for (const answer of value.answers) {
          if (!isRecord(answer) || typeof answer.id !== 'string') continue
          const selected = Array.isArray(answer.selected)
            ? answer.selected.filter((label): label is string => typeof label === 'string' && label !== '').slice(0, MAX_CLARIFY_SELECTED).map((label) => label.slice(0, 512))
            : []
          const custom = typeof answer.custom === 'string' && answer.custom !== '' ? answer.custom.slice(0, 2000) : null
          map.set(answer.id, { selected, custom })
        }
        answers.set(data.message.callId, map)
      } catch {
        // An unparsable result is a missing answer, not an invented one.
      }
    }
  }
  const views: RunClarificationView[] = []
  let emitted = 0
  for (const [callId, questions] of asks) {
    if (emitted >= MAX_CLARIFY_CALLS) break
    emitted += 1
    const recorded = answers.get(callId)
    for (const question of questions) {
      if (views.length >= MAX_CLARIFY_TOTAL) break
      const answer = recorded?.get(question.id)
      views.push({
        question: question.question,
        selected: answer?.selected ?? [],
        custom: answer?.custom ?? null,
        answered: answer !== undefined,
      })
    }
  }
  return views
}

function asAnswer(value: unknown): { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string } {
  if (isRecord(value) && value.ok === true) return { ok: true, result: value.result }
  if (isRecord(value) && value.ok === false && typeof value.code === 'string') return { ok: false, code: value.code }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

/** Fold one bounded page of durable events into run rows (chronological in, rows are reversed by callers). */
export function runsOfRecords(records: readonly unknown[]): { readonly runs: RunAccumulator[], readonly earliestSeq: number | null } {
  const runs: RunAccumulator[] = []
  let open: RunAccumulator | null = null
  let earliestSeq: number | null = null
  for (const record of records) {
    const event = eventOf(record)
    if (event === undefined) continue
    const seq = typeof event.seq === 'number' && Number.isSafeInteger(event.seq) ? event.seq : null
    if (seq !== null && (earliestSeq === null || seq < earliestSeq)) earliestSeq = seq
    if (event.type === 'turn/start') {
      if (open !== null) runs.push(open)
      const data = event.data
      open = {
        runSeq: seq ?? -1,
        turn: isRecord(data) && typeof data.turn === 'number' ? data.turn : null,
        provider: null,
        model: null,
        endSeq: null,
        endReason: null,
        messages: 0,
        firstUserText: null,
      }
      continue
    }
    if (open === null) continue
    if (event.type === 'request/header') {
      const data = event.data
      const header = isRecord(data) ? data.header : undefined
      const config = isRecord(header) ? header.config : undefined
      if (isRecord(config) && typeof config.provider === 'string' && typeof config.model === 'string') {
        open.provider = config.provider
        open.model = config.model
      }
      continue
    }
    if (event.type === 'turn/end') {
      const data = event.data
      open.endSeq = seq
      open.endReason = turnEndKind(data)
      runs.push(open)
      open = null
      continue
    }
    if (event.type === 'user/message' || event.type === 'assistant/message') open.messages += 1
    if (event.type === 'user/message' && open.firstUserText === null) {
      const message = isRecord(event.data) ? event.data.message : undefined
      const text = isRecord(message) ? textOf(message.content) : null
      if (text !== null) open.firstUserText = text
    }
  }
  if (open !== null) runs.push(open)
  return { runs, earliestSeq }
}

export interface SessionHistoryStore {
  readonly list: (input: { readonly matterRef: string, readonly beforeSeq?: number }) => Promise<SessionRunListOutcome>
  readonly detail: (input: { readonly matterRef: string, readonly runSeq: number }) => Promise<SessionRunDetailOutcome>
  readonly status: (matterRef: string) => SessionHistoryStatus
}

export function createSessionHistory(deps: SessionHistoryDeps): SessionHistoryStore {
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

  let state: { matterRef: string, runs: readonly SessionHistoryRunView[], hasMore: boolean, nextBeforeSeq: number | null, detail: SessionRunDetailOutcome | null, at: string } | null = null

  const viewOf = (run: RunAccumulator): SessionHistoryRunView => ({
    runSeq: run.runSeq,
    turn: run.turn,
    provider: run.provider,
    model: run.model,
    endSeq: run.endSeq,
    endReason: run.endReason,
    messages: run.messages,
  })

  return {
    async list(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'no-session' }
      // 纯历史接点：只有 session/page；绝不 follow/prompt/attachment（读历史不激活执行）。
      const payload: Record<string, unknown> = { sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }
      if (input.beforeSeq !== undefined) payload.beforeSeq = input.beforeSeq
      let answer: ReturnType<typeof asAnswer>
      try {
        answer = asAnswer(await deps.callBridge('session/page', [payload]))
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return { state: 'refused', code }
      }
      if (!answer.ok) return { state: 'refused', code: answer.code }
      const result = answer.result
      const records = isRecord(result) && Array.isArray(result.records) ? result.records : null
      if (records === null) return { state: 'refused', code: 'history-answer-unrecognised' }
      const hasMore = isRecord(result) && result.hasMore === true
      const { runs, earliestSeq } = runsOfRecords(records)
      const capped = runs.length > MAX_RUNS
      const newestFirst = [...runs].reverse().slice(0, MAX_RUNS).map(viewOf)
      state = {
        matterRef: input.matterRef,
        runs: newestFirst,
        hasMore: hasMore || capped,
        nextBeforeSeq: earliestSeq,
        detail: state !== null && state.matterRef === input.matterRef ? state.detail : null,
        at: deps.now(),
      }
      return { state: 'read', runs: newestFirst, hasMore: state.hasMore, nextBeforeSeq: earliestSeq }
    },

    async detail(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'no-session' }
      // 旧运行才读详情（US-098）：一次有界页，且在本地再按 run 窗口过滤。
      let answer: ReturnType<typeof asAnswer>
      try {
        answer = asAnswer(await deps.callBridge('session/page', [{ sessionId, throughSeq: -1, beforeSeq: input.runSeq, maxMessages: PAGE_MESSAGES }]))
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        const missing: SessionRunDetailOutcome = { state: 'missing', runSeq: input.runSeq, code }
        if (state !== null && state.matterRef === input.matterRef) state = { ...state, detail: missing }
        return missing
      }
      if (!answer.ok) {
        // 不可读=保持缺失，不显示空白成功（US-100）。
        const missing: SessionRunDetailOutcome = { state: 'missing', runSeq: input.runSeq, code: answer.code }
        if (state !== null && state.matterRef === input.matterRef) state = { ...state, detail: missing }
        return missing
      }
      const result = answer.result
      const records = isRecord(result) && Array.isArray(result.records) ? result.records : null
      if (records === null) {
        const missing: SessionRunDetailOutcome = { state: 'missing', runSeq: input.runSeq, code: 'history-answer-unrecognised' }
        if (state !== null && state.matterRef === input.matterRef) state = { ...state, detail: missing }
        return missing
      }
      // Window filter: events with seq >= runSeq (the page's lower bound is our run start).
      const inWindow: unknown[] = []
      for (const record of records) {
        const event = eventOf(record)
        if (event === undefined) continue
        const seq = typeof event.seq === 'number' && Number.isSafeInteger(event.seq) ? event.seq : -1
        if (seq >= input.runSeq) inWindow.push(record)
      }
      const { runs } = runsOfRecords(inWindow)
      const run = runs.find((entry) => entry.runSeq === input.runSeq)
      if (run === undefined) {
        const missing: SessionRunDetailOutcome = { state: 'missing', runSeq: input.runSeq, code: 'history-run-not-in-page' }
        if (state !== null && state.matterRef === input.matterRef) state = { ...state, detail: missing }
        return missing
      }
      let output: string | null = null
      const userTexts: string[] = []
      for (const record of inWindow) {
        const event = eventOf(record)
        if (event === undefined) continue
        const data = event.data
        const message = isRecord(data) ? data.message : undefined
        if (event.type === 'assistant/message') {
          const text = isRecord(message) ? textOf(message.content) : null
          if (text !== null) output = text
        }
        if (event.type === 'user/message' && userTexts.length < MAX_USER_LINES) {
          const text = isRecord(message) ? textOf(message.content) : null
          if (text !== null) userTexts.push(text.slice(0, MAX_USER_CHARS))
        }
      }
      const outcome: SessionRunDetailOutcome = {
        state: 'read',
        runSeq: run.runSeq,
        provider: run.provider,
        model: run.model,
        endSeq: run.endSeq,
        endReason: run.endReason,
        outputPreview: output === null ? null : output.slice(0, MAX_OUTPUT_CHARS),
        outputTruncated: output !== null && output.length > MAX_OUTPUT_CHARS,
        userTexts,
        clarifications: clarificationsOf(inWindow),
      }
      if (state !== null && state.matterRef === input.matterRef) state = { ...state, detail: outcome }
      return outcome
    },

    status(matterRef) {
      if (state === null || state.matterRef !== matterRef) {
        return { state: 'read', runs: [], hasMore: false, nextBeforeSeq: null, detail: null, at: null }
      }
      return { state: 'read', runs: state.runs, hasMore: state.hasMore, nextBeforeSeq: state.nextBeforeSeq, detail: state.detail, at: state.at }
    },
  }
}
