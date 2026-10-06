import { SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** T03-D: the default desktop's search page consumes the real read-only search route
 *  (`POST /.sage/search`, route-skeleton.ts `parseSearchRequest`) instead of an outstanding
 *  placeholder. One query, two sections — never one section's words for the other's state. */

/** The four fields the service's matcher can report (appservice/contracts.ts `SearchMatterHit`). */
export type DesktopSearchMatchedField = 'goal' | 'deliverable' | 'responsibility' | 'projectRef'

export interface DesktopSearchMatterHit {
  readonly matterRef: string
  readonly title: string
  readonly matchedField: DesktopSearchMatchedField
}

export interface DesktopSearchSessionHit {
  readonly sessionId: string
  readonly snippet: string
}

/** The base's bounded session search. An unmounted query engine is `unavailable`, a failed call is
 *  `failed` — neither may be shown as "no hits" (contracts.ts `SearchSessionsSection`). */
export type DesktopSearchSessions =
  | { readonly state: 'available'; readonly items: readonly DesktopSearchSessionHit[]; readonly hasMore: boolean }
  | { readonly state: 'unavailable'; readonly code: string }
  | { readonly state: 'failed'; readonly code: string }

/** The three honest local ends: a validated read, a determinate refusal (with the service's own
 *  code, or a fixed one for an unrecognised shape), or an indeterminate transport failure. */
export type DesktopSearchOutcome =
  | {
      readonly kind: 'read'
      readonly query: string
      readonly matters: readonly DesktopSearchMatterHit[]
      readonly sessions: DesktopSearchSessions
    }
  | { readonly kind: 'refused'; readonly code: string }
  | { readonly kind: 'unknown' }

/** The service trims and caps the query at 500 characters (route-skeleton.ts). The local guard
 *  mirrors those bounds so an empty or oversized query never leaves the process. */
export const SEARCH_QUERY_MAX_LENGTH = 500

/** Presentation labels for the four match fields, kept beside the enum so a new field cannot be
 *  rendered without a deliberate label decision. */
export const SEARCH_MATCHED_FIELD_LABELS: Readonly<Record<DesktopSearchMatchedField, string>> = {
  goal: '目标',
  deliverable: '交付物',
  responsibility: '责任',
  projectRef: '项目',
}

/** The search route is a module constant in route-skeleton.ts (not exported); session.ts/adopt.ts
 *  already follow the same local-constant precedent for their own paths. */
const SAGE_SEARCH_PATH = '/.sage/search'
const UNRECOGNISED = 'search-result-unrecognised'

const TRANSPORT_REFUSALS: Readonly<Record<number, string>> = {
  400: 'invalid-search-request', 403: 'caller-denied', 405: 'method-not-allowed',
  413: 'request-too-large', 415: 'content-type-rejected',
}

const MATCHED_FIELDS: readonly string[] = ['goal', 'deliverable', 'responsibility', 'projectRef']

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseMatterHit(value: unknown): DesktopSearchMatterHit | null {
  if (!isRecord(value)) return null
  const { matterRef, title, matchedField } = value
  if (!nonEmpty(matterRef) || typeof title !== 'string' || typeof matchedField !== 'string'
    || !MATCHED_FIELDS.includes(matchedField)) return null
  return { matterRef, title, matchedField: matchedField as DesktopSearchMatchedField }
}

function parseSessions(value: unknown): DesktopSearchSessions | null {
  if (!isRecord(value)) return null
  if (value.state === 'available') {
    if (!Array.isArray(value.items) || typeof value.hasMore !== 'boolean') return null
    const items: DesktopSearchSessionHit[] = []
    for (const candidate of value.items) {
      if (!isRecord(candidate) || !nonEmpty(candidate.sessionId) || typeof candidate.snippet !== 'string') return null
      items.push({ sessionId: candidate.sessionId, snippet: candidate.snippet })
    }
    return { state: 'available', items, hasMore: value.hasMore }
  }
  if ((value.state === 'unavailable' || value.state === 'failed') && nonEmpty(value.code)) {
    return { state: value.state, code: value.code }
  }
  return null
}

/** Validate the response field by field against the two outcome states; any deviation resolves to
 *  a fixed honest refusal instead of being displayed as a read. */
export function classifySearchOutcome(input: unknown): DesktopSearchOutcome {
  if (!isRecord(input)) return { kind: 'refused', code: UNRECOGNISED }
  if (input.state === 'refused') {
    return nonEmpty(input.code) ? { kind: 'refused', code: input.code } : { kind: 'refused', code: UNRECOGNISED }
  }
  if (input.state !== 'read' || typeof input.query !== 'string' || !Array.isArray(input.matters)) {
    return { kind: 'refused', code: UNRECOGNISED }
  }
  const matters: DesktopSearchMatterHit[] = []
  for (const candidate of input.matters) {
    const hit = parseMatterHit(candidate)
    if (hit === null) return { kind: 'refused', code: UNRECOGNISED }
    matters.push(hit)
  }
  const sessions = parseSessions(input.sessions)
  if (sessions === null) return { kind: 'refused', code: UNRECOGNISED }
  return { kind: 'read', query: input.query, matters, sessions }
}

/** POST one bounded query to the search route. A locally invalid query is refused before any
 *  request; transport failures and malformed outcomes never become a synthesized result. */
export async function searchDesktop(query: string): Promise<DesktopSearchOutcome> {
  const trimmed = query.trim()
  if (trimmed === '' || trimmed.length > SEARCH_QUERY_MAX_LENGTH) {
    return { kind: 'refused', code: 'invalid-search-request' }
  }
  try {
    const response = await fetch(SAGE_SEARCH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: trimmed }),
      cache: 'no-store',
      signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    const transportRefusal = TRANSPORT_REFUSALS[response.status]
    if (transportRefusal !== undefined) return { kind: 'refused', code: transportRefusal }
    if (!response.ok) return { kind: 'refused', code: UNRECOGNISED }
    return classifySearchOutcome(await response.json())
  } catch {
    return { kind: 'unknown' }
  }
}
