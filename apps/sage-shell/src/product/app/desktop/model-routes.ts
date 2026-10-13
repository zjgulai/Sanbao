/**
 * ADR-0339: the saved-model-routes controller — the settings Models pane's narrow port over
 * `/.sage/model-config` plus the credential write it pairs with. Saves never trigger a provider
 * request; the connectivity test is its own explicit action whose result binds to the attempt's
 * configuration and credential facts (it demotes to 仅历史 when they move).
 */
import { SAGE_CREDENTIALS_PATH, SAGE_MODEL_CONFIG_PATH, SAGE_REQUEST_TIMEOUT_MS } from '../../contracts.js'

/** A connectivity test may block on a 20s host clock; give the renderer headroom past it. */
export const SAGE_MODEL_TEST_TIMEOUT_MS = 30_000

export interface ModelRouteCredentialRead {
  readonly name: string
  readonly configured: boolean
}

export interface ModelRouteTestRead {
  readonly state: 'ok' | 'failed' | 'unknown' | 'credential-missing' | 'unsupported'
  readonly latencyMs?: number
  readonly host?: string
  readonly modelIds?: readonly string[]
  readonly testedAt: string
  readonly current: boolean
}

export interface ModelRouteRead {
  readonly route: string
  readonly displayName?: string
  readonly api: string
  readonly baseURL: string
  readonly apiKeyEnv?: string
  readonly modelCount: number
  readonly credential: ModelRouteCredentialRead | null
  readonly test: ModelRouteTestRead | null
}

export type ModelRoutesListRead =
  | { readonly kind: 'read', readonly routes: readonly ModelRouteRead[], readonly namespaceRevision: number | null }
  | { readonly kind: 'unavailable', readonly code: string }

export type ModelRouteSaveOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'refused', readonly code: string }
  | { readonly kind: 'unreachable' }

export type ModelRouteTestOutcome =
  | { readonly kind: 'tested', readonly test: ModelRouteTestRead }
  | { readonly kind: 'refused', readonly code: string }
  | { readonly kind: 'unreachable' }

export interface ModelRoutesController {
  list(): Promise<ModelRoutesListRead>
  saveRoute(request: { readonly route: string, readonly profile: ModelRouteDraftProfile, readonly expectedRevision?: number }): Promise<ModelRouteSaveOutcome>
  removeRoute(request: { readonly route: string }): Promise<ModelRouteSaveOutcome>
  saveCredential(request: { readonly name: string, readonly value: string }): Promise<ModelRouteSaveOutcome>
  testConnection(route: string): Promise<ModelRouteTestOutcome>
}

/** The draft half of one route the editor may declare — same shape the route grammar accepts. */
export interface ModelRouteDraftProfile {
  readonly displayName?: string
  readonly api: 'openai-completions' | 'openai-responses' | 'anthropic-messages'
  readonly baseURL: string
  readonly apiKeyEnv?: string
  readonly models: readonly { readonly id: string }[]
}

type ModelRoutesFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function postJson(path: string, body: unknown, fetcher: ModelRoutesFetch, timeoutMs: number): Promise<unknown | undefined> {
  return fetcher(path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  }).then(async (response) => {
    const receipt: unknown = await response.json().catch(() => undefined)
    if (!response.ok) {
      return isRecord(receipt) && typeof receipt.code === 'string' ? receipt : undefined
    }
    return receipt
  }).catch(() => undefined)
}

function readTest(value: unknown): ModelRouteTestRead | null {
  if (!isRecord(value)) return null
  const state = value.state
  if (state !== 'ok' && state !== 'failed' && state !== 'unknown' && state !== 'credential-missing' && state !== 'unsupported') return null
  if (typeof value.testedAt !== 'string') return null
  return {
    state,
    ...(typeof value.latencyMs === 'number' ? { latencyMs: value.latencyMs } : {}),
    ...(typeof value.host === 'string' ? { host: value.host } : {}),
    ...(Array.isArray(value.modelIds) ? { modelIds: value.modelIds.filter((id): id is string => typeof id === 'string') } : {}),
    testedAt: value.testedAt,
    current: value.current === true,
  }
}

export function classifyModelRoutesList(receipt: unknown): ModelRoutesListRead {
  if (!isRecord(receipt)) return { kind: 'unavailable', code: 'unreachable' }
  if (receipt.state === 'refused' && typeof receipt.code === 'string') return { kind: 'unavailable', code: receipt.code }
  if (receipt.state !== 'read' || !Array.isArray(receipt.routes)) return { kind: 'unavailable', code: 'unrecognised' }
  const routes: ModelRouteRead[] = []
  for (const candidate of receipt.routes) {
    if (!isRecord(candidate) || typeof candidate.route !== 'string' || typeof candidate.api !== 'string' || typeof candidate.baseURL !== 'string') continue
    const credential = isRecord(candidate.credential) && typeof candidate.credential.name === 'string'
      ? { name: candidate.credential.name, configured: candidate.credential.configured === true }
      : null
    routes.push({
      route: candidate.route,
      ...(typeof candidate.displayName === 'string' ? { displayName: candidate.displayName } : {}),
      api: candidate.api,
      baseURL: candidate.baseURL,
      ...(typeof candidate.apiKeyEnv === 'string' ? { apiKeyEnv: candidate.apiKeyEnv } : {}),
      modelCount: typeof candidate.modelCount === 'number' ? candidate.modelCount : 0,
      credential,
      test: readTest(candidate.test),
    })
  }
  return {
    kind: 'read',
    routes,
    namespaceRevision: typeof receipt.namespaceRevision === 'number' && Number.isSafeInteger(receipt.namespaceRevision) ? receipt.namespaceRevision : null,
  }
}

function classifyWrite(receipt: unknown): ModelRouteSaveOutcome {
  if (!isRecord(receipt)) return { kind: 'unreachable' }
  if (receipt.state === 'saved' || receipt.state === 'removed') return { kind: 'saved' }
  if (receipt.state === 'refused' && typeof receipt.code === 'string') return { kind: 'refused', code: receipt.code }
  return { kind: 'refused', code: 'unrecognised' }
}

export function createModelRoutesController(fetcher: ModelRoutesFetch = fetch): ModelRoutesController {
  return {
    async list(): Promise<ModelRoutesListRead> {
      return classifyModelRoutesList(await postJson(SAGE_MODEL_CONFIG_PATH, { action: 'list' }, fetcher, SAGE_REQUEST_TIMEOUT_MS))
    },
    async saveRoute(request): Promise<ModelRouteSaveOutcome> {
      return classifyWrite(await postJson(SAGE_MODEL_CONFIG_PATH, {
        action: 'save-route',
        route: request.route,
        profile: request.profile,
        ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }),
      }, fetcher, SAGE_REQUEST_TIMEOUT_MS))
    },
    async removeRoute(request): Promise<ModelRouteSaveOutcome> {
      return classifyWrite(await postJson(SAGE_MODEL_CONFIG_PATH, { action: 'remove-route', route: request.route }, fetcher, SAGE_REQUEST_TIMEOUT_MS))
    },
    async saveCredential(request): Promise<ModelRouteSaveOutcome> {
      return classifyWrite(await postJson(SAGE_CREDENTIALS_PATH, { action: 'set', name: request.name, value: request.value }, fetcher, SAGE_REQUEST_TIMEOUT_MS))
    },
    async testConnection(route): Promise<ModelRouteTestOutcome> {
      const receipt = await postJson(SAGE_MODEL_CONFIG_PATH, { action: 'test-connection', route }, fetcher, SAGE_MODEL_TEST_TIMEOUT_MS)
      if (!isRecord(receipt)) return { kind: 'unreachable' }
      if (receipt.state === 'refused' && typeof receipt.code === 'string') return { kind: 'refused', code: receipt.code }
      if (receipt.state !== 'tested') return { kind: 'refused', code: 'unrecognised' }
      const test = readTest(receipt.test)
      return test === null ? { kind: 'refused', code: 'unrecognised' } : { kind: 'tested', test }
    },
  }
}

/** Derive the route name and its credential ref from the one field the observed form offers:
 *  the endpoint host. Deterministic, collision-free per endpoint, and readable in the list. */
export function deriveRouteFromEndpoint(api: ModelRouteDraftProfile['api'], baseURL: string): { readonly route: string, readonly apiKeyEnv: string } | undefined {
  let host: string
  try {
    host = new URL(baseURL).host
  } catch {
    return undefined
  }
  const slug = host.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  if (slug === '') return undefined
  const route = `${api === 'anthropic-messages' ? 'anthropic' : 'openai'}-${slug}`.slice(0, 64).replace(/-+$/u, '')
  return { route, apiKeyEnv: `${route.toUpperCase().replaceAll('-', '_')}_API_KEY` }
}
