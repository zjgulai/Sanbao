/** Host-side executor for the main-originated controlled-method bridge (tickets 050, 010, 012).
 *
 * Endpoints and their kinds live in one frozen map in `protocol.ts`; this module is the single
 * place that turns one endpoint name plus its payload into an answer. Rules that hold for every
 * endpoint:
 *
 * - the endpoint must be in the map (both halves refuse independently);
 * - the payload must be exactly the array the endpoint declares — no extra arguments ride along;
 * - the provider is reached through `ctx.get` only in this file, and only after the checks above;
 * - the result crosses only if it is plain data, so nothing a JSON round trip would silently
 *   narrow can reach Electron main.
 *
 * ADR-0205: the service names and method shapes below are the base's own Remote owners
 * (`workspaceController`, `directoryPickerController`, `settingsController`), as declared by each
 * package's `declare module '@deepseek-ai/cordis'`. A name that only "sounds right" answers
 * `bridge-provider-unavailable` forever, so the names are copied from the declarations themselves.
 * Methods the base cancels by signal (`pick`, `follow`) receive a bridge-owned `AbortSignal`;
 * a generation is aborted in the same `finally` that ends the call, so no subscription outlives
 * its bridge call.
 *
 * Nothing here decides whether an action is allowed: that is the Application Service's job.
 */
import { types as utilTypes } from 'node:util'

import { BRIDGE_ENDPOINTS, BRIDGE_STREAM_QUIET_MS, MAX_ATTACHMENT_CHUNK_BYTES, MAX_BRIDGE_STREAM_FRAMES } from '../protocol.js'
import type { AttachmentUploads } from './attachment-uploads.js'
import type { UserQuestionsRelay } from './user-questions-relay.js'
import type { ApprovalRelay } from './approval-relay.js'

export { BRIDGE_ENDPOINTS }

/** Normalized outcome carried back to Electron over the Node IPC channel. */
export type BridgeOutcome
  = { readonly ok: true; readonly result: unknown }
  | { readonly ok: false; readonly code: string }

export interface BridgeContext {
  get(name: string): unknown
}

/** Provider shapes: the base's Remote owner services, named and shaped as their packages declare. */
interface SettingsDescribeProvider {
  describe(): unknown
}
interface WorkspaceControllerProvider {
  create(input: { readonly path: string }): unknown
  rename(input: { readonly workspaceId: string, readonly title: string }): unknown
  delete(input: { readonly workspaceId: string }): unknown
  insertBefore(input: { readonly workspaceId: string, readonly beforeWorkspaceId?: string }): unknown
}
interface WorkspaceControllerStreamProvider {
  follow(signal: AbortSignal): unknown
}
interface DirectoryPickerControllerProvider {
  pick(signal: AbortSignal): unknown
}
interface SessionHeaderLike {
  readonly id?: unknown
  readonly cwd?: unknown
}
interface SessionsProvider {
  list(): unknown
}
/** The base's workspace-file service: positional methods, scope first (ADR-0207). */
interface SessionControllerProvider {
  create(input: { readonly cwd: string }): unknown
  cancel(input: { readonly sessionId: string }, signal: AbortSignal): unknown
  updateQueue(input: { readonly sessionId: string, readonly itemId: string, readonly action: { readonly kind: 'remove' } | { readonly kind: 'edit', readonly content: readonly { readonly type: 'text', readonly text: string }[] } }): unknown
  prompt(input: {
    readonly requestId: string
    readonly sessionId: string
    readonly mode: 'queue' | 'steer'
    readonly content: readonly (
      | { readonly type: 'text', readonly text: string }
      | { readonly type: 'file', readonly receiptId: string }
    )[]
  }, signal: AbortSignal): unknown
  page(input: { readonly address: { readonly kind: 'session', readonly sessionId: string }, readonly throughSeq: number, readonly maxMessages?: number }, signal: AbortSignal): unknown
  /** Ticket 021: bounded full-text search over the live-preferred session corpus. */
  search(input: { readonly query: string }, signal: AbortSignal): unknown
  /** Ticket 024: fork one completed-turn prefix of a session into a child session. */
  fork(input: { readonly sessionId: string, readonly atSeq?: number }): unknown
}
interface SessionControllerStreamProvider {
  follow(input: { readonly address: { readonly kind: 'session', readonly sessionId: string }, readonly assistantStream?: true }, signal: AbortSignal): unknown
  control(signal: AbortSignal): unknown
}
/** Ticket 039: `ctx.planMode` (`dsh-plan-mode`), shaped as the package declares — read the
 *  cropped `{active, pending}` view and select the state; the base's own outcome
 *  (`committed | queued | cancelled | noop`) is the receipt, never a local reinterpretation. */
interface PlanModeProvider {
  get(agent: unknown): unknown
  set(agent: unknown, active: boolean): unknown
}
/** Ticket 039: `ctx.agents` — the live registry. Plan state is per live agent/session, so an
 *  id with no live agent is a named refusal; the bridge never invents a default mode. */
/** Ticket 043: `ctx.terminals` (`dsh-terminal`), shaped as the package declares — owner-scoped
 *  list and bounded scrollback reads; the write half (spawn/kill/signal/send) is deliberately
 *  never wired. */
interface TerminalsProvider {
  list(owner: unknown): unknown
  read(owner: unknown, id: unknown, request?: { readonly offset?: number, readonly count?: number }): unknown
}
interface AgentsProvider {
  get(sessionId: string): unknown
}
interface WorkspaceFilesProvider {
  list(scope: WorkspaceFileScopeLike, path: string, signal: AbortSignal): unknown
  stat(scope: WorkspaceFileScopeLike, path: string, signal: AbortSignal): unknown
  read(scope: WorkspaceFileScopeLike, path: string, range: unknown, signal: AbortSignal): unknown
  /** Ticket 015: raw byte windows and whole-file reads for the preview content port. */
  readBytes(scope: WorkspaceFileScopeLike, path: string, range: unknown, signal: AbortSignal): unknown
  readAll(scope: WorkspaceFileScopeLike, path: string, signal: AbortSignal): unknown
}
/** Ticket 015: the filesystem-observation feed (clues only — the OS is not watched). */
interface WorkspaceFilesChangesProvider {
  changes(scope: WorkspaceFileScopeLike, signal: AbortSignal): unknown
}
interface WorkspaceFileScopeLike {
  readonly sessionId: string
  readonly workspaceRoot: string
}
/** The base's file-upload service (`declare module '@deepseek-ai/cordis'`), streaming half only. */
interface FileUploadsProvider {
  uploadStream(request: {
    readonly sessionId: string
    readonly data: AsyncIterable<Uint8Array>
    readonly signal?: AbortSignal
    readonly name?: string
  }): unknown
}

/** Per-boot dependencies the plain-function endpoints cannot own: open upload sessions and their queue. */
export interface BridgeCallDeps {
  readonly uploads?: AttachmentUploads
}

/** One canonical base64 chunk: strict decoding only, so a lenient encode cannot smuggle bytes. */
const MAX_CHUNK_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_CHUNK_BYTES / 3) * 4
function decodeCanonicalBase64(value: unknown): Buffer | undefined {
  if (typeof value !== 'string' || value === '' || value.length > MAX_CHUNK_BASE64_LENGTH) return undefined
  const bytes = Buffer.from(value, 'base64')
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_CHUNK_BYTES) return undefined
  return bytes.toString('base64') === value ? bytes : undefined
}

/**
 * Own-property entries in the exact order JSON would carry them.
 * @returns string-keyed enumerable value entries, or undefined when anything would be dropped or reinterpreted.
 */
function plainEntries(value: object): readonly [string, unknown][] | undefined {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const entries: [string, unknown][] = []
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string') return undefined
    const descriptor = descriptors[key]
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) return undefined
    entries.push([key, descriptor.value])
  }
  return entries
}

/**
 * True only for values that cross the bridge unchanged.
 * JSON would silently drop functions, symbols, bigints, `undefined`, non-enumerable and symbol-keyed
 * members, sparse holes, and turn non-finite numbers into `null` — so those are refused instead of shipped.
 */
function isPlainData(value: unknown, parents: Set<object>): boolean {
  if (value === null) return true
  if (typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object' || parents.has(value) || utilTypes.isProxy(value)) return false
  parents.add(value)
  try {
    if (Array.isArray(value)) {
      // Subclassed arrays and extra index-less members would not survive as the array the consumer expects.
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      if (Object.keys(value).length !== value.length) return false
      return value.every((item) => isPlainData(item, parents))
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    const entries = plainEntries(value)
    if (entries === undefined) return false
    return entries.every(([, item]) => isPlainData(item, parents))
  } finally {
    parents.delete(value)
  }
}

function crossable(value: unknown): { readonly ok: true; readonly result: unknown } | { readonly ok: false; readonly code: string } {
  return isPlainData(value, new Set<object>())
    ? { ok: true, result: value }
    : { ok: false, code: 'bridge-result-not-plain-data' }
}

/** A path is adopted as-is: absolute, non-empty, no traversal noise. It is never created here. */
function isAdoptablePath(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && value.startsWith('/') && !value.includes('\u0000') && value.length <= 4096
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** One bounded display string from a catalog entry; blank becomes null, overlong is clipped. */
function boundedLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

/** One workspace identity as the base's request objects carry it. */
function isWorkspaceRef(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && !value.includes('\u0000') && value.length <= 256
}

/** One non-blank title; the base's own rename refuses blank ones, this refuses them one hop earlier. */
function isWorkspaceTitle(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value === value.trim()
    && !value.includes('\u0000') && value.length <= 200
}

/**
 * The base's own refusal vocabulary, mapped to Sage-owned codes (ADR-0205).
 * Only the code crosses: the base's message names the title or path it refused, and that text
 * belongs to the base's own surfaces, not to this bridge (US-122 wording stays the view's).
 */
function classifyProviderFailure(error: unknown): string {
  const remote = error !== null && typeof error === 'object'
    && (error as { isDSHRemoteError?: unknown }).isDSHRemoteError === true
    && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : undefined
  switch (remote) {
    case 'session/queue-item-not-found':
      return 'bridge-queue-item-not-found'
    case 'workspace/name-conflict':
      return 'bridge-workspace-name-conflict'
    case 'workspace/not-found':
      return 'bridge-workspace-unknown'
    case 'workspace/move-invalid':
      return 'bridge-workspace-reorder-invalid'
    case 'workspace/invalid-path':
      return 'bridge-workspace-path-rejected'
    // Ticket 013: the file service's own refusals keep their identity — the surface words them,
    // and `not-found` must never be shown as "the source file was deleted" (the base reports
    // "no entry at that path", which is a fact about this attempt, not about the file's history).
    case 'workspace-file/not-found':
      return 'bridge-file-not-found'
    case 'workspace-file/outside-workspace':
      return 'bridge-file-outside-workspace'
    case 'workspace-file/too-large':
      return 'bridge-file-too-large'
    case 'workspace-file/not-text':
      return 'bridge-file-not-text'
    case 'workspace-file/not-regular-file':
      return 'bridge-file-not-regular'
    case 'workspace-file/not-directory':
      return 'bridge-file-not-directory'
    // Ticket 005: the session channel's own refusals.
    case 'session/not-found':
      return 'bridge-session-unknown'
    case 'session/invalid-prompt':
      return 'bridge-session-prompt-refused'
    case 'session/busy':
      return 'bridge-session-busy'
    case 'session/queue-item-not-found':
      return 'bridge-session-queue-item-unknown'
    // Ticket 014: the base's own "this receipt is not a staged upload for this session" refusal —
    // it keeps its identity so the surface can say the attachment was not uploaded for this session
    // (US-083) instead of a generic failure.
    case 'session/attachment-invalid':
      return 'bridge-attachment-invalid'
    // Ticket 021: the search's own input refusal (empty / too long / NUL) keeps its identity.
    case 'gateway/bad-request':
      return 'bridge-search-query-rejected'
    // Ticket 024: no completed turn to fork from (or the anchor sits in an unfinished one).
    case 'session/fork-unavailable':
      return 'bridge-fork-unavailable'
    default:
      return 'bridge-provider-failed'
  }
}

/** One `{ workspaceId }` request object, read structurally: extra members are refused, not ignored. */
function readWorkspaceRequest(payload: readonly unknown[], keys: readonly string[]): Record<string, unknown> | undefined {
  if (payload.length !== 1) return undefined
  const input = payload[0]
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const present = Object.keys(record)
  if (present.length !== keys.length || !present.every((key) => keys.includes(key))) return undefined
  return record
}

/** One workspace-file request: the workspace root it is confined to, plus the path and range.
 *  An empty path names the workspace root itself, and only the listing accepts it. */
function readFileRequest(payload: readonly unknown[], keys: readonly string[], allowEmptyPath: boolean, rangeKeys: readonly string[] = ['offset', 'limit']): Record<string, unknown> | undefined {
  const record = readWorkspaceRequest(payload, keys)
  if (record === undefined) return undefined
  if (!isAdoptablePath(record.workspaceRoot)) return undefined
  if (typeof record.path !== 'string' || record.path.includes('\u0000') || record.path.length > 4096
    || (!allowEmptyPath && record.path === '')) {
    return undefined
  }
  if (keys.includes('range')) {
    const range = record.range
    if (range === null || typeof range !== 'object' || Array.isArray(range)) return undefined
    const present = Object.keys(range)
    if (!present.every((key) => rangeKeys.includes(key))) return undefined
    for (const value of Object.values(range)) {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
    }
  }
  return record
}

/**
 * Resolve the file scope for one workspace root from a **live session** (ADR-0207).
 * The base derives a scope's `workspaceRoot` from a session header's cwd, falling back to the
 * sandbox policy root (`workspaceFileScope` lookup). Sage mints no session id: with no live
 * session bound to the requested root there is no scope, and the caller gets a named refusal
 * instead of a fabricated identity.
 */
function resolveFileScope(ctx: BridgeContext, workspaceRoot: string): WorkspaceFileScopeLike | undefined {
  const sessions = ctx.get('sessions') as Partial<SessionsProvider> | undefined
  if (typeof sessions?.list !== 'function') return undefined
  let live: unknown
  try {
    live = sessions.list()
  } catch {
    return undefined
  }
  if (!Array.isArray(live)) return undefined
  for (const session of live) {
    const header = (session as { readonly header?: unknown } | null)?.header as SessionHeaderLike | undefined
    const id = header?.id
    const cwd = header?.cwd
    if (typeof id !== 'string' || id === '' || typeof cwd !== 'string' || cwd !== workspaceRoot) continue
    return { sessionId: id, workspaceRoot }
  }
  return undefined
}

/**
 * Execute one allowlisted bridge call against the booted context.
 * @param ctx - Host context that may or may not carry the requested provider.
 * @param endpoint - endpoint name from the frozen map, e.g. `settings/describe`.
 * @param payload - the endpoint's own arguments; validated here, never forwarded blindly.
 * @param deps - per-boot state the plain endpoints cannot own (ticket 014's open upload sessions).
 * @returns the normalized outcome; a refusal never touches a provider.
 */
export async function resolveBridgeCall(ctx: BridgeContext, endpoint: string, payload: readonly unknown[] = [], deps: BridgeCallDeps = {}): Promise<BridgeOutcome> {
  const kind = Object.hasOwn(BRIDGE_ENDPOINTS, endpoint) ? BRIDGE_ENDPOINTS[endpoint] : undefined
  if (kind === undefined) return { ok: false, code: 'bridge-endpoint-unsupported' }

  if (endpoint === 'settings/describe') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    const provider = ctx.get('settingsController') as Partial<SettingsDescribeProvider> | undefined
    if (typeof provider?.describe !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let value: unknown
    try {
      value = await provider.describe()
    } catch {
      return { ok: false, code: 'bridge-provider-failed' }
    }
    return crossable(value)
  }

  if (endpoint === 'directory/pick') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    const picker = ctx.get('directoryPickerController') as Partial<DirectoryPickerControllerProvider> | undefined
    if (typeof picker?.pick !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    // `pick` is a cancellation-parameter method: it wants a signal, and the picker may block on a
    // person. The signal lives exactly as long as this call; nothing is cancelled while it waits.
    const cancellation = new AbortController()
    let picked: unknown
    try {
      picked = await picker.pick(cancellation.signal)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
    // `null` is the picker's own "the user cancelled" answer — a fact, not a failure.
    if (picked === null || picked === undefined) return { ok: true, result: { path: null } }
    if (!isAdoptablePath(picked)) return { ok: false, code: 'bridge-result-not-plain-data' }
    return { ok: true, result: { path: picked } }
  }

  if (endpoint === 'workspace/create') {
    const input = payload.length === 1 ? payload[0] : undefined
    if (payload.length !== 1 || input === null || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    const path = (input as { readonly path?: unknown }).path
    if (!isAdoptablePath(path)) return { ok: false, code: 'bridge-path-invalid' }
    const controller = ctx.get('workspaceController') as Partial<WorkspaceControllerProvider> | undefined
    if (typeof controller?.create !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let created: unknown
    try {
      created = await controller.create({ path })
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
    return crossable(created)
  }

  if (endpoint === 'workspace/rename') {
    const record = readWorkspaceRequest(payload, ['workspaceId', 'title'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.workspaceId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (!isWorkspaceTitle(record.title)) return { ok: false, code: 'bridge-workspace-title-invalid' }
    const controller = ctx.get('workspaceController') as Partial<WorkspaceControllerProvider> | undefined
    if (typeof controller?.rename !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let renamed: unknown
    try {
      renamed = await controller.rename({ workspaceId: record.workspaceId, title: record.title })
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
    return crossable(renamed)
  }

  if (endpoint === 'workspace/delete') {
    const record = readWorkspaceRequest(payload, ['workspaceId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.workspaceId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const controller = ctx.get('workspaceController') as Partial<WorkspaceControllerProvider> | undefined
    // The base's delete removes the registration and keeps the directory and every session log;
    // this bridge adds nothing to that call — no filesystem reach exists on this side at all.
    if (typeof controller?.delete !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let removed: unknown
    try {
      removed = await controller.delete({ workspaceId: record.workspaceId })
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
    return crossable(removed)
  }

  if (endpoint === 'workspace/insert-before') {
    const record = readWorkspaceRequest(payload, Object.hasOwn(payload[0] ?? {}, 'beforeWorkspaceId')
      ? ['workspaceId', 'beforeWorkspaceId']
      : ['workspaceId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.workspaceId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const before = record.beforeWorkspaceId
    if (before !== undefined && (!isWorkspaceRef(before) || before === record.workspaceId)) {
      return { ok: false, code: 'bridge-workspace-ref-invalid' }
    }
    const controller = ctx.get('workspaceController') as Partial<WorkspaceControllerProvider> | undefined
    if (typeof controller?.insertBefore !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let ordered: unknown
    try {
      ordered = before === undefined
        ? await controller.insertBefore({ workspaceId: record.workspaceId })
        : await controller.insertBefore({ workspaceId: record.workspaceId, beforeWorkspaceId: before })
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
    return crossable(ordered)
  }

  if (endpoint === 'session/create') {
    const record = readWorkspaceRequest(payload, ['cwd'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isAdoptablePath(record.cwd)) return { ok: false, code: 'bridge-path-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.create !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let created: unknown
    try {
      created = await sessions.create({ cwd: record.cwd as string })
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
    return crossable(created)
  }

  if (endpoint === 'session/prompt') {
    const receiptKeys = Object.hasOwn(payload[0] ?? {}, 'receipts')
      ? ['requestId', 'sessionId', 'mode', 'text', 'receipts']
      : ['requestId', 'sessionId', 'mode', 'text']
    const record = readWorkspaceRequest(payload, receiptKeys)
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.requestId) || !isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (record.mode !== 'queue' && record.mode !== 'steer') return { ok: false, code: 'bridge-payload-invalid' }
    // Ticket 014: the base requires "at least one non-whitespace text part or attachment", so with
    // staged receipts the text may be empty; without them it must carry the message.
    const receipts = Array.isArray(record.receipts)
      ? record.receipts.filter((entry): entry is string => isWorkspaceRef(entry))
      : []
    if (record.receipts !== undefined
      && (!Array.isArray(record.receipts) || receipts.length !== record.receipts.length
        || receipts.length === 0 || receipts.length > 16)) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    if (typeof record.text !== 'string' || record.text.length > 32768) return { ok: false, code: 'bridge-payload-invalid' }
    if (record.text.trim() === '' && receipts.length === 0) return { ok: false, code: 'bridge-payload-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.prompt !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    // The base's own ack shape: `{accepted: true}` means "entered the inbox" and nothing more.
    const cancellation = new AbortController()
    try {
      const accepted = await sessions.prompt({
        requestId: record.requestId as string,
        sessionId: record.sessionId as string,
        mode: record.mode,
        content: [
          ...(record.text.trim() === '' ? [] : [{ type: 'text' as const, text: record.text }]),
          ...receipts.map((receiptId) => ({ type: 'file' as const, receiptId })),
        ],
      }, cancellation.signal)
      return crossable(accepted)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'attachment/upload-begin') {
    const keys = Object.hasOwn(payload[0] ?? {}, 'name') ? ['sessionId', 'name', 'bytes'] : ['sessionId', 'bytes']
    const record = readWorkspaceRequest(payload, keys)
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (typeof record.bytes !== 'number' || !Number.isSafeInteger(record.bytes) || record.bytes < 0) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    if (record.name !== undefined && (typeof record.name !== 'string' || record.name === ''
      || record.name !== record.name.trim() || record.name.includes('\u0000') || record.name.length > 255)) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    if (deps.uploads === undefined) return { ok: false, code: 'bridge-provider-unavailable' }
    // Begin is only useful when the streaming half exists: refuse before minting an upload id.
    const uploadsProvider = ctx.get('fileUploads') as Partial<FileUploadsProvider> | undefined
    if (typeof uploadsProvider?.uploadStream !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const begun = deps.uploads.begin({
      sessionId: record.sessionId as string,
      ...(record.name === undefined ? {} : { name: record.name as string }),
      bytes: record.bytes,
    })
    return begun.ok ? { ok: true, result: { uploadId: begun.uploadId } } : { ok: false, code: begun.code }
  }

  if (endpoint === 'attachment/upload-chunk') {
    const record = readWorkspaceRequest(payload, ['uploadId', 'seq', 'data', 'final'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.uploadId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (typeof record.seq !== 'number' || !Number.isSafeInteger(record.seq) || record.seq < 0) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    if (typeof record.final !== 'boolean') return { ok: false, code: 'bridge-payload-invalid' }
    const bytes = decodeCanonicalBase64(record.data)
    if (bytes === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (deps.uploads === undefined) return { ok: false, code: 'bridge-provider-unavailable' }
    const pushed = deps.uploads.pushChunk({
      uploadId: record.uploadId as string,
      seq: record.seq,
      data: bytes,
      final: record.final,
    })
    return pushed.ok ? { ok: true, result: { accepted: true } } : { ok: false, code: pushed.code }
  }

  if (endpoint === 'attachment/upload-commit') {
    const record = readWorkspaceRequest(payload, ['uploadId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.uploadId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (deps.uploads === undefined) return { ok: false, code: 'bridge-provider-unavailable' }
    const uploadsProvider = ctx.get('fileUploads') as Partial<FileUploadsProvider> | undefined
    if (typeof uploadsProvider?.uploadStream !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    try {
      const outcome = await deps.uploads.commit(record.uploadId as string, (input) => Promise.resolve(uploadsProvider.uploadStream!({
        sessionId: input.sessionId,
        data: input.data,
        signal: input.signal,
        ...(input.name === undefined ? {} : { name: input.name }),
      })))
      if (!outcome.ok) return { ok: false, code: outcome.code }
      return crossable(outcome.value)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  if (endpoint === 'attachment/upload-abort') {
    const record = readWorkspaceRequest(payload, ['uploadId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.uploadId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (deps.uploads === undefined) return { ok: false, code: 'bridge-provider-unavailable' }
    const aborted = deps.uploads.abort(record.uploadId as string)
    return aborted.ok ? { ok: true, result: { cancelled: true } } : { ok: false, code: aborted.code }
  }

  if (endpoint === 'session/cancel') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.cancel !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const cancellation = new AbortController()
    try {
      return crossable(await sessions.cancel({ sessionId: record.sessionId as string }, cancellation.signal))
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'session/queue-remove') {
    const record = readWorkspaceRequest(payload, ['sessionId', 'itemId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId) || !isWorkspaceRef(record.itemId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.updateQueue !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    try {
      return crossable(await sessions.updateQueue({ sessionId: record.sessionId as string, itemId: record.itemId as string, action: { kind: 'remove' } }))
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  if (endpoint === 'session/queue-edit') {
    const record = readWorkspaceRequest(payload, ['sessionId', 'itemId', 'text'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId) || !isWorkspaceRef(record.itemId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 32768) return { ok: false, code: 'bridge-payload-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.updateQueue !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    try {
      return crossable(await sessions.updateQueue({ sessionId: record.sessionId as string, itemId: record.itemId as string, action: { kind: 'edit', content: [{ type: 'text', text: record.text }] } }))
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  if (endpoint === 'skills/snapshot') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    // Ticket 038 (US-189): the mounted skills catalog, read through the base's own registry
    // (`ctx.skills.snapshot`) — bounded summaries only; `complete` says whether discovery
    // finished (an incomplete observation is never a claim that a skill is gone).
    const skills = ctx.get('skills') as Partial<{ snapshot: (options: {}) => unknown }> | undefined
    if (typeof skills?.snapshot !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let value: unknown
    try {
      value = await skills.snapshot({})
    } catch {
      return { ok: false, code: 'bridge-provider-failed' }
    }
    if (!isRecord(value) || !Array.isArray(value.skills)) return { ok: false, code: 'bridge-result-not-plain-data' }
    const rows = value.skills.slice(0, 100).map((entry) => {
      if (!isRecord(entry)) return null
      const name = boundedLabel(entry.name, 128)
      if (name === null) return null
      const invocation = isRecord(entry.invocation) ? entry.invocation : {}
      return {
        name,
        description: boundedLabel(entry.description, 200),
        source: boundedLabel(entry.source, 64),
        provider: boundedLabel(entry.provider, 64),
        modelInvocable: invocation.modelInvocable === true,
        userInvocable: invocation.userInvocable === true,
      }
    }).filter((row) => row !== null)
    return crossable({ skills: rows, complete: value.complete === true })
  }

  if (endpoint === 'session/questions') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const relay = ctx.get('sageUserQuestionRelay') as Partial<UserQuestionsRelay> | undefined
    if (typeof relay?.list !== 'function') return { ok: false, code: 'question-relay-unavailable' }
    return crossable(relay.list(record.sessionId as string))
  }

  if (endpoint === 'session/answer') {
    const record = readWorkspaceRequest(payload, ['requestId', 'answers'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.requestId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (!Array.isArray(record.answers)) return { ok: false, code: 'bridge-payload-invalid' }
    const relay = ctx.get('sageUserQuestionRelay') as Partial<UserQuestionsRelay> | undefined
    if (typeof relay?.answer !== 'function') return { ok: false, code: 'question-relay-unavailable' }
    const outcome = relay.answer(record.requestId as string, record.answers)
    // The relay's own refusal codes cross as-is: `question-not-found` is exactly the honest
    // "it is no longer waiting" that US-178's receipt needs, not a folded transport failure.
    if (!outcome.ok) return { ok: false, code: outcome.code }
    return { ok: true, result: { accepted: true } }
  }

  if (endpoint === 'session/plan-mode') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const planMode = ctx.get('planMode') as Partial<PlanModeProvider> | undefined
    if (typeof planMode?.get !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agents = ctx.get('agents') as Partial<AgentsProvider> | undefined
    if (typeof agents?.get !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agent = agents.get(record.sessionId as string)
    // Plan state is logged per live agent/session; no live agent is a named refusal, never a
    // manufactured "inactive" (a resumed-but-not-live session may hold a logged active state).
    if (agent === undefined || agent === null) return { ok: false, code: 'bridge-session-not-live' }
    let view: unknown
    try {
      view = planMode.get(agent)
    } catch {
      return { ok: false, code: 'bridge-provider-failed' }
    }
    if (!isRecord(view) || typeof view.active !== 'boolean') return { ok: false, code: 'bridge-plan-mode-unreadable' }
    // The controller returns `{active}` with `pending` only while a selection awaits the next
    // accepted pre-step; absent is "nothing queued", normalized so main never guesses.
    return { ok: true, result: { active: view.active, pending: view.pending === true } }
  }

  if (endpoint === 'session/plan-mode-switch') {
    const record = readWorkspaceRequest(payload, ['sessionId', 'active'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (typeof record.active !== 'boolean') return { ok: false, code: 'bridge-payload-invalid' }
    const planMode = ctx.get('planMode') as Partial<PlanModeProvider> | undefined
    if (typeof planMode?.set !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agents = ctx.get('agents') as Partial<AgentsProvider> | undefined
    if (typeof agents?.get !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agent = agents.get(record.sessionId as string)
    if (agent === undefined || agent === null) return { ok: false, code: 'bridge-session-not-live' }
    let outcome: unknown
    try {
      outcome = planMode.set(agent, record.active)
    } catch {
      return { ok: false, code: 'bridge-provider-failed' }
    }
    // The declared outcome set; anything else is unreadable, never folded into a success.
    if (outcome !== 'committed' && outcome !== 'queued' && outcome !== 'cancelled' && outcome !== 'noop') {
      return { ok: false, code: 'bridge-plan-mode-unreadable' }
    }
    return { ok: true, result: { outcome } }
  }

  if (endpoint === 'session/approvals') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const relay = ctx.get('sageApprovalRelay') as Partial<ApprovalRelay> | undefined
    if (typeof relay?.list !== 'function') return { ok: false, code: 'approval-relay-unavailable' }
    return crossable(relay.list(record.sessionId as string))
  }

  if (endpoint === 'session/approve') {
    const record = readWorkspaceRequest(payload, ['requestId', 'outcome'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.requestId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const relay = ctx.get('sageApprovalRelay') as Partial<ApprovalRelay> | undefined
    if (typeof relay?.answer !== 'function') return { ok: false, code: 'approval-relay-unavailable' }
    const outcome = relay.answer(record.requestId as string, record.outcome)
    // The relay's own refusal codes cross as-is: `approval-outcome-invalid` is exactly the
    // "not one of the two decision words" refusal, and `approval-not-found` the honest
    // "it is no longer waiting" — neither is folded into a transport failure.
    if (!outcome.ok) return { ok: false, code: outcome.code }
    return { ok: true, result: { accepted: true } }
  }

  if (endpoint === 'session/approval-withdraw') {
    const record = readWorkspaceRequest(payload, ['requestId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.requestId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const relay = ctx.get('sageApprovalRelay') as Partial<ApprovalRelay> | undefined
    if (typeof relay?.withdraw !== 'function') return { ok: false, code: 'approval-relay-unavailable' }
    const outcome = relay.withdraw(record.requestId as string)
    if (!outcome.ok) return { ok: false, code: outcome.code }
    return { ok: true, result: { withdrawn: true } }
  }

  if (endpoint === 'session/terminals') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const terminals = ctx.get('terminals') as Partial<TerminalsProvider> | undefined
    if (typeof terminals?.list !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agents = ctx.get('agents') as Partial<AgentsProvider> | undefined
    if (typeof agents?.get !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agent = agents.get(record.sessionId as string)
    // Terminal sessions are owner-scoped to a live agent; no live agent is a named refusal.
    if (agent === undefined || agent === null) return { ok: false, code: 'bridge-session-not-live' }
    let value: unknown
    try {
      value = terminals.list(agent)
    } catch {
      return { ok: false, code: 'bridge-provider-failed' }
    }
    if (!Array.isArray(value)) return { ok: false, code: 'bridge-terminal-unreadable' }
    const rows = value.slice(0, 16).map((entry) => {
      if (!isRecord(entry)) return null
      const terminalId = boundedLabel(entry.sessionId, 128)
      const backendType = boundedLabel(entry.type, 64)
      if (terminalId === null || backendType === null) return null
      const status = isRecord(entry.status) ? entry.status : null
      if (status === null || (status.kind !== 'running' && status.kind !== 'exited')) return null
      // `pid` and any cwd never cross — the panel shows identity, type and process status only.
      return {
        terminalId,
        name: boundedLabel(entry.name, 128),
        type: backendType,
        status: status.kind === 'exited'
          ? {
            kind: 'exited',
            exitCode: typeof status.exitCode === 'number' && Number.isInteger(status.exitCode) ? status.exitCode : null,
            signal: boundedLabel(status.signal, 32),
          }
          : { kind: 'running' },
      }
    }).filter((row) => row !== null)
    return crossable({ terminals: rows })
  }

  if (endpoint === 'session/terminal-read') {
    const keys = ['sessionId', 'terminalId']
    if (Object.hasOwn(payload[0] ?? {}, 'offset') && Object.hasOwn(payload[0] ?? {}, 'count')) keys.push('offset', 'count')
    const record = readWorkspaceRequest(payload, keys)
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId) || !isWorkspaceRef(record.terminalId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    for (const key of ['offset', 'count'] as const) {
      const candidate = record[key]
      if (candidate !== undefined && (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0)) {
        return { ok: false, code: 'bridge-payload-invalid' }
      }
    }
    const terminals = ctx.get('terminals') as Partial<TerminalsProvider> | undefined
    if (typeof terminals?.read !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agents = ctx.get('agents') as Partial<AgentsProvider> | undefined
    if (typeof agents?.get !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const agent = agents.get(record.sessionId as string)
    if (agent === undefined || agent === null) return { ok: false, code: 'bridge-session-not-live' }
    let value: unknown
    try {
      value = terminals.read(agent, record.terminalId, {
        ...(record.offset === undefined ? {} : { offset: record.offset as number }),
        ...(record.count === undefined ? {} : { count: record.count as number }),
      })
    } catch {
      return { ok: false, code: 'bridge-terminal-unreadable' }
    }
    if (!isRecord(value) || typeof value.text !== 'string') return { ok: false, code: 'bridge-terminal-unreadable' }
    return crossable({
      text: value.text.length > 65_536 ? value.text.slice(0, 65_536) : value.text,
      totalLines: typeof value.totalLines === 'number' && Number.isSafeInteger(value.totalLines) ? value.totalLines : 0,
      lineBegin: typeof value.lineBegin === 'number' && Number.isSafeInteger(value.lineBegin) ? value.lineBegin : 0,
      lineEnd: typeof value.lineEnd === 'number' && Number.isSafeInteger(value.lineEnd) ? value.lineEnd : 0,
      truncated: value.truncated === true,
    })
  }

  if (endpoint === 'session/fork') {
    const keys = Object.hasOwn(payload[0] ?? {}, 'atSeq') ? ['sessionId', 'atSeq'] : ['sessionId']
    const record = readWorkspaceRequest(payload, keys)
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (record.atSeq !== undefined
      && (typeof record.atSeq !== 'number' || !Number.isSafeInteger(record.atSeq) || record.atSeq < 0)) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.fork !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    try {
      const forked = record.atSeq === undefined
        ? await sessions.fork({ sessionId: record.sessionId as string })
        : await sessions.fork({ sessionId: record.sessionId as string, atSeq: record.atSeq })
      return crossable(forked)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  if (endpoint === 'session/search') {
    const record = readWorkspaceRequest(payload, ['query'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (typeof record.query !== 'string') return { ok: false, code: 'bridge-payload-invalid' }
    const query = record.query.trim()
    // The base's own bounds: non-empty, at most 500 UTF-16 code units, no NUL.
    if (query === '' || query.length > 500 || query.includes('\u0000')) return { ok: false, code: 'bridge-search-query-rejected' }
    // US-087: the absence of the query engine is a named state, checked before the call (the
    // controller's own first act) — never folded into "no results".
    if (ctx.get('sessionQuery') === undefined) return { ok: false, code: 'bridge-search-unavailable' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.search !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const cancellation = new AbortController()
    try {
      const page = await sessions.search({ query }, cancellation.signal)
      return crossable(page)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'session/page') {
    const keys = Object.hasOwn(payload[0] ?? {}, 'maxMessages') ? ['sessionId', 'throughSeq', 'maxMessages'] : ['sessionId', 'throughSeq']
    const record = readWorkspaceRequest(payload, keys)
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    if (typeof record.throughSeq !== 'number' || !Number.isSafeInteger(record.throughSeq) || record.throughSeq < 0) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    if (record.maxMessages !== undefined
      && (typeof record.maxMessages !== 'number' || !Number.isSafeInteger(record.maxMessages) || record.maxMessages < 1 || record.maxMessages > 500)) {
      return { ok: false, code: 'bridge-payload-invalid' }
    }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerProvider> | undefined
    if (typeof sessions?.page !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const cancellation = new AbortController()
    try {
      const page = await sessions.page({
        address: { kind: 'session', sessionId: record.sessionId as string },
        throughSeq: record.throughSeq,
        ...(record.maxMessages === undefined ? {} : { maxMessages: record.maxMessages }),
      }, cancellation.signal)
      return crossable(page)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'workspaceFiles/list' || endpoint === 'workspaceFiles/stat' || endpoint === 'workspaceFiles/read'
    || endpoint === 'workspaceFiles/readBytes' || endpoint === 'workspaceFiles/readAll') {
    const takesRange = endpoint === 'workspaceFiles/read' || endpoint === 'workspaceFiles/readBytes'
    const keys = takesRange
      ? (Object.hasOwn(payload[0] ?? {}, 'range') ? ['workspaceRoot', 'path', 'range'] : ['workspaceRoot', 'path'])
      : ['workspaceRoot', 'path']
    const record = readFileRequest(
      payload,
      keys,
      endpoint === 'workspaceFiles/list',
      endpoint === 'workspaceFiles/readBytes' ? ['offset', 'length'] : ['offset', 'limit'],
    )
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    const workspaceRoot = record.workspaceRoot as string
    const path = record.path as string
    const files = ctx.get('workspaceFiles') as Partial<WorkspaceFilesProvider> | undefined
    const method = endpoint === 'workspaceFiles/list' ? 'list'
      : endpoint === 'workspaceFiles/stat' ? 'stat'
        : endpoint === 'workspaceFiles/read' ? 'read'
          : endpoint === 'workspaceFiles/readBytes' ? 'readBytes' : 'readAll'
    if (typeof files?.[method] !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const scope = resolveFileScope(ctx, workspaceRoot)
    // No live session bound to that root is a fact about this shell, not a reason to invent one.
    if (scope === undefined) return { ok: false, code: 'bridge-file-scope-unavailable' }
    // These are cancellation-parameter methods; the signal lives exactly as long as the call.
    const cancellation = new AbortController()
    try {
      const value = method === 'list'
        ? await files.list!(scope, path, cancellation.signal)
        : method === 'stat'
          ? await files.stat!(scope, path, cancellation.signal)
          : method === 'read'
            ? await files.read!(scope, path, record.range ?? {}, cancellation.signal)
            : method === 'readBytes'
              ? await files.readBytes!(scope, path, record.range ?? {}, cancellation.signal)
              : await files.readAll!(scope, path, cancellation.signal)
      return crossable(value)
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  // Unreachable while the map and this switch agree; refusing keeps that agreement honest.
  return { ok: false, code: 'bridge-endpoint-unsupported' }
}

/** Push one frame to the consumer. Returning false means "stop": the consumer's bound was hit. */
export type BridgeStreamEmitter = (frame: unknown) => boolean

/** Resolves to `'quiet'` when no frame arrives within the read's quiet window. */
function nextFrameOrQuiet(
  iterator: AsyncIterator<unknown>,
  quietMs: number,
): Promise<IteratorResult<unknown> | 'quiet'> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (value: IteratorResult<unknown> | 'quiet'): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const fail = (error: unknown): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    timer = setTimeout(() => { finish('quiet') }, quietMs)
    // An already-available frame settles in a microtask and always wins the race against the timer.
    Promise.resolve().then(() => iterator.next()).then(finish, fail)
  })
}

/**
 * Execute one allowlisted **stream** endpoint. Same rules as the request/response path (endpoint
 * must be in the map with kind `stream`, payload checked here, provider reached only through
 * `ctx.get`, every frame must be plain data), plus two of its own:
 *
 * - the frame count is bounded by `MAX_BRIDGE_STREAM_FRAMES`; crossing it ends the stream with a
 *   refusal instead of letting a subscription grow without bound;
 * - the read is bounded in time (ADR-0206): a base generation like `workspace/follow` never ends
 *   by itself, so the read ends after `BRIDGE_STREAM_QUIET_MS` without a frame and reports what it
 *   folded. The generation is aborted in the same `finally`, so the subscription does not outlive
 *   this call.
 *
 * @returns the terminal outcome of the subscription; frames already handed to `emit` stay valid.
 */
export async function resolveBridgeStreamCall(
  ctx: BridgeContext,
  endpoint: string,
  payload: readonly unknown[],
  emit: BridgeStreamEmitter,
  quietMs: number = BRIDGE_STREAM_QUIET_MS,
): Promise<BridgeOutcome> {
  const kind = Object.hasOwn(BRIDGE_ENDPOINTS, endpoint) ? BRIDGE_ENDPOINTS[endpoint] : undefined
  if (kind !== 'stream') return { ok: false, code: 'bridge-endpoint-unsupported' }

  if (endpoint === 'workspace/follow') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    const controller = ctx.get('workspaceController') as Partial<WorkspaceControllerStreamProvider> | undefined
    if (typeof controller?.follow !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    // `follow` is a cancellation-parameter generation: it runs until the signal aborts.
    const cancellation = new AbortController()
    let frames = 0
    try {
      const iterator = (controller.follow(cancellation.signal) as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      for (;;) {
        const next = await nextFrameOrQuiet(iterator, quietMs)
        if (next === 'quiet' || next.done === true) return { ok: true, result: { frames } }
        const frame = next.value
        if (!isPlainData(frame, new Set<object>())) return { ok: false, code: 'bridge-result-not-plain-data' }
        if (frames >= MAX_BRIDGE_STREAM_FRAMES) return { ok: false, code: 'bridge-stream-overflow' }
        frames += 1
        if (!emit(frame)) return { ok: false, code: 'bridge-stream-closed' }
      }
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'session/control') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerStreamProvider> | undefined
    if (typeof sessions?.control !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const cancellation = new AbortController()
    let frames = 0
    try {
      const iterator = (sessions.control(cancellation.signal) as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      for (;;) {
        const next = await nextFrameOrQuiet(iterator, quietMs)
        if (next === 'quiet' || next.done === true) return { ok: true, result: { frames } }
        const frame = next.value
        if (!isPlainData(frame, new Set<object>())) return { ok: false, code: 'bridge-result-not-plain-data' }
        if (frames >= MAX_BRIDGE_STREAM_FRAMES) return { ok: false, code: 'bridge-stream-overflow' }
        frames += 1
        if (!emit(frame)) return { ok: false, code: 'bridge-stream-closed' }
      }
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'session/follow') {
    const record = readWorkspaceRequest(payload, ['sessionId'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isWorkspaceRef(record.sessionId)) return { ok: false, code: 'bridge-workspace-ref-invalid' }
    const sessions = ctx.get('sessionController') as Partial<SessionControllerStreamProvider> | undefined
    if (typeof sessions?.follow !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const cancellation = new AbortController()
    let frames = 0
    try {
      const iterator = (sessions.follow({
        address: { kind: 'session', sessionId: record.sessionId as string },
        assistantStream: true,
      }, cancellation.signal) as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      for (;;) {
        const next = await nextFrameOrQuiet(iterator, quietMs)
        if (next === 'quiet' || next.done === true) return { ok: true, result: { frames } }
        const frame = next.value
        if (!isPlainData(frame, new Set<object>())) return { ok: false, code: 'bridge-result-not-plain-data' }
        if (frames >= MAX_BRIDGE_STREAM_FRAMES) return { ok: false, code: 'bridge-stream-overflow' }
        frames += 1
        if (!emit(frame)) return { ok: false, code: 'bridge-stream-closed' }
      }
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  if (endpoint === 'workspaceFiles/changes') {
    const record = readWorkspaceRequest(payload, ['workspaceRoot'])
    if (record === undefined) return { ok: false, code: 'bridge-payload-invalid' }
    if (!isAdoptablePath(record.workspaceRoot)) return { ok: false, code: 'bridge-path-invalid' }
    const files = ctx.get('workspaceFiles') as Partial<WorkspaceFilesChangesProvider> | undefined
    if (typeof files?.changes !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    const scope = resolveFileScope(ctx, record.workspaceRoot as string)
    if (scope === undefined) return { ok: false, code: 'bridge-file-scope-unavailable' }
    const cancellation = new AbortController()
    let frames = 0
    try {
      const iterator = (files.changes(scope, cancellation.signal) as AsyncIterable<unknown>)[Symbol.asyncIterator]()
      for (;;) {
        const next = await nextFrameOrQuiet(iterator, quietMs)
        if (next === 'quiet' || next.done === true) return { ok: true, result: { frames } }
        const frame = next.value
        if (!isPlainData(frame, new Set<object>())) return { ok: false, code: 'bridge-result-not-plain-data' }
        if (frames >= MAX_BRIDGE_STREAM_FRAMES) return { ok: false, code: 'bridge-stream-overflow' }
        frames += 1
        if (!emit(frame)) return { ok: false, code: 'bridge-stream-closed' }
      }
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    } finally {
      cancellation.abort()
    }
  }

  return { ok: false, code: 'bridge-endpoint-unsupported' }
}
