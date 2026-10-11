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
