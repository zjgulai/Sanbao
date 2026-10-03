/** Ticket 034 (US-177~182): the clarification loop over the host relay.
 *
 * The rules the ticket names:
 *
 * - **The pending list is the live relay registry** (`session/questions`) — a question exists
 *   exactly while the base's `ask()` waterfall is blocked on it; nothing here invents a card.
 * - **The card binds to its run** (US-177): pending questions can only exist inside an open turn,
 *   so the card carries that open run, read from the same durable log the history seam owns
 *   (bounded page, only when a question is actually pending).
 * - **Answers ride one named write** (`session/answer` → the relay resolves the waterfall) and the
 *   receipt is three-plus-one states: `accepted` (handed over, not yet confirmed effective),
 *   `effective` (the tool result is in the durable log — execution actually took it), `unknown`
 *   (no ack; verify only, never retry), `aborted` (US-182: stop left the wait without an answer).
 * - **One submission per question, ever** (US-178): repeat clicks and refreshes return the same
 *   receipt and never dispatch a second bridge call.
 * - **Stop mid-wait turns the card into 待继续** (US-182): a question that vanished while the
 *   session was paused, with no answer submitted, is preserved as `deferred(stopped)` — never
 *   silently dropped, never auto-continued.
 * - **The answer writes nothing but the answer** (US-179): no matter/draft/delivery endpoint is
 *   touched, custom text travels with the same authority as a chosen option.
 */
import { readFileSync } from 'node:fs'

import type {
  ClarificationAnswerOutcome,
  ClarificationCardView,
  ClarificationDeferredView,
  ClarificationOptionView,
  ClarificationQuestionView,
  ClarificationReceiptState,
  ClarificationReceiptView,
  ClarificationRunRef,
  ClarificationStatus,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'
import { runsOfRecords } from './session-history.js'

const PAGE_MESSAGES = 200
const MAX_CARDS = 8
const MAX_DEFERRED = 8
const MAX_RECEIPTS = 32
const MAX_MATTERS = 8
const MAX_QUESTIONS = 8
const MAX_OPTIONS = 16
const MAX_ID_CHARS = 128
const MAX_TEXT_CHARS = 4000
const MAX_HEADER_CHARS = 256
const MAX_DETAIL_CHARS = 8192
const MAX_LABEL_CHARS = 256
const MAX_DESCRIPTION_CHARS = 512
const MAX_SELECTED = 16
const MAX_SELECTED_LABEL = 512
const MAX_CUSTOM_CHARS = 4096

export interface ClarificationsDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
  /** Ticket 007's pause truth: while paused, no answer may be dispatched. */
  readonly pending?: { isPaused(matterRef: string): boolean }
}

export interface ClarificationAnswerInput {
  readonly matterRef: string
  readonly requestId: string
  readonly answers: readonly unknown[]
}

export interface ClarificationsStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<ClarificationStatus>
  readonly answer: (input: ClarificationAnswerInput) => Promise<ClarificationAnswerOutcome>
}

interface ReceiptRecord {
  readonly requestId: string
  readonly questionIds: readonly string[]
  state: ClarificationReceiptState
  readonly submittedAt: string
  readonly code: string | null
}

interface MatterState {
  readonly deferred: ClarificationDeferredView[]
  readonly receipts: ReceiptRecord[]
  lastPending: readonly ClarificationCardView[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function viewOfOption(value: unknown): ClarificationOptionView | null {
  if (!isRecord(value)) return null
  const label = boundedText(value.label, MAX_LABEL_CHARS)
  if (label === null) return null
  return { label, description: boundedText(value.description, MAX_DESCRIPTION_CHARS) }
}

function viewOfQuestion(value: unknown): ClarificationQuestionView | null {
  if (!isRecord(value)) return null
  const questionId = boundedText(value.id, MAX_ID_CHARS)
  const question = boundedText(value.question, MAX_TEXT_CHARS)
  if (questionId === null || question === null) return null
  const options = Array.isArray(value.options)
    ? value.options.slice(0, MAX_OPTIONS).map(viewOfOption).filter((option): option is ClarificationOptionView => option !== null)
    : []
  const intent = isRecord(value.intent) && value.intent.kind === 'plan-review' ? value.intent : null
  return {
    questionId,
    question,
    header: boundedText(value.header, MAX_HEADER_CHARS),
    detail: typeof value.detail === 'string' && value.detail.trim() !== '' ? value.detail.slice(0, MAX_DETAIL_CHARS) : null,
    options,
    multiSelect: value.multiSelect === true,
    intentKind: intent === null ? null : 'plan-review',
    approveLabel: intent === null ? null : boundedText(intent.approve, MAX_LABEL_CHARS),
  }
}

function viewOfCard(value: unknown): ClarificationCardView | null {
  if (!isRecord(value)) return null
  const requestId = boundedText(value.requestId, MAX_ID_CHARS)
  if (requestId === null || !Array.isArray(value.questions)) return null
  const questions = value.questions.slice(0, MAX_QUESTIONS).map(viewOfQuestion)
    .filter((question): question is ClarificationQuestionView => question !== null)
  if (questions.length === 0) return null
  return { requestId, questions, run: null, raisedAt: boundedText(value.raisedAt, 64) ?? '' }
}

interface PageFacts {
  readonly run: ClarificationRunRef | null
  readonly askCalls: readonly { readonly callId: string, readonly questionIds: readonly string[] }[]
  readonly resultCallIds: ReadonlySet<string>
}

function pageFactsOf(records: readonly unknown[]): PageFacts {
  const { runs } = runsOfRecords(records)
  const open = [...runs].reverse().find((run) => run.endSeq === null) ?? null
  const run = open === null ? null : { runSeq: open.runSeq, turn: open.turn }
  const askCalls: Array<{ callId: string, questionIds: string[] }> = []
  const resultCallIds = new Set<string>()
  for (const record of records) {
    if (!isRecord(record) || record.type !== 'event' || !isRecord(record.event)) continue
    const event = record.event
    const data = isRecord(event.data) ? event.data : null
    if (event.type === 'tool/call' && data !== null && data.name === 'ask_user_question') {
      const callId = boundedText(data.callId, MAX_ID_CHARS)
      const args = isRecord(data.arguments) ? data.arguments : null
      const questions = args !== null && Array.isArray(args.questions) ? args.questions : []
      const questionIds = questions
        .map((question) => (isRecord(question) ? boundedText(question.id, MAX_ID_CHARS) : null))
        .filter((id): id is string => id !== null)
      if (callId !== null && questionIds.length > 0) askCalls.push({ callId, questionIds })
    }
    if (event.type === 'tool/result' && data !== null && isRecord(data.message)) {
      const callId = boundedText(data.message.callId, MAX_ID_CHARS)
      if (callId !== null) resultCallIds.add(callId)
    }
  }
  return { run, askCalls, resultCallIds }
}

/** The submission frozen by the bridge attempt; validated here so a refusal costs no call. */
interface NormalizedAnswer {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom?: string
}

function normalizeAnswers(
  card: ClarificationCardView,
  answers: readonly unknown[],
): { readonly ok: true, readonly answers: readonly NormalizedAnswer[] } | { readonly ok: false, readonly code: string } {
  if (answers.length !== card.questions.length) return { ok: false, code: 'clarification-answer-invalid' }
  const byId = new Map(card.questions.map((question) => [question.questionId, question]))
  const seen = new Set<string>()
  const normalized: NormalizedAnswer[] = []
  for (const entry of answers) {
    if (!isRecord(entry)) return { ok: false, code: 'clarification-answer-invalid' }
    const id = boundedText(entry.questionId, MAX_ID_CHARS)
    const question = id === null ? undefined : byId.get(id)
    if (id === null || question === undefined || seen.has(id)) return { ok: false, code: 'clarification-answer-invalid' }
    seen.add(id)
    if (!Array.isArray(entry.selected) || entry.selected.length > MAX_SELECTED) return { ok: false, code: 'clarification-answer-invalid' }
    const labels = question.options.map((option) => option.label)
    const selected: string[] = []
    for (const candidate of entry.selected) {
      const label = boundedText(candidate, MAX_SELECTED_LABEL)
      // US-179: only labels the asker offered; the option set is the contract, order is not.
      if (label === null || !labels.includes(label)) return { ok: false, code: 'clarification-answer-invalid' }
      selected.push(label)
    }
    let custom: string | undefined
    if (entry.custom !== undefined) {
      if (typeof entry.custom !== 'string') return { ok: false, code: 'clarification-answer-invalid' }
      const trimmed = entry.custom.trim()
      if (trimmed === '' || trimmed.length > MAX_CUSTOM_CHARS) return { ok: false, code: 'clarification-answer-invalid' }
      custom = trimmed
    }
    if (selected.length === 0 && custom === undefined) return { ok: false, code: 'clarification-answer-invalid' }
    normalized.push({ id, selected, ...(custom === undefined ? {} : { custom }) })
  }
  if (seen.size !== card.questions.length) return { ok: false, code: 'clarification-answer-invalid' }
  return { ok: true, answers: normalized }
}

export function createClarifications(deps: ClarificationsDeps): ClarificationsStore {
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

  const matters = new Map<string, MatterState>()

  const stateOf = (matterRef: string): MatterState => {
    let state = matters.get(matterRef)
    if (state === undefined) {
      state = { deferred: [], receipts: [], lastPending: [] }
      matters.set(matterRef, state)
      while (matters.size > MAX_MATTERS) {
        const oldest = matters.keys().next().value as string
        matters.delete(oldest)
      }
    }
    return state
  }

  const receiptViewOf = (record: ReceiptRecord): ClarificationReceiptView => ({
    requestId: record.requestId,
    state: record.state,
    submittedAt: record.submittedAt,
    code: record.code,
    // Derived from the live state, never frozen at submission: an accepted receipt that later
    // aborts must offer verification, not the retry affordance of a fresh submission.
    verifyOnly: record.state === 'aborted' || record.state === 'unknown',
  })

  const emptyStatus = (state: ClarificationStatus['state'], code: string | null, matterRef: string): ClarificationStatus => {
    const internal = stateOf(matterRef)
    return {
      state,
      pending: [],
      deferred: [...internal.deferred],
      receipts: internal.receipts.map(receiptViewOf),
      code,
      at: null,
    }
  }

  const readPageFacts = async (sessionId: string): Promise<PageFacts | null> => {
    try {
      const answer = await deps.callBridge('session/page', [{ sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }])
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) return null
      const result = record.result
      const records = isRecord(result) && Array.isArray(result.records) ? result.records : null
      return records === null ? null : pageFactsOf(records)
    } catch {
      return null
    }
  }

  return {
    async read(input) {
      const state = stateOf(input.matterRef)
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return emptyStatus('no-session', null, input.matterRef)

      let answer: unknown
      try {
        answer = await deps.callBridge('session/questions', [{ sessionId }])
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        return emptyStatus('unavailable', code, input.matterRef)
      }
      const record = isRecord(answer) ? answer : null
      if (record === null || record.ok !== true) {
        const code = record !== null && record.ok === false && typeof record.code === 'string' ? record.code : 'clarification-answer-unrecognised'
        return emptyStatus('unavailable', code, input.matterRef)
      }
      const result = record.result
      const pendingRaw = isRecord(result) && Array.isArray(result.pending) ? result.pending : null
      if (pendingRaw === null) return emptyStatus('unavailable', 'clarification-answer-unrecognised', input.matterRef)

      const cards = pendingRaw.slice(0, MAX_CARDS).map(viewOfCard)
        .filter((card): card is ClarificationCardView => card !== null)
      const pendingIds = new Set(cards.map((card) => card.requestId))

      const paused = deps.pending?.isPaused(input.matterRef) === true
      const awaitingEvidence = state.receipts.some((receipt) => receipt.state === 'accepted')
      let facts: PageFacts | null = null
      if (cards.length > 0 || awaitingEvidence) facts = await readPageFacts(sessionId)
      const boundCards = facts === null || facts.run === null
        ? cards
        : cards.map((card) => ({ ...card, run: facts.run }))

      // US-182: a card that left the wait with no answer is preserved — as 待继续 when the session
      // was paused under it, as 已中止 otherwise. Never dropped silently.
      const known = new Set([
        ...state.deferred.map((entry) => entry.requestId),
        ...state.receipts.map((entry) => entry.requestId),
      ])
      for (const card of state.lastPending) {
        if (pendingIds.has(card.requestId) || known.has(card.requestId)) continue
        state.deferred.push({ ...card, reason: paused ? 'stopped' : 'gone' })
        known.add(card.requestId)
      }
      while (state.deferred.length > MAX_DEFERRED) state.deferred.shift()

      // Receipt settlement: accepted → effective only on durable result evidence; accepted →
      // aborted when the pause under it explains the disappearance; otherwise it stays accepted
      // (waiting for the confirmation the log has not shown yet — never a guessed "answered").
      for (const receipt of state.receipts) {
        if (receipt.state !== 'accepted') continue
        if (pendingIds.has(receipt.requestId)) continue
        if (facts !== null) {
          const askCall = facts.askCalls.find((call) => call.questionIds.some((id) => receipt.questionIds.includes(id)))
          if (askCall !== undefined && facts.resultCallIds.has(askCall.callId)) {
            receipt.state = 'effective'
            continue
          }
        }
        if (paused) receipt.state = 'aborted'
      }
      while (state.receipts.length > MAX_RECEIPTS) state.receipts.shift()

      state.lastPending = boundCards
      // Cards whose receipt was recorded while still pending do not render as live cards again.
      const answeredIds = new Set(state.receipts.map((receipt) => receipt.requestId))
      const liveCards = boundCards.filter((card) => !answeredIds.has(card.requestId))

      return {
        state: 'read',
        pending: liveCards,
        deferred: [...state.deferred],
        receipts: state.receipts.map(receiptViewOf),
        code: null,
        at: deps.now(),
      }
    },

    async answer(input) {
      const state = stateOf(input.matterRef)
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'refused', code: 'clarification-no-session' }
      const key = `${sessionId}:${input.requestId}`

      // US-178: one submission per question, ever — a repeat click or a refresh returns the
      // recorded outcome and dispatches nothing.
      const recorded = state.receipts.find((receipt) => `${sessionId}:${receipt.requestId}` === key)
      if (recorded !== undefined) return { state: 'recorded', receipt: receiptViewOf(recorded) }

      // US-182/FW-002: while the session is paused, an answer cannot be dispatched (stop already
      // aborted the wait at the runtime); nothing is recorded, so resume-then-answer stays possible.
      if (deps.pending?.isPaused(input.matterRef) === true) return { state: 'refused', code: 'clarification-paused' }

      const card = state.lastPending.find((entry) => entry.requestId === input.requestId)
      if (card === undefined) return { state: 'refused', code: 'clarification-not-pending' }
      const normalized = normalizeAnswers(card, input.answers)
      if (!normalized.ok) return { state: 'refused', code: normalized.code }

      let accepted = false
      let code: string | null = null
      try {
        const outcome = await deps.callBridge('session/answer', [{ requestId: input.requestId, answers: normalized.answers }])
        if (isRecord(outcome) && outcome.ok === true) accepted = true
        else code = isRecord(outcome) && outcome.ok === false && typeof outcome.code === 'string' ? outcome.code : 'bridge-answer-unrecognised'
      } catch (error) {
        code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
      }

      const receiptState: ClarificationReceiptState = accepted ? 'accepted' : code === 'question-not-found' ? 'aborted' : 'unknown'
      const record2: ReceiptRecord = {
        requestId: input.requestId,
        questionIds: card.questions.map((question) => question.questionId),
        state: receiptState,
        submittedAt: deps.now(),
        code,
      }
      state.receipts.push(record2)
      while (state.receipts.length > MAX_RECEIPTS) state.receipts.shift()
      return { state: 'recorded', receipt: receiptViewOf(record2) }
    },
  }
}
