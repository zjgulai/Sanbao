import { SAGE_BOOTSTRAP_PATH, SAGE_REQUEST_TIMEOUT_MS, SAGE_STATE_PATH, type SageViewState } from '../../contracts.js'
import { parseDesktopSession, type DesktopSession } from './session.js'

export type DesktopRead =
  | { readonly kind: 'blocked'; readonly code: string }
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'read'
      readonly runtime: SageViewState
      readonly session?: DesktopSession
      /** T03: the three optional workspace-projection slots. Each is carried only when the slot
       *  survived its own strict per-field validation; a malformed slot is omitted, never fatal. */
      readonly workspaces?: DesktopWorkspaceList
      readonly matterLinks?: DesktopMatterLinks
      readonly activeContext?: DesktopActiveContext
      /** ADR-0300: the artifact slot (cards + the one side-preview state). */
      readonly artifacts?: DesktopArtifacts
      /** ADR-0304: the run-monitor slot (steps + the honest unknown axes). */
      readonly monitor?: DesktopRunMonitor
      /** Loop-Q R9: the knowledge readout slot ({state, reason} only). */
      readonly readoutKnowledge?: DesktopReadoutKnowledge
      /** ADR-0312: the eleven settings leaves (Ticket 046 machine, read-only rows). */
      readonly settingsLeaves?: readonly DesktopSettingsLeaf[]
      /** ADR-0316 (R16 shell batch): the matter roster and the O04 administration reads. */
      readonly matterList?: DesktopMatterList
      readonly matterAdmin?: DesktopMatterAdmin
      readonly matterGroups?: DesktopMatterGroups
    }

/** ADR-0312: one settings leaf as the desktop renders it — title + honest state + where the fact
 *  comes from. No write entry exists (the machine offers none). */
export interface DesktopSettingsLeaf {
  readonly leafId: string
  readonly title: string
  readonly state: 'read' | 'unavailable'
  readonly source: string
  readonly note: string
}

/** Loop-Q R9: the knowledge readout as the knowledge page displays it — the honest named
 *  state/reason pair; the slot is omitted entirely when the envelope carries nothing usable. */
export interface DesktopReadoutKnowledge {
  readonly state: string
  readonly reason: string
}

// Loop-Q R9: tolerant like parseMonitor — a present {state, reason} pair of nonempty strings is
// carried; anything missing or malformed omits the slot instead of failing the read.
function parseReadoutKnowledge(input: unknown): DesktopReadoutKnowledge | null {
  if (!isRecord(input)) return null
  return typeof input.state === 'string' && input.state !== '' && typeof input.reason === 'string' && input.reason !== ''
    ? { state: input.state, reason: input.reason }
    : null
}

/** ADR-0304: the run monitor as the desktop displays it — the steps axis plus honest
 *  state/reason rows (an unknown axis keeps its named reason; it is never a zero). */
export interface DesktopRunMonitor {
  readonly state: 'read' | 'unavailable'
  readonly steps: {
    readonly state: 'running' | 'idle' | 'unavailable'
    readonly lastTurnEnd: string | null
    readonly observedRecords: number
    readonly reason: string | null
  }
  readonly axes: readonly {
    readonly name: string
    readonly state: string
    readonly reason: string
  }[]
}

/** ADR-0300: one artifact card as the observed feed reports it (display facts only). */
export interface DesktopArtifactCard {
  readonly artifactId: string
  readonly name: string
  readonly kind: string
  readonly bytes: number | null
  readonly state: 'ready' | 'absent' | 'unconfirmed'
}

/** ADR-0300: the side-preview state; the panel itself is the main-owned WebContentsView. */
export type DesktopArtifactPreview =
  | { readonly state: 'closed' }
  | { readonly state: 'opening'; readonly artifactId: string; readonly name: string }
  | { readonly state: 'ready'; readonly artifactId: string; readonly name: string; readonly expanded: boolean; readonly window: boolean }
  | { readonly state: 'failed'; readonly artifactId: string; readonly name: string; readonly code: string; readonly retryable: boolean }

export interface DesktopArtifacts {
  readonly state: 'read' | 'unavailable'
  readonly cards: readonly DesktopArtifactCard[]
  readonly preview: DesktopArtifactPreview
}

/** T03: one workspace row as folded from the base's `workspace/follow` stream. */
export interface DesktopWorkspaceEntry {
  readonly workspaceId: string
  readonly path: string
  readonly title: string
  readonly sessionCount: number
  readonly createdAt: string
  readonly updatedAt: string
}

export interface DesktopWorkspaceList {
  readonly state: 'read' | 'unavailable'
  readonly reason: string | null
  readonly entries: readonly DesktopWorkspaceEntry[]
  readonly order: readonly string[]
  readonly archivedSessions: number
  readonly frames: number
  readonly unapplied: number
}

/** T03: one matter ↔ workspace association (controlled view; no root, no absolute machine path). */
export interface DesktopMatterLink {
  readonly matterRef: string
  readonly workspaceRef: string
  readonly workspacePath: string
  readonly linkedAt: string
  readonly isDefault: boolean
}

export interface DesktopMatterLinks {
  readonly state: 'read' | 'unavailable'
  readonly links: readonly DesktopMatterLink[]
}

/** T03: the active-context facts; reading them never activates or replaces a context. */
export type DesktopActiveContext =
  | { readonly state: 'unavailable'; readonly contextGeneration: null }
  | { readonly state: 'inactive'; readonly contextGeneration: number }
  | {
      readonly state: 'active'
      readonly contextGeneration: number
      readonly matterId: string
      readonly revisionId: string
      readonly workspaceRef: string
      readonly frameGeneration: number
    }

/** ADR-0316 (R16): the matter roster (Ticket 032's list projection) — display facts only. */
export interface DesktopMatterTrigger {
  readonly kind: 'attempt-unknown' | 'attempt-failed' | 'pending-inputs'
  readonly ref: string
  readonly count: number | null
}
export interface DesktopMatterListItem {
  readonly itemId: string
  readonly matterRef: string | null
  readonly title: string
  readonly partition: 'action' | 'in-progress' | 'acceptance'
  readonly triggers: readonly DesktopMatterTrigger[]
  readonly acceptanceCandidateCount: number
  readonly lifecycle: 'active' | 'archived'
  readonly updatedAt: string
}
export interface DesktopMatterList {
  readonly state: 'read' | 'unavailable'
  readonly code: string | null
  readonly items: readonly DesktopMatterListItem[]
  readonly counts: { readonly action: number, readonly inProgress: number, readonly acceptance: number }
}
/** ADR-0316 (R16): the O04 administration reads (archive entries, trail, rename/batch read-backs). */
export interface DesktopMatterAdmin {
  readonly state: 'read' | 'unavailable'
  readonly entries: readonly { readonly matterRef: string, readonly archivedAt: string, readonly ground: 'completed' | 'stopped' }[]
  readonly trail: readonly { readonly at: string, readonly action: 'archive' | 'restore', readonly matterRef: string, readonly ground: 'completed' | 'stopped' | null }[]
  readonly rename: { readonly matterRef: string, readonly requested: string, readonly effective: string, readonly at: string } | null
  readonly batch: {
    readonly operation: 'archive' | 'restore'
    readonly rows: readonly { readonly matterRef: string, readonly outcome: 'ok' | 'refused', readonly code: string | null }[]
    readonly okCount: number
    readonly refusedCount: number
  } | null
}
export interface DesktopMatterGroups {
  readonly state: 'read' | 'unavailable'
  readonly code: string | null
  readonly groups: readonly { readonly groupId: string, readonly name: string, readonly memberCount: number, readonly createdAt: string, readonly updatedAt: string }[]
  readonly trail: readonly { readonly at: string, readonly action: string, readonly groupId: string, readonly name: string, readonly count: number }[]
  readonly rename: { readonly groupId: string, readonly requested: string, readonly effective: string, readonly at: string } | null
  readonly batch: {
    readonly operation: 'add' | 'remove'
    readonly groupId: string
    readonly rows: readonly { readonly itemId: string, readonly outcome: 'ok' | 'unchanged' | 'refused', readonly code: string | null }[]
    readonly okCount: number
    readonly unchangedCount: number
    readonly refusedCount: number
  } | null
}

const READ_DENIALS = new Set([
  'projection-read-unavailable',
  'projection-read-denied',
  'projection-read-stale',
])

const RUNTIME_MESSAGES = {
  ready: '运行时已连接；不代表任务执行已获授权。',
  recovering: '运行时正在恢复。',
  unavailable: '运行时不可用。',
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function generation(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

// T03 slot parsers: each validates the full contracts shape field by field and returns null for
// any deviation — the slot is then omitted from the read instead of failing the whole projection.
const WORKSPACE_REASONS = new Set([
  'not-read', 'bridge-host-not-ready', 'bridge-provider-unavailable', 'bridge-provider-failed',
  'bridge-result-not-plain-data', 'bridge-stream-overflow', 'bridge-stream-closed', 'bridge-answer-unrecognised',
])

function parseWorkspaceEntry(value: unknown): DesktopWorkspaceEntry | null {
  if (!isRecord(value)) return null
  const { workspaceId, path, title, sessionCount, createdAt, updatedAt } = value
  return typeof workspaceId === 'string' && workspaceId.length > 0 && typeof path === 'string'
    && typeof title === 'string' && typeof createdAt === 'string' && typeof updatedAt === 'string'
    && safeCount(sessionCount)
    ? { workspaceId, path, title, sessionCount, createdAt, updatedAt }
    : null
}

function parseWorkspaces(value: unknown): DesktopWorkspaceList | null {
  if (!isRecord(value) || value.source !== 'workspace-follow') return null
  const { state, reason, entries, order, archivedSessions, frames, unapplied } = value
  if (state !== 'read' && state !== 'unavailable') return null
  if (reason !== null && (typeof reason !== 'string' || !WORKSPACE_REASONS.has(reason))) return null
  if (!Array.isArray(entries) || !Array.isArray(order) || !order.every(id => typeof id === 'string')) return null
  if (!safeCount(archivedSessions) || !safeCount(frames) || !safeCount(unapplied)) return null
  const parsed: DesktopWorkspaceEntry[] = []
  for (const candidate of entries) {
    const parsedEntry = parseWorkspaceEntry(candidate)
    if (parsedEntry === null) return null
    parsed.push(parsedEntry)
  }
  return { state, reason, entries: parsed, order: order as readonly string[], archivedSessions, frames, unapplied }
}

const LINK_ACTIONS = new Set(['linked', 'unlinked', 'default-set', 'default-cleared'])

function parseMatterLink(value: unknown): DesktopMatterLink | null {
  if (!isRecord(value)) return null
  const { matterRef, workspaceRef, workspacePath, linkedAt, isDefault } = value
  return typeof matterRef === 'string' && typeof workspaceRef === 'string' && typeof workspacePath === 'string'
    && typeof linkedAt === 'string' && typeof isDefault === 'boolean'
    ? { matterRef, workspaceRef, workspacePath, linkedAt, isDefault }
    : null
}

function isTrailRecord(value: unknown): boolean {
  if (!isRecord(value)) return false
  const { linkId, at, action, matterRef, actorRef, workspaceRef } = value
  if (typeof linkId !== 'string' || typeof at !== 'string' || typeof matterRef !== 'string'
    || typeof actorRef !== 'string' || typeof action !== 'string' || !LINK_ACTIONS.has(action)) return false
  return workspaceRef === undefined || typeof workspaceRef === 'string'
}

function parseMatterLinks(value: unknown): DesktopMatterLinks | null {
  if (!isRecord(value)) return null
  const { state, links, trail } = value
  if ((state !== 'read' && state !== 'unavailable') || !Array.isArray(links) || !Array.isArray(trail)) return null
  const parsed: DesktopMatterLink[] = []
  for (const candidate of links) {
    const parsedLink = parseMatterLink(candidate)
    if (parsedLink === null) return null
    parsed.push(parsedLink)
  }
  if (!trail.every(isTrailRecord)) return null
  return { state, links: parsed }
}

function parseActiveContext(value: unknown): DesktopActiveContext | null {
  if (!isRecord(value)) return null
  const { state, contextGeneration, matterId, revisionId, workspaceRef, frameGeneration } = value
  if (state === 'unavailable') return contextGeneration === null ? { state, contextGeneration: null } : null
  if (!generation(contextGeneration)) return null
  if (state === 'inactive') return { state, contextGeneration }
  if (state !== 'active' || typeof matterId !== 'string' || matterId.length === 0
    || typeof revisionId !== 'string' || revisionId.length === 0
    || typeof workspaceRef !== 'string' || workspaceRef.length === 0 || !generation(frameGeneration)) return null
  return { state, contextGeneration, matterId, revisionId, workspaceRef, frameGeneration }
}

export function classifyDesktopState(input: unknown): DesktopRead {
  if (!isRecord(input)) return { kind: 'unavailable' }
  if (typeof input.code === 'string' && READ_DENIALS.has(input.code)
    && typeof input.stage === 'string' && input.stage.length > 0
    && typeof input.retryable === 'boolean'
    && typeof input.correlation === 'string' && input.correlation.length > 0) {
    return { kind: 'blocked', code: input.code }
  }
  const { service, runtime, matter } = input
  if (!isRecord(service) || service.status !== 'unavailable'
    || (service.reason !== 'identity-unavailable' && service.reason !== 'authenticated')
    || typeof service.correlation !== 'string' || service.correlation.length === 0
    || (matter !== null && (!isRecord(matter) || matter.projectionSource !== 'live'))
    || !isRecord(runtime) || typeof runtime.message !== 'string' || typeof runtime.retryable !== 'boolean'
    || (runtime.status !== 'ready' && runtime.status !== 'unavailable' && runtime.status !== 'recovering')) {
    return { kind: 'unavailable' }
  }
  const session = parseDesktopSession(input)
  const workspaces = parseWorkspaces(input.workspaces)
  const matterLinks = parseMatterLinks(input.matterLinks)
  const activeContext = parseActiveContext(input.activeContext)
  const artifacts = parseArtifacts(input.artifacts)
  const monitor = parseMonitor(input.runMonitor)
  const settingsLeaves = parseSettingsLeaves(input.settingsLeaves)
  const matterList = parseMatterList(input.matterList)
  const matterAdmin = parseMatterAdmin(input.matterAdmin)
  const matterGroups = parseMatterGroups(input.matterGroups)
  const readout = isRecord(input.readout) ? input.readout : null
  const readoutKnowledge = parseReadoutKnowledge(readout === null ? null : readout.knowledge)
  return {
    kind: 'read',
    runtime: { status: runtime.status, message: RUNTIME_MESSAGES[runtime.status], retryable: runtime.retryable },
    ...(session === null ? {} : { session }),
    ...(workspaces === null ? {} : { workspaces }),
    ...(matterLinks === null ? {} : { matterLinks }),
    ...(activeContext === null ? {} : { activeContext }),
    ...(artifacts === null ? {} : { artifacts }),
    ...(monitor === null ? {} : { monitor }),
    ...(readoutKnowledge === null ? {} : { readoutKnowledge }),
    ...(settingsLeaves === null ? {} : { settingsLeaves }),
    ...(matterList === null ? {} : { matterList }),
    ...(matterAdmin === null ? {} : { matterAdmin }),
    ...(matterGroups === null ? {} : { matterGroups }),
  }
}

/** ADR-0312: closed-world parse; a malformed list or row omits the whole slot (the page then
 *  shows no leaf region instead of half-read rows). */
function parseSettingsLeaves(input: unknown): readonly DesktopSettingsLeaf[] | null {
  if (!Array.isArray(input)) return null
  const leaves: DesktopSettingsLeaf[] = []
  for (const leaf of input) {
    if (!isRecord(leaf)
      || typeof leaf.leafId !== 'string' || leaf.leafId === ''
      || typeof leaf.title !== 'string' || leaf.title === ''
      || (leaf.state !== 'read' && leaf.state !== 'unavailable')
      || typeof leaf.source !== 'string' || leaf.source === ''
      || typeof leaf.note !== 'string') return null
    leaves.push({ leafId: leaf.leafId, title: leaf.title, state: leaf.state, source: leaf.source, note: leaf.note })
  }
  return leaves
}

/** ADR-0304: tolerant parse — the steps axis is validated; each remaining axis degrades to an
 *  honest unknown row with its named fallback reason. A fully malformed monitor is omitted. */
function parseMonitor(input: unknown): DesktopRunMonitor | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  const stepsInput = isRecord(input.steps) ? input.steps : {}
  const stepState: 'running' | 'idle' | 'unavailable' = stepsInput.state === 'running' || stepsInput.state === 'idle' || stepsInput.state === 'unavailable'
    ? stepsInput.state : 'unavailable'
  const steps = {
    state: stepState,
    lastTurnEnd: stepsInput.lastTurnEnd === null || stepsInput.lastTurnEnd === undefined
      ? null : typeof stepsInput.lastTurnEnd === 'string' ? stepsInput.lastTurnEnd : null,
    observedRecords: typeof stepsInput.observedRecords === 'number' && Number.isSafeInteger(stepsInput.observedRecords) && stepsInput.observedRecords >= 0
      ? stepsInput.observedRecords : 0,
    reason: typeof stepsInput.reason === 'string' ? stepsInput.reason : null,
  }
  const axisOf = (value: unknown, fallbackReason: string): { state: string, reason: string } =>
    isRecord(value) && typeof value.state === 'string' && value.state !== '' && typeof value.reason === 'string'
      ? { state: value.state, reason: value.reason }
      : { state: 'unknown', reason: fallbackReason }
  return {
    state: input.state,
    steps,
    axes: [
      { name: '预算／用量', ...axisOf(input.budget, 'usage-provider-unavailable') },
      { name: '设备', ...axisOf(input.device, 'device-binding-unavailable') },
      { name: '后台', ...axisOf(input.background, 'background-host-unavailable') },
      { name: '上下文', ...axisOf(input.context, 'context-usage-unavailable') },
    ],
  }
}

/** ADR-0300: closed-world parse; a malformed slot is omitted (never displayed half-read). */
function parseArtifacts(input: unknown): DesktopArtifacts | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  if (!Array.isArray(input.cards)) return null
  const cards: DesktopArtifactCard[] = []
  for (const card of input.cards) {
    if (!isRecord(card)
      || typeof card.artifactId !== 'string' || card.artifactId === ''
      || typeof card.name !== 'string' || card.name === ''
      || typeof card.kind !== 'string' || card.kind === ''
      || (card.bytes !== null && (typeof card.bytes !== 'number' || !Number.isSafeInteger(card.bytes) || card.bytes < 0))
      || (card.state !== 'ready' && card.state !== 'absent' && card.state !== 'unconfirmed')) return null
    cards.push({ artifactId: card.artifactId, name: card.name, kind: card.kind, bytes: card.bytes, state: card.state })
  }
  const preview = input.preview
  if (!isRecord(preview) || typeof preview.state !== 'string') return null
  let parsedPreview: DesktopArtifactPreview
  if (preview.state === 'closed') {
    parsedPreview = { state: 'closed' }
  } else if (preview.state === 'opening'
    && typeof preview.artifactId === 'string' && preview.artifactId !== ''
    && typeof preview.name === 'string' && preview.name !== '') {
    parsedPreview = { state: 'opening', artifactId: preview.artifactId, name: preview.name }
  } else if (preview.state === 'ready'
    && typeof preview.artifactId === 'string' && preview.artifactId !== ''
    && typeof preview.name === 'string' && preview.name !== ''
    && typeof preview.expanded === 'boolean' && typeof preview.window === 'boolean') {
    parsedPreview = { state: 'ready', artifactId: preview.artifactId, name: preview.name, expanded: preview.expanded, window: preview.window }
  } else if (preview.state === 'failed'
    && typeof preview.artifactId === 'string' && preview.artifactId !== ''
    && typeof preview.name === 'string' && preview.name !== ''
    && typeof preview.code === 'string' && preview.code !== ''
    && typeof preview.retryable === 'boolean') {
    parsedPreview = { state: 'failed', artifactId: preview.artifactId, name: preview.name, code: preview.code, retryable: preview.retryable }
  } else {
    return null
  }
  return { state: input.state, cards, preview: parsedPreview }
}

/** ADR-0316 (R16): closed-world parsers — each validates the contract shape field by field and
 *  a malformed slot is omitted, never displayed half-read (the parseSettingsLeaves discipline). */
function parseMatterList(input: unknown): DesktopMatterList | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  if (input.code !== null && typeof input.code !== 'string') return null
  if (!Array.isArray(input.items)) return null
  const counts = input.counts
  if (!isRecord(counts) || !safeCount(counts.action) || !safeCount(counts.inProgress) || !safeCount(counts.acceptance)) return null
  const items: DesktopMatterListItem[] = []
  for (const item of input.items) {
    if (!isRecord(item) || typeof item.itemId !== 'string' || item.itemId === ''
      || (item.matterRef !== null && typeof item.matterRef !== 'string')
      || typeof item.title !== 'string'
      || (item.partition !== 'action' && item.partition !== 'in-progress' && item.partition !== 'acceptance')
      || !Array.isArray(item.triggers) || !safeCount(item.acceptanceCandidateCount)
      || (item.lifecycle !== 'active' && item.lifecycle !== 'archived')
      || typeof item.updatedAt !== 'string') return null
    const triggers: DesktopMatterTrigger[] = []
    for (const trigger of item.triggers) {
      if (!isRecord(trigger)
        || (trigger.kind !== 'attempt-unknown' && trigger.kind !== 'attempt-failed' && trigger.kind !== 'pending-inputs')
        || typeof trigger.ref !== 'string' || trigger.ref === ''
        || (trigger.count !== undefined && trigger.count !== null && (typeof trigger.count !== 'number' || !Number.isSafeInteger(trigger.count)))) return null
      triggers.push({ kind: trigger.kind, ref: trigger.ref, count: typeof trigger.count === 'number' ? trigger.count : null })
    }
    items.push({
      itemId: item.itemId, matterRef: item.matterRef, title: item.title, partition: item.partition,
      triggers, acceptanceCandidateCount: item.acceptanceCandidateCount, lifecycle: item.lifecycle, updatedAt: item.updatedAt,
    })
  }
  return {
    state: input.state, code: typeof input.code === 'string' ? input.code : null, items,
    counts: { action: counts.action, inProgress: counts.inProgress, acceptance: counts.acceptance },
  }
}

function parseMatterAdmin(input: unknown): DesktopMatterAdmin | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  if (!Array.isArray(input.entries) || !Array.isArray(input.trail)) return null
  const entries: DesktopMatterAdmin['entries'][number][] = []
  for (const entry of input.entries) {
    if (!isRecord(entry) || typeof entry.matterRef !== 'string' || entry.matterRef === ''
      || typeof entry.archivedAt !== 'string'
      || (entry.ground !== 'completed' && entry.ground !== 'stopped')) return null
    entries.push({ matterRef: entry.matterRef, archivedAt: entry.archivedAt, ground: entry.ground })
  }
  const trail: DesktopMatterAdmin['trail'][number][] = []
  for (const record of input.trail) {
    if (!isRecord(record) || typeof record.at !== 'string'
      || (record.action !== 'archive' && record.action !== 'restore')
      || typeof record.matterRef !== 'string'
      || (record.ground !== null && record.ground !== 'completed' && record.ground !== 'stopped')) return null
    trail.push({ at: record.at, action: record.action, matterRef: record.matterRef, ground: record.ground })
  }
  let rename: DesktopMatterAdmin['rename'] = null
  if (input.rename !== null && input.rename !== undefined) {
    const candidate = input.rename
    if (!isRecord(candidate) || typeof candidate.matterRef !== 'string' || typeof candidate.requested !== 'string'
      || typeof candidate.effective !== 'string' || typeof candidate.at !== 'string') return null
    rename = { matterRef: candidate.matterRef, requested: candidate.requested, effective: candidate.effective, at: candidate.at }
  }
  let batch: DesktopMatterAdmin['batch'] = null
  if (input.batch !== null && input.batch !== undefined) {
    const candidate = input.batch
    if (!isRecord(candidate) || (candidate.operation !== 'archive' && candidate.operation !== 'restore')
      || !Array.isArray(candidate.rows) || !safeCount(candidate.okCount) || !safeCount(candidate.refusedCount)) return null
    const rows: { matterRef: string, outcome: 'ok' | 'refused', code: string | null }[] = []
    for (const row of candidate.rows) {
      if (!isRecord(row) || typeof row.matterRef !== 'string'
        || (row.outcome !== 'ok' && row.outcome !== 'refused')
        || (row.code !== null && typeof row.code !== 'string')) return null
      rows.push({ matterRef: row.matterRef, outcome: row.outcome, code: row.code })
    }
    batch = { operation: candidate.operation, rows, okCount: candidate.okCount, refusedCount: candidate.refusedCount }
  }
  return { state: input.state, entries, trail, rename, batch }
}

const GROUP_TRAIL_ACTIONS = new Set(['create', 'rename', 'remove', 'add-members', 'remove-members'])
const GROUP_MEMBER_CODES = new Set(['already-member', 'not-member', 'item-unknown'])

function parseMatterGroups(input: unknown): DesktopMatterGroups | null {
  if (!isRecord(input) || (input.state !== 'read' && input.state !== 'unavailable')) return null
  if (input.code !== null && typeof input.code !== 'string') return null
  if (!Array.isArray(input.groups) || !Array.isArray(input.trail)) return null
  const groups: DesktopMatterGroups['groups'][number][] = []
  for (const group of input.groups) {
    if (!isRecord(group) || typeof group.groupId !== 'string' || group.groupId === ''
      || typeof group.name !== 'string' || !Array.isArray(group.memberIds)
      || !group.memberIds.every((id) => typeof id === 'string')
      || typeof group.createdAt !== 'string' || typeof group.updatedAt !== 'string') return null
    groups.push({ groupId: group.groupId, name: group.name, memberCount: group.memberIds.length, createdAt: group.createdAt, updatedAt: group.updatedAt })
  }
  const trail: DesktopMatterGroups['trail'][number][] = []
  for (const record of input.trail) {
    if (!isRecord(record) || typeof record.at !== 'string'
      || typeof record.action !== 'string' || !GROUP_TRAIL_ACTIONS.has(record.action)
      || typeof record.groupId !== 'string' || typeof record.name !== 'string'
      || !safeCount(record.count)) return null
    trail.push({ at: record.at, action: record.action, groupId: record.groupId, name: record.name, count: record.count })
  }
  let rename: DesktopMatterGroups['rename'] = null
  if (input.rename !== null && input.rename !== undefined) {
    const candidate = input.rename
    if (!isRecord(candidate) || typeof candidate.groupId !== 'string' || typeof candidate.requested !== 'string'
      || typeof candidate.effective !== 'string' || typeof candidate.at !== 'string') return null
    rename = { groupId: candidate.groupId, requested: candidate.requested, effective: candidate.effective, at: candidate.at }
  }
  let batch: DesktopMatterGroups['batch'] = null
  if (input.batch !== null && input.batch !== undefined) {
    const candidate = input.batch
    if (!isRecord(candidate) || (candidate.operation !== 'add' && candidate.operation !== 'remove')
      || typeof candidate.groupId !== 'string' || !Array.isArray(candidate.rows)
      || !safeCount(candidate.okCount) || !safeCount(candidate.unchangedCount) || !safeCount(candidate.refusedCount)) return null
    const rows: { itemId: string, outcome: 'ok' | 'unchanged' | 'refused', code: string | null }[] = []
    for (const row of candidate.rows) {
      if (!isRecord(row) || typeof row.itemId !== 'string'
        || (row.outcome !== 'ok' && row.outcome !== 'unchanged' && row.outcome !== 'refused')
        || (row.code !== null && (typeof row.code !== 'string' || !GROUP_MEMBER_CODES.has(row.code)))) return null
      rows.push({ itemId: row.itemId, outcome: row.outcome, code: row.code })
    }
    batch = {
      operation: candidate.operation, groupId: candidate.groupId, rows,
      okCount: candidate.okCount, unchangedCount: candidate.unchangedCount, refusedCount: candidate.refusedCount,
    }
  }
  return { state: input.state, code: typeof input.code === 'string' ? input.code : null, groups, trail, rename, batch }
}

export async function readDesktopState(): Promise<DesktopRead> {
  try {
    const response = await fetch(SAGE_STATE_PATH, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { kind: 'unavailable' }
    return classifyDesktopState(await response.json())
  } catch {
    return { kind: 'unavailable' }
  }
}

/** T02 local-system bootstrap: the device facts the account entry may show. The parser is
 *  closed at every level — an unrecognized key or value fails to unavailable instead of being
 *  displayed unclassified. */
export type DesktopBootstrapRead =
  | {
      readonly kind: 'read'
      readonly state: {
        readonly runtime: 'ready' | 'unavailable' | 'recovering'
        readonly auth: 'signed-in' | 'signed-out' | 'pending'
        readonly theme: 'light' | 'dark' | 'system'
        readonly density: 'comfortable' | 'compact'
      }
    }
  | { readonly kind: 'unavailable'; readonly code: string | null }

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort()
  return keys.length === expected.length && keys.every((key, index) => key === expected[index])
}

export function classifyBootstrapState(input: unknown): DesktopBootstrapRead {
  if (!isRecord(input)) return { kind: 'unavailable', code: null }
  if (typeof input.code === 'string') return { kind: 'unavailable', code: input.code }
  if (!exactKeys(input, ['auth', 'display', 'runtime'])) return { kind: 'unavailable', code: null }
  const { runtime, auth, display } = input
  if (!isRecord(runtime) || !exactKeys(runtime, ['status'])) return { kind: 'unavailable', code: null }
  if (!isRecord(auth) || !exactKeys(auth, ['status'])) return { kind: 'unavailable', code: null }
  if (!isRecord(display) || !exactKeys(display, ['density', 'theme'])) return { kind: 'unavailable', code: null }
  if (runtime.status !== 'ready' && runtime.status !== 'unavailable' && runtime.status !== 'recovering') return { kind: 'unavailable', code: null }
  if (auth.status !== 'signed-in' && auth.status !== 'signed-out' && auth.status !== 'pending') return { kind: 'unavailable', code: null }
  if (display.theme !== 'light' && display.theme !== 'dark' && display.theme !== 'system') return { kind: 'unavailable', code: null }
  if (display.density !== 'comfortable' && display.density !== 'compact') return { kind: 'unavailable', code: null }
  return {
    kind: 'read',
    state: { runtime: runtime.status, auth: auth.status, theme: display.theme, density: display.density },
  }
}

export async function readDesktopBootstrapState(): Promise<DesktopBootstrapRead> {
  try {
    const response = await fetch(SAGE_BOOTSTRAP_PATH, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(SAGE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return { kind: 'unavailable', code: null }
    return classifyBootstrapState(await response.json())
  } catch {
    return { kind: 'unavailable', code: null }
  }
}
