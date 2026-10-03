/** Ticket 021 (FW-014, US-085~089): one query, two sections — and the read surface stays read.
 *
 * What each section is, per the evidence:
 *
 * - **Matters** match locally over the records Sage already holds (converted drafts: the goal as
 *   the title plus its key attributes). No store is added, no projection is activated.
 * - **Sessions** go to the base's own `sessionController.search` — bounded (a cursor loop with a
 *   100-call work budget that returns at most 20 current-surface message hits and truncates each
 *   snippet at 240 code points) and visible-only (its corpus listing filters to sessions with a
 *   resolved cwd). The bridge reaches it only through the allowlisted `session/search` read.
 * - **The engine's absence is its own state**: the controller's first act is `ctx.get('sessionQuery')`
 *   — when that is missing the answer is `unavailable` with its code, and this module keeps it
 *   apart from an empty result list, in both directions (US-087).
 * - **Nothing here writes**: no session creation, no prompt, no follow, no page read — the hits are
 *   text a surface may show; opening a session is never this act (US-088).
 */
import type { SearchMatterHit, SearchOutcome, SearchSessionsSection } from '../appservice/contracts.js'
import type { BridgeCaller } from './workspace-adoption.js'

const MAX_QUERY_CHARS = 500
const MAX_MATTER_HITS = 20

export interface MatterSearchFact {
  readonly matterRef: string
  readonly goal: string
  readonly deliverable: string
  readonly responsibility: string
  readonly projectRef: string
}

export interface SearchDeps {
  readonly callBridge: BridgeCaller
  /** The local records one query may match: converted-draft facts, newest first. */
  readonly listMatterFacts: () => readonly MatterSearchFact[]
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

/** Matter hits: case-insensitive substring over the titled fields, one hit per matter, capped. */
export function matchMatters(facts: readonly MatterSearchFact[], query: string): readonly SearchMatterHit[] {
  const needle = query.toLowerCase()
  const hits: SearchMatterHit[] = []
  const seen = new Set<string>()
  for (const fact of facts) {
    if (seen.has(fact.matterRef)) continue
    const fields: Array<[SearchMatterHit['matchedField'], string]> = [
      ['goal', fact.goal],
      ['deliverable', fact.deliverable],
      ['responsibility', fact.responsibility],
      ['projectRef', fact.projectRef],
    ]
    for (const [field, text] of fields) {
      if (text !== '' && text.toLowerCase().includes(needle)) {
        seen.add(fact.matterRef)
        hits.push({ matterRef: fact.matterRef, title: fact.goal === '' ? fact.matterRef : fact.goal, matchedField: field })
        break
      }
    }
    if (hits.length >= MAX_MATTER_HITS) break
  }
  return hits
}

/** The session section as the base's own answer shape; an unrecognised shape is its own failure. */
function sessionsFrom(answer: { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string }): SearchSessionsSection {
  if (!answer.ok) {
    // The missing engine keeps its named state; anything else is a failure with its code.
    return answer.code === 'bridge-search-unavailable'
      ? { state: 'unavailable', code: answer.code }
      : { state: 'failed', code: answer.code }
  }
  const result = answer.result
  if (!isRecord(result) || !Array.isArray(result.items) || typeof result.hasMore !== 'boolean') {
    return { state: 'failed', code: 'bridge-answer-unrecognised' }
  }
  const items: Array<{ sessionId: string, snippet: string }> = []
  for (const item of result.items) {
    if (!isRecord(item) || typeof item.sessionId !== 'string' || item.sessionId === '' || typeof item.snippet !== 'string') {
      return { state: 'failed', code: 'bridge-answer-unrecognised' }
    }
    items.push({ sessionId: item.sessionId, snippet: item.snippet })
  }
  return { state: 'available', items, hasMore: result.hasMore }
}

export interface Searcher {
  readonly search: (query: string) => Promise<SearchOutcome>
}

export function createSearch(deps: SearchDeps): Searcher {
  return {
    async search(query) {
      const trimmed = query.trim()
      // The base refuses these too; refusing them here keeps main from spending a bridge call.
      if (trimmed === '' || trimmed.length > MAX_QUERY_CHARS || trimmed.includes('\u0000')) {
        return { state: 'refused', code: 'search-query-invalid' }
      }
      let sessions: SearchSessionsSection
      try {
        sessions = sessionsFrom(asAnswer(await deps.callBridge('session/search', [{ query: trimmed }])))
      } catch (error) {
        const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'bridge-host-not-ready'
        sessions = { state: 'failed', code }
      }
      // Matters never depend on the session side: with the engine missing, local matching still answers.
      return { state: 'read', query: trimmed, matters: matchMatters(deps.listMatterFacts(), trimmed), sessions }
    },
  }
}
