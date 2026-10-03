/** Ticket 034 (US-177~182): the host-side answerer relay for `user-questions/request`.
 *
 * The base raises a clarification through the `ctx.userQuestions.ask()` waterfall; the agent's
 * `ask_user_question` tool blocks until an answerer returns `{answers}`. In the official desktop
 * that answerer is the connected webview client; in Sage the Shell IS the client, so the host
 * process registers its own listener and relays each question to Electron main:
 *
 *   ask() ──waterfall──▶ this relay ──registered（session/questions 可读）──▶ main UI
 *                          ▲                                                  │
 *                          └──────────── resolve（session/answer）◀───────────┘
 *
 * Deliberate properties:
 *
 * - **Claim or delegate.** Only a request carrying an agent (its id IS the session id — the base
 *   declares agent/session as one id) can be routed to a matter, so only those are claimed; every
 *   other request falls through with `next()` and keeps whatever answerer the profile composes.
 * - **Registration order matters at runtime**: a profile-composed remote answerer may register
 *   before this module, so the listener is installed with `prepend: true` (Cordis supports it)
 *   to make the Shell's relay run first; a queued-but-never-consumed remote dispatch would
 *   otherwise swallow the question silently.
 * - **The registry is the live truth of "pending"**, because the waterfall promise lives here:
 *   a question exists exactly while its `ask()` call is blocked on us. Answers validate against
 *   the declared options before resolving, so a label the asker never offered can never reach it.
 * - The request/answer shapes mirror `@deepseek-ai/dsh-user-questions/lib/types/types.d.ts`
 *   (structural copies: that package is a runtime dependency of the profile, not of this app).
 */

/** Mirrors `AskUserQuestionOption`. */
export interface RelayQuestionOption {
  readonly label: string
  readonly description?: string
}

/** Mirrors `AskUserQuestionIntent` (presentation-only tag; the answer encoding is identical). */
export interface RelayQuestionIntent {
  readonly kind: 'plan-review'
  readonly approve: string
}

/** Mirrors `AskUserQuestionItem`. */
export interface RelayQuestionItem {
  readonly id: string
  readonly question: string
  readonly detail?: string
  readonly header?: string
  readonly options?: readonly RelayQuestionOption[]
  readonly multiSelect?: boolean
  readonly intent?: RelayQuestionIntent
}

/** The pending request handed to the waterfall listener. */
export interface RelayQuestionRequest {
  readonly questions: readonly RelayQuestionItem[]
  readonly agent?: { readonly id?: unknown }
  readonly signal?: AbortSignal
}

/** Mirrors `AskUserQuestionAnswerItem`. */
export interface RelayAnswerItem {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom?: string
}

/** The value the waterfall must resolve with (`ask()` reads `.answers`). */
export interface RelayAnswerPayload {
  readonly answers: readonly RelayAnswerItem[]
}

/** One live pending question batch, as main may read it. Plain data only. */
export interface RelayPendingRecord {
  readonly requestId: string
  readonly sessionId: string
  readonly questions: readonly RelayQuestionItem[]
  readonly raisedAt: string
}

export type RelayAnswerOutcome = { readonly ok: true } | { readonly ok: false, readonly code: string }

export interface UserQuestionsRelay {
  /** Claim one request for the shell UI; `undefined` means "not ours — delegate to `next()`". */
  claim(request: RelayQuestionRequest): Promise<RelayAnswerPayload> | undefined
  /** Live pending batches for one session id (agent id = session id). */
  list(sessionId: string): { readonly pending: readonly RelayPendingRecord[] }
  /** Resolve one pending waterfall with the user's answers. */
  answer(requestId: string, answers: unknown): RelayAnswerOutcome
  /** Reject every pending waterfall (host teardown); late answers answer `question-not-found`. */
  dispose(): void
}

export interface UserQuestionsRelayDeps {
  readonly now: () => string
  readonly mintId: () => string
}

const MAX_QUESTIONS = 8
const MAX_ID_CHARS = 128
const MAX_QUESTION_CHARS = 4000
const MAX_HEADER_CHARS = 256
const MAX_DETAIL_CHARS = 8192
const MAX_OPTIONS = 16
const MAX_LABEL_CHARS = 256
const MAX_DESCRIPTION_CHARS = 512
const MAX_SELECTED = 32
const MAX_CUSTOM_CHARS = 8192

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function boundedText(value: unknown, max: number, allowEmpty = false): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed === '' && !allowEmpty) return undefined
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function sanitizeOption(value: unknown): RelayQuestionOption | undefined {
  if (!isRecord(value)) return undefined
  const label = boundedText(value.label, MAX_LABEL_CHARS)
  if (label === undefined) return undefined
  const description = value.description === undefined ? undefined : boundedText(value.description, MAX_DESCRIPTION_CHARS)
  return { label, ...(description === undefined ? {} : { description }) }
}

function sanitizeQuestion(value: unknown): RelayQuestionItem | undefined {
  if (!isRecord(value)) return undefined
  const id = boundedText(value.id, MAX_ID_CHARS)
  const question = boundedText(value.question, MAX_QUESTION_CHARS)
  if (id === undefined || question === undefined) return undefined
  const header = value.header === undefined ? undefined : boundedText(value.header, MAX_HEADER_CHARS)
  const detail = value.detail === undefined ? undefined : boundedText(value.detail, MAX_DETAIL_CHARS, true)
  const options = Array.isArray(value.options)
    ? value.options.slice(0, MAX_OPTIONS).map(sanitizeOption).filter((option): option is RelayQuestionOption => option !== undefined)
    : undefined
  let intent: RelayQuestionIntent | undefined
  if (isRecord(value.intent) && value.intent.kind === 'plan-review') {
    const approve = boundedText(value.intent.approve, MAX_LABEL_CHARS)
    if (approve !== undefined) intent = { kind: 'plan-review', approve }
  }
  return {
    id,
    question,
    ...(detail === undefined ? {} : { detail }),
    ...(header === undefined ? {} : { header }),
    ...(options === undefined || options.length === 0 ? {} : { options }),
    ...(value.multiSelect === true ? { multiSelect: true } : {}),
    ...(intent === undefined ? {} : { intent }),
  }
}

function abortError(): Error {
  const error = new Error('ask_user_question was aborted before the user answered')
  ;(error as Error & { code: string }).code = 'ASK_ABORTED'
  return error
}

function validateAnswers(
  questions: readonly RelayQuestionItem[],
  answers: unknown,
): { readonly ok: true, readonly payload: RelayAnswerPayload } | { readonly ok: false, readonly code: string } {
  if (!Array.isArray(answers) || answers.length !== questions.length) return { ok: false, code: 'question-answers-invalid' }
  const byId = new Map(questions.map((question) => [question.id, question]))
  const seen = new Set<string>()
  const payload: RelayAnswerItem[] = []
  for (const entry of answers) {
    if (!isRecord(entry)) return { ok: false, code: 'question-answers-invalid' }
    const id = boundedText(entry.id, MAX_ID_CHARS)
    const question = id === undefined ? undefined : byId.get(id)
    if (id === undefined || question === undefined || seen.has(id)) return { ok: false, code: 'question-answers-invalid' }
    seen.add(id)
    if (!Array.isArray(entry.selected) || entry.selected.length > MAX_SELECTED) return { ok: false, code: 'question-answers-invalid' }
    const labels = question.options?.map((option) => option.label) ?? []
    const selected: string[] = []
    for (const candidate of entry.selected) {
      const label = boundedText(candidate, MAX_LABEL_CHARS)
      // A label the asker never offered must never reach it; without declared options the
      // selection surface is unknown here, so only the shape is enforced.
      if (label === undefined || (labels.length > 0 && !labels.includes(label))) return { ok: false, code: 'question-answers-invalid' }
      selected.push(label)
    }
    const custom = entry.custom === undefined ? undefined : boundedText(entry.custom, MAX_CUSTOM_CHARS)
    if (entry.custom !== undefined && custom === undefined) return { ok: false, code: 'question-answers-invalid' }
    if (selected.length === 0 && custom === undefined) return { ok: false, code: 'question-answers-invalid' }
    payload.push({ id, selected, ...(custom === undefined ? {} : { custom }) })
  }
  if (seen.size !== questions.length) return { ok: false, code: 'question-answers-invalid' }
  return { ok: true, payload: { answers: payload } }
}

export function createUserQuestionsRelay(deps: UserQuestionsRelayDeps): UserQuestionsRelay {
  interface Entry {
    readonly requestId: string
    readonly sessionId: string
    readonly questions: readonly RelayQuestionItem[]
    readonly raisedAt: string
    readonly resolve: (payload: RelayAnswerPayload) => void
    readonly reject: (error: Error) => void
    readonly signal?: AbortSignal
    readonly onAbort?: () => void
  }
  const entries = new Map<string, Entry>()

  const settle = (entry: Entry): void => {
    entries.delete(entry.requestId)
    if (entry.signal !== undefined && entry.onAbort !== undefined) entry.signal.removeEventListener('abort', entry.onAbort)
  }

  return {
    claim(request) {
      const agentId = isRecord(request) && isRecord(request.agent) ? boundedText(request.agent.id, MAX_ID_CHARS) : undefined
      if (agentId === undefined) return undefined
      const questions = (request.questions ?? []).slice(0, MAX_QUESTIONS).map(sanitizeQuestion)
        .filter((question): question is RelayQuestionItem => question !== undefined)
      if (questions.length === 0) return undefined
      const requestId = deps.mintId()
      let resolve!: (payload: RelayAnswerPayload) => void
      let reject!: (error: Error) => void
      const promise = new Promise<RelayAnswerPayload>((res, rej) => {
        resolve = res
        reject = rej
      })
      const entry: Entry = {
        requestId,
        sessionId: agentId,
        questions,
        raisedAt: deps.now(),
        resolve,
        reject,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      }
      if (request.signal !== undefined) {
        const onAbort = (): void => {
          settle(entry)
          reject(abortError())
        }
        ;(entry as { onAbort?: () => void }).onAbort = onAbort
        request.signal.addEventListener('abort', onAbort, { once: true })
        if (request.signal.aborted) {
          settle(entry)
          reject(abortError())
          return promise
        }
      }
      entries.set(requestId, entry)
      return promise
    },

    list(sessionId) {
      const pending: RelayPendingRecord[] = []
      for (const entry of entries.values()) {
        if (entry.sessionId !== sessionId) continue
        pending.push({ requestId: entry.requestId, sessionId: entry.sessionId, questions: entry.questions, raisedAt: entry.raisedAt })
      }
      return { pending }
    },

    answer(requestId, answers) {
      const entry = entries.get(requestId)
      if (entry === undefined) return { ok: false, code: 'question-not-found' }
      const validated = validateAnswers(entry.questions, answers)
      if (!validated.ok) return validated
      settle(entry)
      entry.resolve(validated.payload)
      return { ok: true }
    },

    dispose() {
      for (const entry of [...entries.values()]) {
        settle(entry)
        entry.reject(abortError())
      }
    },
  }
}

/** The Cordis surface the installer needs; kept structural so this module stays importable without the base. */
export interface RelayHostContext {
  readonly provide: (name: string, value: unknown) => unknown
}

/** Where the relay is reachable for the bridge (`bridge-endpoints.ts` reads it via `ctx.get`). */
export const USER_QUESTIONS_RELAY_SERVICE = 'sageUserQuestionRelay'

type RelayListener = (request: RelayQuestionRequest, next: () => Promise<RelayAnswerPayload>) => Promise<RelayAnswerPayload>

/**
 * Install the relay as the shell's answerer. `prepend` matters: a profile-composed remote
 * answerer may already be registered, and a waterfall listener earlier in the chain could
 * swallow the question into a stream no client consumes.
 */
export function installUserQuestionsRelay(ctx: RelayHostContext, relay: UserQuestionsRelay): void {
  ctx.provide(USER_QUESTIONS_RELAY_SERVICE, relay)
  const host = ctx as unknown as { on(name: string, listener: RelayListener, options?: { prepend?: boolean }): unknown }
  host.on('user-questions/request', (request, next) => {
    const claimed = relay.claim(request)
    return claimed === undefined ? next() : claimed
  }, { prepend: true })
}
