/** Ticket 012: fold the base's `workspace/follow` stream into one list view.
 *
 * The stream is a baseline plus four increment kinds (`upsert` / `remove` / `order` / `archived`).
 * Two rules carry the ticket's acceptance:
 *
 * - **A fresh subscription is the reconciliation.** Folding always starts from nothing, so a
 *   reconnect replaces the local view with the new baseline instead of merging into stale rows.
 * - **Increments never invent rows.** An `order` frame only reorders ids we already hold; an
 *   `upsert` for an unknown id is applied (the base is the authority on existence), but an id the
 *   base never delivered cannot appear out of an ordering hint.
 *
 * Every frame is shape-checked here: the bridge guarantees plain data, not this shape, and a frame
 * that does not parse is counted rather than applied (a silent skip would read as "no change").
 */
import type { WorkspaceListStatus } from '../appservice/contracts.js'

export interface WorkspaceEntry {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionCount: number
  readonly createdAt: string
  readonly updatedAt: string
}

interface FoldState {
  readonly entries: readonly WorkspaceEntry[]
  readonly order: readonly string[]
  readonly archivedSessions: number
}

const EMPTY: FoldState = { entries: [], order: [], archivedSessions: 0 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function readEntry(value: unknown): WorkspaceEntry | undefined {
  if (!isRecord(value)) return undefined
  const workspaceId = readString(value.workspaceId)
  const path = readString(value.path)
  const title = typeof value.title === 'string' ? value.title : undefined
  const createdAt = readString(value.createdAt)
  const updatedAt = readString(value.updatedAt)
  if (workspaceId === undefined || path === undefined || title === undefined || createdAt === undefined || updatedAt === undefined) return undefined
  const sessionIds = Array.isArray(value.sessionIds) ? value.sessionIds.length : 0
  return { workspaceId, path, title, sessionCount: sessionIds, createdAt, updatedAt }
}

/** Apply one frame. Returns the next state and whether the frame was understood. */
export function applyWorkspaceFrame(state: FoldState, frame: unknown): { readonly state: FoldState, readonly applied: boolean } {
  if (!isRecord(frame)) return { state, applied: false }
  if (frame.type === 'baseline') {
    const value = isRecord(frame.value) ? frame.value : undefined
    const items = value !== undefined && Array.isArray(value.items) ? value.items : undefined
    if (items === undefined) return { state, applied: false }
    const entries: WorkspaceEntry[] = []
    for (const item of items) {
      const entry = readEntry(item)
      if (entry !== undefined) entries.push(entry)
    }
    const archived = value !== undefined && Array.isArray(value.archivedSessionIds) ? value.archivedSessionIds.length : 0
    // The baseline is the whole truth for this subscription: nothing from before survives it.
    return { state: { entries, order: entries.map((entry) => entry.workspaceId), archivedSessions: archived }, applied: true }
  }
  if (frame.type === 'upsert') {
    const entry = readEntry(frame.workspace)
    if (entry === undefined) return { state, applied: false }
    const known = state.entries.some((existing) => existing.workspaceId === entry.workspaceId)
    const entries = known
      ? state.entries.map((existing) => existing.workspaceId === entry.workspaceId ? entry : existing)
      : [...state.entries, entry]
    const order = known ? state.order : [...state.order, entry.workspaceId]
    return { state: { ...state, entries, order }, applied: true }
  }
  if (frame.type === 'remove') {
    const workspaceId = readString(frame.workspaceId)
    if (workspaceId === undefined) return { state, applied: false }
    return {
      state: {
        ...state,
        entries: state.entries.filter((entry) => entry.workspaceId !== workspaceId),
        order: state.order.filter((id) => id !== workspaceId),
      },
      applied: true,
    }
  }
  if (frame.type === 'order') {
    if (!Array.isArray(frame.workspaceIds)) return { state, applied: false }
    const known = new Set(state.order)
    // Only ids we already hold may take a position; an unknown id is a hint about a row the base
    // never delivered, and acting on it would be exactly the ghost row this ticket forbids.
    const ordered = frame.workspaceIds.filter((id): id is string => typeof id === 'string' && known.has(id))
    const rest = state.order.filter((id) => !ordered.includes(id))
    return { state: { ...state, order: [...ordered, ...rest] }, applied: true }
  }
  if (frame.type === 'archived') {
    if (!Array.isArray(frame.archivedSessionIds)) return { state, applied: false }
    return { state: { ...state, archivedSessions: frame.archivedSessionIds.length }, applied: true }
  }
  return { state, applied: false }
}

/**
 * Subscribe once and fold every frame. The returned status is a snapshot: a later reconnect calls
 * this again and starts from an empty fold, which is what makes baseline reconciliation exact.
 */
export async function readWorkspaceList(
  stream: (endpoint: string, payload: readonly unknown[], onFrame: (frame: unknown) => void) => Promise<unknown>,
): Promise<WorkspaceListStatus> {
  let state = EMPTY
  let frames = 0
  let unapplied = 0
  let outcome: { readonly ok: true } | { readonly ok: false, readonly code: string }
  try {
    const answer = await stream('workspace/follow', [], (frame) => {
      frames += 1
      const folded = applyWorkspaceFrame(state, frame)
      state = folded.state
      if (!folded.applied) unapplied += 1
    })
    outcome = isRecord(answer) && answer.ok === true
      ? { ok: true }
      : { ok: false, code: isRecord(answer) && typeof answer.code === 'string' ? answer.code : 'bridge-answer-unrecognised' }
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'bridge-host-not-ready'
    outcome = { ok: false, code }
  }
  const byId = new Map(state.entries.map((entry) => [entry.workspaceId, entry]))
  const ordered = state.order.map((id) => byId.get(id)).filter((entry): entry is WorkspaceEntry => entry !== undefined)
  const trailing = state.entries.filter((entry) => !state.order.includes(entry.workspaceId))
  if (!outcome.ok) {
    return { source: 'workspace-follow', state: 'unavailable', reason: outcome.code as WorkspaceListStatus['reason'], entries: [], order: [], archivedSessions: 0, frames, unapplied }
  }
  return {
    source: 'workspace-follow',
    state: 'read',
    reason: null,
    entries: [...ordered, ...trailing],
    order: state.order,
    archivedSessions: state.archivedSessions,
    frames,
    unapplied,
  }
}
