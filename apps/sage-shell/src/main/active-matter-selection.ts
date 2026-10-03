/**
 * Explicit user-selection orchestration for the main-owned active matter context.
 *
 * The candidate is deliberately non-authoritative: it contains only the selected matter id and
 * the context generation the user saw. Every fact that can authorize a projection or name an
 * execution environment is re-read from a narrow Electron-main port, in order, before one final
 * compare-and-swap. GET, send, link, draft recency and Host observations do not call this kernel.
 */
import { isAbsolute } from 'node:path'

import {
  projectActiveMatterContext,
  type ActiveMatterContext,
  type ActiveMatterContextInput,
  type ActiveMatterContextProjection,
} from './active-matter-context.js'

type MaybePromise<T> = T | Promise<T>

export interface ActiveIdentitySessionFact {
  readonly sessionRef: string
}

export type MatterReadAuthorizationFact =
  | { readonly state: 'allowed', readonly actorScopeRef: string }
  | { readonly state: 'denied' }

export interface CurrentMatterRevisionFact {
  readonly matterId: string
  readonly revisionId: string
}

export interface DefaultMatterWorkspaceFact {
  readonly matterId: string
  readonly workspaceRef: string
}

export interface FreshWorkspaceFoldFact {
  readonly state: 'read'
  readonly entries: readonly {
    readonly workspaceId: string
    readonly path: string
  }[]
}

export interface ReadyFrameFact {
  readonly generation: number
  readonly ready: boolean
  readonly contaminated: boolean
}

/**
 * Ports may be sync or async. Their implementations own I/O, freshness and time bounds; this
 * module only validates the returned narrow facts and never reaches around a port.
 */
export interface ActiveMatterSelectionPorts {
  readonly readActiveIdentitySession: () => MaybePromise<ActiveIdentitySessionFact | null | undefined>
  readonly authorizeMatterRead: (request: {
    readonly sessionRef: string
    readonly matterId: string
  }) => MaybePromise<MatterReadAuthorizationFact | null | undefined>
  readonly resolveCurrentRevision: (request: {
    readonly matterId: string
  }) => MaybePromise<CurrentMatterRevisionFact | null | undefined>
  readonly resolveDefaultWorkspace: (request: {
    readonly matterId: string
  }) => MaybePromise<DefaultMatterWorkspaceFact | null | undefined>
  readonly readFreshWorkspaceFold: () => MaybePromise<FreshWorkspaceFoldFact | null | undefined>
  readonly snapshotFramePolicy: () => MaybePromise<ReadyFrameFact | null | undefined>
}

export type ActiveMatterSelectionRefusalCode =
  | 'invalid-selection'
  | 'stale-context-generation'
  | 'identity-session-unavailable'
  | 'read-access-unavailable'
  | 'read-access-denied'
  | 'current-revision-unavailable'
  | 'current-revision-mismatch'
  | 'default-workspace-unavailable'
  | 'default-workspace-mismatch'
  | 'workspace-fold-unavailable'
  | 'workspace-fold-ambiguous'
  | 'workspace-not-found'
  | 'workspace-path-invalid'
  | 'frame-unavailable'
  | 'frame-not-ready'
  | 'frame-contaminated'
  | 'context-selection-unavailable'

export type ActiveMatterSelectionResult =
  | { readonly ok: true, readonly projection: ActiveMatterContextProjection }
  | { readonly ok: false, readonly code: ActiveMatterSelectionRefusalCode }

export interface ActiveMatterSelectionRequest {
  /** Untrusted boundary value; exact parsing prevents self-reported session/root/authority facts. */
  readonly candidate: unknown
  readonly context: ActiveMatterContext
  readonly ports: ActiveMatterSelectionPorts
}

interface SelectionCandidate {
  readonly matterId: string
  readonly expectedContextGeneration: number
}

interface PlainRecord {
  readonly keys: readonly string[]
  readonly values: Readonly<Record<string, unknown>>
}

function plainRecord(value: unknown): PlainRecord | undefined {
  try {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const ownKeys = Reflect.ownKeys(value)
    if (ownKeys.some((key) => typeof key !== 'string')) return undefined
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const values: Record<string, unknown> = Object.create(null)
    for (const key of ownKeys as string[]) {
      const descriptor = descriptors[key]
      if (descriptor === undefined || !('value' in descriptor)) return undefined
      values[key] = descriptor.value
    }
    return { keys: ownKeys as string[], values }
  } catch {
    return undefined
  }
}

function nonBlank(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function generation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

function parseCandidate(value: unknown): SelectionCandidate | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  if (record.keys.length !== 2 || !record.keys.includes('matterId') || !record.keys.includes('expectedContextGeneration')) return undefined
  const matterId = nonBlank(record.values.matterId)
  const expectedContextGeneration = generation(record.values.expectedContextGeneration)
  return matterId === undefined || expectedContextGeneration === undefined
    ? undefined
    : { matterId, expectedContextGeneration }
}

function parseIdentitySession(value: unknown): ActiveIdentitySessionFact | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  const sessionRef = nonBlank(record.values.sessionRef)
  return sessionRef === undefined ? undefined : { sessionRef }
}

function parseAuthorization(value: unknown): MatterReadAuthorizationFact | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  if (record.values.state === 'denied') return { state: 'denied' }
  if (record.values.state !== 'allowed') return undefined
  const actorScopeRef = nonBlank(record.values.actorScopeRef)
  return actorScopeRef === undefined ? undefined : { state: 'allowed', actorScopeRef }
}

function parseCurrentRevision(value: unknown): CurrentMatterRevisionFact | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  const matterId = nonBlank(record.values.matterId)
  const revisionId = nonBlank(record.values.revisionId)
  return matterId === undefined || revisionId === undefined ? undefined : { matterId, revisionId }
}

function parseDefaultWorkspace(value: unknown): DefaultMatterWorkspaceFact | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  const matterId = nonBlank(record.values.matterId)
  const workspaceRef = nonBlank(record.values.workspaceRef)
  return matterId === undefined || workspaceRef === undefined ? undefined : { matterId, workspaceRef }
}

function parseWorkspaceFold(value: unknown): FreshWorkspaceFoldFact | undefined {
  const record = plainRecord(value)
  if (record === undefined || record.values.state !== 'read' || !Array.isArray(record.values.entries)) return undefined
  const entries: Array<{ readonly workspaceId: string, readonly path: string }> = []
  for (const raw of record.values.entries) {
    const entry = plainRecord(raw)
    if (entry === undefined) return undefined
    const workspaceId = nonBlank(entry.values.workspaceId)
    const path = nonBlank(entry.values.path)
    if (workspaceId === undefined || path === undefined) return undefined
    entries.push({ workspaceId, path })
  }
  return { state: 'read', entries }
}

function parseFrame(value: unknown): ReadyFrameFact | undefined {
  const record = plainRecord(value)
  if (record === undefined) return undefined
  const frameGeneration = generation(record.values.generation)
  if (frameGeneration === undefined || typeof record.values.ready !== 'boolean' || typeof record.values.contaminated !== 'boolean') return undefined
  return { generation: frameGeneration, ready: record.values.ready, contaminated: record.values.contaminated }
}

function parseSafely<T>(parser: (value: unknown) => T | undefined, value: unknown): T | undefined {
  try {
    return parser(value)
  } catch {
    return undefined
  }
}

async function readPort<T>(read: () => MaybePromise<T>): Promise<{ readonly ok: true, readonly value: T } | { readonly ok: false }> {
  try {
    return { ok: true, value: await read() }
  } catch {
    return { ok: false }
  }
}

const refused = (code: ActiveMatterSelectionRefusalCode): ActiveMatterSelectionResult => Object.freeze({ ok: false, code })

export async function selectActiveMatter(request: ActiveMatterSelectionRequest): Promise<ActiveMatterSelectionResult> {
  const candidate = parseSafely(parseCandidate, request.candidate)
  if (candidate === undefined) return refused('invalid-selection')
  // Early rejection avoids querying identity/policy for an already obsolete UI observation. The
  // final context.select is still the authoritative CAS and catches races during awaited ports.
  if (candidate.expectedContextGeneration !== request.context.contextGeneration()) return refused('stale-context-generation')

  const sessionRead = await readPort(() => request.ports.readActiveIdentitySession())
  const session = sessionRead.ok ? parseSafely(parseIdentitySession, sessionRead.value) : undefined
  if (session === undefined) return refused('identity-session-unavailable')

  const authorizationRead = await readPort(() => request.ports.authorizeMatterRead({
    sessionRef: session.sessionRef,
    matterId: candidate.matterId,
  }))
  const authorization = authorizationRead.ok ? parseSafely(parseAuthorization, authorizationRead.value) : undefined
  if (authorization === undefined) return refused('read-access-unavailable')
  if (authorization.state === 'denied') return refused('read-access-denied')

  const revisionRead = await readPort(() => request.ports.resolveCurrentRevision({ matterId: candidate.matterId }))
  const revision = revisionRead.ok ? parseSafely(parseCurrentRevision, revisionRead.value) : undefined
  if (revision === undefined) return refused('current-revision-unavailable')
  if (revision.matterId !== candidate.matterId) return refused('current-revision-mismatch')

  const defaultRead = await readPort(() => request.ports.resolveDefaultWorkspace({ matterId: candidate.matterId }))
  const defaultWorkspace = defaultRead.ok ? parseSafely(parseDefaultWorkspace, defaultRead.value) : undefined
  if (defaultWorkspace === undefined) return refused('default-workspace-unavailable')
  if (defaultWorkspace.matterId !== candidate.matterId) return refused('default-workspace-mismatch')

  const foldRead = await readPort(() => request.ports.readFreshWorkspaceFold())
  const fold = foldRead.ok ? parseSafely(parseWorkspaceFold, foldRead.value) : undefined
  if (fold === undefined) return refused('workspace-fold-unavailable')
  const seen = new Set<string>()
  for (const entry of fold.entries) {
    if (seen.has(entry.workspaceId)) return refused('workspace-fold-ambiguous')
    seen.add(entry.workspaceId)
    if (!isAbsolute(entry.path)) return refused('workspace-path-invalid')
  }
  const workspace = fold.entries.find((entry) => entry.workspaceId === defaultWorkspace.workspaceRef)
  if (workspace === undefined) return refused('workspace-not-found')

  const frameRead = await readPort(() => request.ports.snapshotFramePolicy())
  const frame = frameRead.ok ? parseSafely(parseFrame, frameRead.value) : undefined
  if (frame === undefined) return refused('frame-unavailable')
  if (frame.contaminated) return refused('frame-contaminated')
  if (!frame.ready) return refused('frame-not-ready')

  const next: ActiveMatterContextInput = {
    actorScopeRef: authorization.actorScopeRef,
    matterId: candidate.matterId,
    revisionId: revision.revisionId,
    workspaceRef: defaultWorkspace.workspaceRef,
    trustedWorkspaceRoot: workspace.path,
    sessionRef: session.sessionRef,
    frameGeneration: frame.generation,
  }
  const selected = request.context.select({
    expectedContextGeneration: candidate.expectedContextGeneration,
    next,
  })
  if (!selected.ok) {
    return refused(selected.code === 'stale-context-generation'
      ? 'stale-context-generation'
      : 'context-selection-unavailable')
  }
  if (selected.snapshot === null) return refused('context-selection-unavailable')
  return Object.freeze({ ok: true, projection: projectActiveMatterContext(selected.snapshot) })
}
