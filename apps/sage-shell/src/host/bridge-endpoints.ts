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
import { credentialRef } from '@deepseek-ai/dsh-credentials'
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
    // ADR-0339: settings write refusals keep their identity — a stale writer must re-read and
    // re-apply (conflict), and a schema-invalid write is its own named outcome.
    case 'settings/conflict':
      return 'bridge-settings-conflict'
    case 'settings/rejected':
      return 'bridge-settings-rejected'
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
/** ADR-0334: the instance credential names this bridge may address. The deepseek-official
 *  provider route reads its key through the dsh credential store; the surface is name-allowlisted
 *  so no arbitrary environment name can be written or probed through Sage. */
const APP_CREDENTIAL_NAMES: readonly string[] = ['DEEPSEEK_API_KEY']

/** The dsh credential seam, narrowed to what this bridge needs. Values are write-only here. */
interface CredentialSeam {
  readonly describe: (ref: ReturnType<typeof credentialRef>) => unknown
  readonly set: (ref: ReturnType<typeof credentialRef>, value: string) => Promise<void>
  readonly unset: (ref: ReturnType<typeof credentialRef>) => Promise<void>
}

/** ADR-0339: the model-config seam. Hand-declared custom model routes are llm-pi-ai provider
 *  profiles keyed by route name; the surface writes them path-addressed (never a whole-section
 *  merge, which would wipe sibling routes). */
const MODEL_CONFIG_NAMESPACE = 'llm-pi-ai'
const MODEL_ROUTE = /^[a-z][a-z0-9-]{0,63}$/u
const MODEL_API = new Set(['openai-completions', 'openai-responses', 'anthropic-messages'])
const CREDENTIAL_REF_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/u

interface SettingsWriteSeam {
  readonly describe: () => unknown
  readonly mutate: (ns: string, ops: readonly unknown[], expectedRevision: number | undefined) => Promise<unknown>
}

/** The LlmRuntime discovery half this seam needs (llm/src/index.ts:596). */
interface LlmDiscoverySeam {
  readonly discoverModels: (
    settingsNs: string,
    request: { readonly provider?: string, readonly baseURL?: string, readonly api?: string },
    signal?: AbortSignal,
  ) => Promise<readonly unknown[]>
}

/** The saved route facts the test action may use — never renderer-supplied ones. */
function savedRouteProfile(controller: Partial<SettingsWriteSeam>, route: string): { readonly api?: unknown, readonly baseURL?: unknown, readonly apiKeyEnv?: unknown } | undefined {
  const described = controller.describe?.()
  if (described === null || typeof described !== 'object') return undefined
  const namespaces = (described as { readonly namespaces?: unknown }).namespaces
  if (!Array.isArray(namespaces)) return undefined
  const namespace = namespaces.find((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && (candidate as { readonly ns?: unknown }).ns === MODEL_CONFIG_NAMESPACE)
  if (namespace === undefined) return undefined
  // Effective config first: the settings stack's `user` layer reads the receipt-sealed
  // in-generation cordis.patch.yml (always empty for Sage — ADR-0339 moved the writable
  // document out of the generation), so `value` is the layer that actually carries routes.
  const section = namespace.value ?? namespace.user
  if (section === null || typeof section !== 'object') return undefined
  const providers = (section as { readonly providers?: unknown }).providers
  if (providers === null || typeof providers !== 'object') return undefined
  return (providers as Record<string, { readonly api?: unknown, readonly baseURL?: unknown, readonly apiKeyEnv?: unknown }>)[route]
}

/** The llm-pi-ai namespace revision the route was read at, for test-result binding. */
function savedRouteRevision(controller: Partial<SettingsWriteSeam>, route: string): number | undefined {
  void route
  const described = controller.describe?.()
  if (described === null || typeof described !== 'object') return undefined
  const namespaces = (described as { readonly namespaces?: unknown }).namespaces
  if (!Array.isArray(namespaces)) return undefined
  const namespace = namespaces.find((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && (candidate as { readonly ns?: unknown }).ns === MODEL_CONFIG_NAMESPACE)
  const revision = namespace?.revision
  return typeof revision === 'number' && Number.isSafeInteger(revision) ? revision : undefined
}

/** Whether a credential currently resolves for the route's declared ref. The value is never
 *  read here — only the presence fact. */
async function savedRouteCredentialConfigured(ctx: { get: (name: string) => unknown }, apiKeyEnv: unknown): Promise<boolean> {
  if (typeof apiKeyEnv !== 'string') return false
  const credentials = ctx.get('credentials') as Partial<CredentialSeam> | undefined
  if (typeof credentials?.describe !== 'function') return false
  try {
    const info = await credentials.describe(credentialRef(apiKeyEnv)) as { readonly configured?: unknown }
    return info !== null && typeof info === 'object' && info.configured === true
  } catch {
    return false
  }
}

/** ADR-0339: credential refs the SAVED configuration declares (their routes' apiKeyEnv names).
 *  A describe failure reads as "nothing declared" — the fixed app names stay the only allowlist. */
function declaredCredentialRefs(controller: Partial<SettingsWriteSeam>): Set<string> {
  const names = new Set<string>()
  const described = controller.describe?.()
  if (described === null || typeof described !== 'object') return names
  const namespaces = (described as { readonly namespaces?: unknown }).namespaces
  if (!Array.isArray(namespaces)) return names
  const namespace = namespaces.find((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && (candidate as { readonly ns?: unknown }).ns === MODEL_CONFIG_NAMESPACE)
  if (namespace === undefined) return names
  const section = namespace.value ?? namespace.user
  const providers = section !== null && typeof section === 'object' ? (section as { readonly providers?: unknown }).providers : undefined
  if (providers === null || typeof providers !== 'object') return names
  for (const profile of Object.values(providers as Record<string, unknown>)) {
    const ref = profile !== null && typeof profile === 'object' ? (profile as { readonly apiKeyEnv?: unknown }).apiKeyEnv : undefined
    if (typeof ref === 'string' && CREDENTIAL_REF_NAME.test(ref)) names.add(ref)
  }
  return names
}

/** The catalog half of the session controller this seam needs (session-controller/src/index.ts:309). */
interface ModelCatalogSeam {
  readonly modelCatalog: () => Promise<unknown>
}

/** The default-model write half (agent-default-model/src/index.ts:82) plus its reader. */
interface DefaultModelSeam {
  readonly currentSelection: () => unknown
  readonly saveSelection: (next: { readonly provider: string, readonly model: string, readonly reasoningEffort?: string }) => Promise<unknown>
}

/** Availability diagnostics for one selection against the live catalog. `saveSelection` writes
 *  blindly (the base says its consumer owns this), so this check is what keeps an unusable
 *  default out of the settings document. */
function selectionRefusal(catalog: unknown, provider: string, model: string, effort: string | undefined): string | undefined {
  if (catalog === null || typeof catalog !== 'object') return 'bridge-model-catalog-unreadable'
  const groups = (catalog as { readonly groups?: unknown }).groups
  if (!Array.isArray(groups)) return 'bridge-model-catalog-unreadable'
  const group = groups.find((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && (candidate as { readonly id?: unknown }).id === provider)
  if (group === undefined) return 'bridge-model-selection-unknown'
  const models = Array.isArray(group.models) ? group.models : []
  const found = models.find((candidate): candidate is Record<string, unknown> =>
    candidate !== null && typeof candidate === 'object' && (candidate as { readonly id?: unknown }).id === model)
  if (found === undefined) return 'bridge-model-selection-unknown'
  if (effort !== undefined) {
    const reasoning = found.reasoning !== null && typeof found.reasoning === 'object' ? found.reasoning as Record<string, unknown> : undefined
    const efforts = reasoning !== undefined && Array.isArray(reasoning.efforts) ? reasoning.efforts : []
    const known = efforts.some(candidate => candidate !== null && typeof candidate === 'object' && (candidate as { readonly id?: unknown }).id === effort)
    if (!known) return 'bridge-model-effort-unknown'
  }
  return undefined
}

/** One route profile exactly as the surface may declare it: unknown members are refused, not
 *  ignored (a surface cannot smuggle `headers` or any deployment-owned field through save). */
function readRouteProfile(raw: unknown): { readonly profile: Record<string, unknown>, readonly apiKeyEnv?: string } | undefined {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const allowed = new Set(['displayName', 'api', 'baseURL', 'apiKeyEnv', 'models'])
  if (!Object.keys(record).every(key => allowed.has(key))) return undefined
  const api = record.api
  if (typeof api !== 'string' || !MODEL_API.has(api)) return undefined
  const baseURL = record.baseURL
  if (typeof baseURL !== 'string' || baseURL !== baseURL.trim() || baseURL.length === 0 || baseURL.length > 2048) return undefined
  let parsed: URL
  try {
    parsed = new URL(baseURL)
  } catch {
    return undefined
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    return undefined
  }
  const displayName = record.displayName
  if (displayName !== undefined && (typeof displayName !== 'string' || displayName !== displayName.trim() || displayName.length === 0 || displayName.length > 64)) {
    return undefined
  }
  const apiKeyEnv = record.apiKeyEnv
  if (apiKeyEnv !== undefined && (typeof apiKeyEnv !== 'string' || !CREDENTIAL_REF_NAME.test(apiKeyEnv))) return undefined
  const models = record.models
  if (!Array.isArray(models) || models.length === 0 || models.length > 64) return undefined
  const cleaned: { readonly id: string }[] = []
  for (const entry of models) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
    const model = entry as Record<string, unknown>
    if (!Object.keys(model).every(key => key === 'id')) return undefined
    const id = model.id
    if (typeof id !== 'string' || id !== id.trim() || id.length === 0 || id.length > 128) return undefined
    cleaned.push({ id })
  }
  return {
    profile: {
      ...(displayName === undefined ? {} : { displayName }),
      api,
      baseURL,
      ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
      models: cleaned,
    },
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
  }
}

function readWorkspaceRequest(payload: readonly unknown[], keys: readonly string[]): Record<string, unknown> | undefined {
  if (payload.length !== 1) return undefined
  const input = payload[0]
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const present = Object.keys(record)
  if (present.length !== keys.length || !present.every((key) => keys.includes(key))) return undefined
  return record
}

/** One request object whose key set is `required` plus an allowed `optional` subset. */
function readRequestWithOptional(payload: readonly unknown[], required: readonly string[], optional: readonly string[]): Record<string, unknown> | undefined {
  if (payload.length !== 1) return undefined
  const input = payload[0]
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined
  const record = input as Record<string, unknown>
  const present = Object.keys(record)
  if (!present.every(key => required.includes(key) || optional.includes(key))) return undefined
  if (!required.every(key => present.includes(key))) return undefined
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
    if (process.env.CREDENTIAL_SEAM_PROBE === '1') {
      try {
        const record = value as { readonly namespaces?: readonly Record<string, unknown>[] }
        const namespaces = Array.isArray(record.namespaces) ? record.namespaces : []
        const ns = namespaces.find(candidate => candidate.ns === 'llm-pi-ai')
        const providersOf = (section: unknown) => {
          const record2 = section !== null && typeof section === 'object' ? section as Record<string, unknown> : undefined
          const providers = record2 !== null && record2 !== undefined && typeof record2.providers === 'object' && record2.providers !== null ? record2.providers as Record<string, unknown> : undefined
          return providers === undefined ? null : Object.keys(providers)
        }
        console.log('DESCRIBE-PROBE', JSON.stringify({
          n: namespaces.length,
          ns: ns?.ns,
          revision: ns?.revision,
          hasUser: ns !== undefined && 'user' in ns,
          hasValue: ns !== undefined && 'value' in ns,
          userProviders: providersOf(ns?.user),
          valueProviders: providersOf(ns?.value),
        }))
      } catch { /* probe only */ }
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

  // ADR-0334/0339: the instance credential surface. Addressable names are the fixed app-owned
  // keys PLUS the refs the saved model configuration declares (each custom route's apiKeyEnv) —
  // a name that is neither can never be written or probed. Values stay write-only.
  if (endpoint === 'credentials/describe' || endpoint === 'credentials/set' || endpoint === 'credentials/unset') {
    const keys = endpoint === 'credentials/set' ? ['name', 'value'] : ['name']
    const record = readWorkspaceRequest(payload, keys)
    const settingsController = ctx.get('settingsController') as Partial<SettingsWriteSeam> | undefined
    const name = record !== undefined && typeof record.name === 'string' ? record.name : undefined
    const addressable = name !== undefined
      && (APP_CREDENTIAL_NAMES.includes(name) || declaredCredentialRefs(settingsController ?? {}).has(name))
    if (!addressable) {
      return { ok: false, code: 'bridge-credential-name-refused' }
    }
    const credentials = ctx.get('credentials') as Partial<CredentialSeam> | undefined
    // Methods are invoked on the receiver, never as extracted locals: the provider's own
    // methods read `this` (the store, the watcher), and a bare extracted call dies with
    // "Cannot read properties of undefined" instead of answering (observed in the ADR-0334
    // live run — the stub-based specs never caught it).
    const needsSet = endpoint === 'credentials/set' && typeof credentials?.set !== 'function'
    const needsUnset = endpoint === 'credentials/unset' && typeof credentials?.unset !== 'function'
    if (typeof credentials?.describe !== 'function' || needsSet || needsUnset) {
      return { ok: false, code: 'bridge-provider-unavailable' }
    }
    try {
      if (endpoint === 'credentials/describe') {
        const info = await credentials.describe(credentialRef(name))
        return crossable(info)
      }
      if (endpoint === 'credentials/unset') {
        // Removal keeps the same read-only-source guard as the write: an environment layer
        // cannot be cleared from here, and claiming so would be a silent lie.
        const info = await credentials.describe(credentialRef(name)) as { readonly configured?: unknown, readonly writable?: unknown }
        if (info !== null && typeof info === 'object' && info.configured === true && info.writable === false) {
          return { ok: false, code: 'bridge-credential-readonly-source' }
        }
        await credentials.unset!(credentialRef(name))
        return { ok: true, result: { removed: true } }
      }
      const value = record?.value
      // The value grammar is checked here so nothing malformed reaches the store; the value
      // itself must never leave this branch (no logging, no echo in any refusal).
      if (typeof value !== 'string' || value.trim() !== value
        || value.length < 8 || value.length > 512
        || /[\u0000-\u001f\u007f]/u.test(value)) {
        return { ok: false, code: 'bridge-credential-value-refused' }
      }
      // P-56 honesty guard: when the active source is read-only (the process environment
      // shadows the file), a write would silently not take effect after restart — refuse
      // with the named cause instead of reporting a save that changes nothing.
      const info = await credentials.describe(credentialRef(name)) as { readonly configured?: unknown, readonly writable?: unknown }
      if (info !== null && typeof info === 'object' && info.configured === true && info.writable === false) {
        return { ok: false, code: 'bridge-credential-readonly-source' }
      }
      await credentials.set!(credentialRef(name), value)
      return { ok: true, result: { saved: true } }
    } catch (error) {
      // Gated seam probe (same class as SAGE_DISPATCH_PROBE): the classification alone hid the
      // real cause during the ADR-0334 live run. The error carries no value — describe never
      // sees one, and the store's own write errors quote the reference name only.
      // Gate name deliberately NOT SAGE_-prefixed: resolveHostRuntime scrubs every SAGE_* var
      // from the host child env, so a SAGE_-gated probe is unreachable inside the host.
      if (process.env.SAGE_CREDENTIAL_PROBE === '1' || process.env.CREDENTIAL_SEAM_PROBE === '1') {
        // stdout: the host child's stderr is buffered for fatal messages only, so a probe there
        // never surfaces while the host is alive.
        console.log('CREDENTIAL-PROBE', (error as { code?: unknown } | null)?.code ?? '', error instanceof Error ? error.message : String(error))
      }
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  // ADR-0339: the model-config surface. Path-addressed writes into the llm-pi-ai user layer
  // (a whole-section merge would wipe sibling routes), and a connectivity test over the SAVED
  // route only — the renderer never supplies an endpoint here.
  if (endpoint === 'modelConfig/save' || endpoint === 'modelConfig/remove') {
    const keys = endpoint === 'modelConfig/save' ? ['route', 'profile', 'expectedRevision'] : ['route', 'expectedRevision']
    const record = readRequestWithOptional(payload, endpoint === 'modelConfig/save' ? ['route', 'profile'] : ['route'], ['expectedRevision'])
    const route = record?.route
    const revision = record?.expectedRevision
    if (record === undefined || typeof route !== 'string' || !MODEL_ROUTE.test(route)
      || (revision !== undefined && (!Number.isSafeInteger(revision) || (revision as number) < 0))) {
      return { ok: false, code: 'bridge-model-route-invalid' }
    }
    const controller = ctx.get('settingsController') as Partial<SettingsWriteSeam> | undefined
    if (typeof controller?.mutate !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let ops: readonly unknown[]
    if (endpoint === 'modelConfig/save') {
      const parsed = readRouteProfile(record.profile)
      if (parsed === undefined) return { ok: false, code: 'bridge-model-profile-invalid' }
      ops = [{ op: 'set', path: ['providers', route], value: parsed.profile }]
    } else {
      ops = [{ op: 'unset', path: ['providers', route] }]
    }
    try {
      await controller.mutate(MODEL_CONFIG_NAMESPACE, ops, revision as number | undefined)
      return { ok: true, result: { saved: true, route } }
    } catch (error) {
      return { ok: false, code: classifyProviderFailure(error) }
    }
  }

  if (endpoint === 'modelConfig/test') {
    const record = readWorkspaceRequest(payload, ['route'])
    const route = record?.route
    if (record === undefined || typeof route !== 'string' || !MODEL_ROUTE.test(route)) {
      return { ok: false, code: 'bridge-model-route-invalid' }
    }
    const controller = ctx.get('settingsController') as Partial<SettingsWriteSeam> | undefined
    const profile = savedRouteProfile(controller ?? {}, route)
    if (profile === undefined) return { ok: false, code: 'bridge-model-route-unknown' }
    const baseURL = profile.baseURL
    if (typeof baseURL !== 'string' || baseURL.length === 0 || baseURL.length > 2048) {
      return { ok: false, code: 'bridge-model-route-unknown' }
    }
    const api = typeof profile.api === 'string' && MODEL_API.has(profile.api) ? profile.api : 'openai-completions'
    const llm = ctx.get('llm') as Partial<LlmDiscoverySeam> | undefined
    if (typeof llm?.discoverModels !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    // The verdict binds to the facts of THIS attempt: the namespace revision the saved route
    // was read at, and whether a credential resolves for its declared apiKeyEnv right now.
    const revision = savedRouteRevision(controller ?? {}, route)
    const credentialConfigured = await savedRouteCredentialConfigured(ctx, profile.apiKeyEnv)
    const binding = { revision, credentialConfigured }
    // ADR-0249 D3 semantics kept: the host owns a 20s clock, never retries, and an abort reads
    // as `unknown` (待核对) rather than a failure verdict. No matter, session or attachment
    // content can ride this request — it is GET {baseURL}/models with the stored credential.
    const startedAt = Date.now()
    try {
      const models = await llm.discoverModels(MODEL_CONFIG_NAMESPACE, { provider: route, baseURL, api }, AbortSignal.timeout(20_000))
      const ids = models
        .map(model => model !== null && typeof model === 'object' ? (model as { readonly id?: unknown }).id : undefined)
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 64)
      const host = new URL(baseURL).host
      return { ok: true, result: { state: 'ok', modelIds: ids, latencyMs: Date.now() - startedAt, host, ...binding } }
    } catch (error) {
      const latencyMs = Date.now() - startedAt
      if (error !== null && typeof error === 'object'
        && ((error as { readonly name?: unknown }).name === 'TimeoutError' || (error as { readonly name?: unknown }).name === 'AbortError')) {
        return { ok: true, result: { state: 'unknown', latencyMs, ...binding } }
      }
      const remote = error !== null && typeof error === 'object' ? (error as { readonly code?: unknown }) : undefined
      if (remote?.code === 'MISSING_CREDENTIAL') return { ok: true, result: { state: 'credential-missing', latencyMs, ...binding } }
      if (remote?.code === 'DISCOVERY_UNSUPPORTED') return { ok: true, result: { state: 'unsupported', latencyMs, ...binding } }
      return { ok: true, result: { state: 'failed', latencyMs, ...binding } }
    }
  }

  if (endpoint === 'modelConfig/catalog') {
    if (payload.length !== 0) return { ok: false, code: 'bridge-payload-invalid' }
    const controller = ctx.get('sessionController') as Partial<ModelCatalogSeam> | undefined
    if (typeof controller?.modelCatalog !== 'function') return { ok: false, code: 'bridge-provider-unavailable' }
    let value: unknown
    try {
      value = await controller.modelCatalog()
    } catch {
      return { ok: false, code: 'bridge-model-catalog-failed' }
    }
    return crossable(value)
  }

  if (endpoint === 'modelConfig/default') {
    const record = readRequestWithOptional(payload, ['provider', 'model'], ['reasoningEffort'])
    const provider = record?.provider
    const model = record?.model
    const effort = record?.reasoningEffort
    if (record === undefined
      || typeof provider !== 'string' || provider === '' || provider.length > 128
      || typeof model !== 'string' || model === '' || model.length > 128
      || (effort !== undefined && (typeof effort !== 'string' || effort === '' || effort.length > 64))) {
      return { ok: false, code: 'bridge-model-selection-invalid' }
    }
    const controller = ctx.get('sessionController') as Partial<ModelCatalogSeam> | undefined
    const defaultModel = ctx.get('agentDefaultModel') as Partial<DefaultModelSeam> | undefined
    if (typeof controller?.modelCatalog !== 'function' || typeof defaultModel?.saveSelection !== 'function') {
      return { ok: false, code: 'bridge-provider-unavailable' }
    }
    try {
      const catalog = await controller.modelCatalog()
      const refusal = selectionRefusal(catalog, provider, model, effort as string | undefined)
      if (refusal !== undefined) return { ok: false, code: refusal }
      await defaultModel.saveSelection({
        provider,
        model,
        ...(effort === undefined ? {} : { reasoningEffort: effort as string }),
      })
      const current = typeof defaultModel.currentSelection === 'function' ? defaultModel.currentSelection() : undefined
      return current === undefined ? crossable({ saved: true }) : crossable({ saved: true, current })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('overridden by a home patch or command-line overlay')) {
        return { ok: false, code: 'bridge-model-default-overridden' }
      }
      return { ok: false, code: 'bridge-model-default-failed' }
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
