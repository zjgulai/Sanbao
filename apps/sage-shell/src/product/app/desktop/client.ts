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
  return {
    kind: 'read',
    runtime: { status: runtime.status, message: RUNTIME_MESSAGES[runtime.status], retryable: runtime.retryable },
    ...(session === null ? {} : { session }),
    ...(workspaces === null ? {} : { workspaces }),
    ...(matterLinks === null ? {} : { matterLinks }),
    ...(activeContext === null ? {} : { activeContext }),
  }
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
