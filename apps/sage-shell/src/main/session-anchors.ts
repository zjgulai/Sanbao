/** Ticket 035 (US-183/184): message anchors — turn jump points read through the pure history seam.
 *
 * The rules the ticket names:
 *
 * - **Anchors are (turn, run) references with a short preview.** The preview is the run's own
 *   first user text, bounded here — reading anchors never drags a full transcript across the
 *   bridge and never activates the session (`session/page` is the only call, exactly as 009).
 * - **Locate is a read, not an action.** Opening one target re-reads one bounded page window
 *   around that run and answers its short preview; a target that cannot be read stays `missing`
 *   with its reason (US-184), so the rail keeps its scene instead of collapsing to a blank.
 * - Hover shows nothing remote: every effect here is an explicit read.
 */
import { readFileSync } from 'node:fs'

import type {
  SessionAnchorListOutcome,
  SessionAnchorLocateOutcome,
  SessionAnchorView,
  SessionAnchorsStatus,
} from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'
import { runsOfRecords } from './session-history.js'

const PAGE_MESSAGES = 400
const MAX_ANCHORS = 50
const MAX_PREVIEW_CHARS = 140
const MAX_LOCATE_PREVIEW_CHARS = 300

export interface SessionAnchorsDeps {
  readonly callBridge: BridgeCaller
  readonly bindingsFile: string
  readonly now: () => string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function previewOf(text: string | null, max: number): string | null {
  if (text === null) return null
  const trimmed = text.trim()
  if (trimmed === '') return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

function viewsOf(records: readonly unknown[]): SessionAnchorView[] {
  const { runs } = runsOfRecords(records)
  return [...runs]
    .reverse()
    .slice(0, MAX_ANCHORS)
    .map((run) => ({ runSeq: run.runSeq, turn: run.turn, promptPreview: previewOf(run.firstUserText, MAX_PREVIEW_CHARS) }))
}

export interface SessionAnchorsStore {
  readonly read: (input: { readonly matterRef: string }) => Promise<SessionAnchorListOutcome>
  readonly locate: (input: { readonly matterRef: string, readonly runSeq: number }) => Promise<SessionAnchorLocateOutcome>
  readonly status: (matterRef: string) => SessionAnchorsStatus
}

export function createSessionAnchors(deps: SessionAnchorsDeps): SessionAnchorsStore {
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

  let state: { matterRef: string, anchors: readonly SessionAnchorView[], located: SessionAnchorsStatus['located'], at: string } | null = null

  const readPage = async (sessionId: string, beforeSeq?: number): Promise<{ ok: true, records: readonly unknown[] } | { ok: false, code: string }> => {
    const payload: Record<string, unknown> = { sessionId, throughSeq: -1, maxMessages: PAGE_MESSAGES }
    if (beforeSeq !== undefined) payload.beforeSeq = beforeSeq
    let answer: unknown
    try {
      answer = await deps.callBridge('session/page', [payload])
    } catch (error) {
      return { ok: false, code: isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready' }
    }
    if (!isRecord(answer) || answer.ok !== true) {
      return { ok: false, code: isRecord(answer) && answer.ok === false && typeof answer.code === 'string' ? answer.code : 'history-answer-unrecognised' }
    }
    const result = answer.result
    const records = isRecord(result) && Array.isArray(result.records) ? result.records : null
    if (records === null) return { ok: false, code: 'history-answer-unrecognised' }
    return { ok: true, records }
  }

  return {
    async read(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'no-session' }
      // 纯历史接点：只有 session/page（读锚点不激活执行、不整段载入正文）。
      const page = await readPage(sessionId)
      if (!page.ok) return { state: 'unavailable', code: page.code }
      const anchors = viewsOf(page.records)
      state = {
        matterRef: input.matterRef,
        anchors,
        located: state !== null && state.matterRef === input.matterRef ? state.located : null,
        at: deps.now(),
      }
      return { state: 'read', anchors }
    },

    async locate(input) {
      const sessionId = readBindings()[input.matterRef]
      if (sessionId === undefined) return { state: 'no-session' }
      // 定位=对目标运行一次有界窗口读（US-184：不可读=missing+原因，保现场不空白）。
      const page = await readPage(sessionId, input.runSeq)
      if (!page.ok) return { state: 'missing', runSeq: input.runSeq, code: page.code }
      const { runs } = runsOfRecords(page.records)
      const run = runs.find((entry) => entry.runSeq === input.runSeq)
      if (run === undefined) return { state: 'missing', runSeq: input.runSeq, code: 'history-run-not-in-page' }
      const promptPreview = previewOf(run.firstUserText, MAX_LOCATE_PREVIEW_CHARS)
      if (state !== null && state.matterRef === input.matterRef) state = { ...state, located: { runSeq: input.runSeq, promptPreview } }
      return { state: 'located', runSeq: run.runSeq, turn: run.turn, promptPreview }
    },

    status(matterRef) {
      if (state === null || state.matterRef !== matterRef) {
        return { state: 'read', anchors: [], located: null, code: null, at: null }
      }
      return { state: 'read', anchors: state.anchors, located: state.located, code: null, at: state.at }
    },
  }
}
