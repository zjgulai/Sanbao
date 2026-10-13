/**
 * ADR-0339: the model-config port over the host bridge. Mirrors the credential port's shape:
 * identity gate first (zero bridge calls when signed out), answer unwrapping, and refusal codes
 * passed through verbatim. The port also owns the connectivity-test result binding — one
 * in-flight test per route (ticket 018: 不并行重复测试), and the `current` comparison between a
 * record's binding facts and the facts read now (a success only ever says "corresponds to the
 * configuration and credential it ran against"; stale records read 仅历史).
 */
import type { ModelCatalogRead, ModelConfigOutcome, ModelConfigRouteRead, ModelTestView } from '../appservice/contracts.js'

export type BridgeCaller = (endpoint: string, payload?: readonly unknown[]) => Promise<unknown>

type Answer = { readonly ok: true, readonly result: unknown } | { readonly ok: false, readonly code: string }

function asAnswer(value: unknown): Answer {
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === true) {
    return { ok: true, result: (value as { result?: unknown }).result }
  }
  if (value !== null && typeof value === 'object' && (value as { ok?: unknown }).ok === false
    && typeof (value as { code?: unknown }).code === 'string') {
    return { ok: false, code: (value as { code: string }).code }
  }
  return { ok: false, code: 'bridge-answer-unrecognised' }
}

async function callBridgeAnswer(callBridge: BridgeCaller, endpoint: string, payload: readonly unknown[]): Promise<Answer> {
  try {
    return asAnswer(await callBridge(endpoint, payload))
  } catch (error) {
    const code = error !== null && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'bridge-unreachable'
    return { ok: false, code }
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

interface TestRecord {
  readonly state: ModelTestView['state']
  readonly latencyMs?: number
  readonly host?: string
  readonly modelIds?: readonly string[]
  readonly revision?: number
  readonly credentialConfigured: boolean
  readonly testedAt: string
}

export interface ModelConfigRequest {
  readonly action: 'list' | 'save-route' | 'remove-route' | 'test-connection' | 'catalog' | 'set-default'
  readonly route?: string
  readonly profile?: unknown
  readonly expectedRevision?: number
  readonly provider?: string
  readonly model?: string
  readonly reasoningEffort?: string
}

/** One saved route read from the llm-pi-ai namespace's layers (user wins over base). */
interface SavedRoute {
  readonly route: string
  readonly displayName?: string
  readonly api: string
  readonly baseURL: string
  readonly apiKeyEnv?: string
  readonly modelCount: number
}

function savedRoutes(described: unknown): { readonly routes: readonly SavedRoute[], readonly revision: number | undefined } | undefined {
  if (!isPlainRecord(described) || !Array.isArray(described.namespaces)) return undefined
  const namespace = described.namespaces.find((candidate): candidate is Record<string, unknown> =>
    isPlainRecord(candidate) && candidate.ns === 'llm-pi-ai')
  if (namespace === undefined) return { routes: [], revision: undefined }
  const revision = typeof namespace.revision === 'number' && Number.isSafeInteger(namespace.revision) ? namespace.revision : undefined
  // Effective config (redacted) is the truth: the user layer reads the receipt-sealed
  // in-generation patch file and stays empty in Sage's layout (ADR-0339).
  const section = isPlainRecord(namespace.value) ? namespace.value : isPlainRecord(namespace.user) ? namespace.user : {}
  const providers = isPlainRecord(section.providers) ? section.providers : {}
  const routes: SavedRoute[] = []
  for (const [route, raw] of Object.entries(providers)) {
    if (!isPlainRecord(raw)) continue
    const baseURL = typeof raw.baseURL === 'string' && raw.baseURL.length > 0 ? raw.baseURL : undefined
    if (baseURL === undefined) continue
    routes.push({
      route,
      ...(typeof raw.displayName === 'string' ? { displayName: raw.displayName } : {}),
      api: typeof raw.api === 'string' ? raw.api : 'openai-completions',
      baseURL,
      ...(typeof raw.apiKeyEnv === 'string' ? { apiKeyEnv: raw.apiKeyEnv } : {}),
      modelCount: Array.isArray(raw.models) ? raw.models.length : 0,
    })
  }
  routes.sort((left, right) => left.route.localeCompare(right.route))
  return { routes, revision }
}

function readSelection(value: unknown): { readonly provider: string, readonly model: string, readonly reasoningEffort?: string } | undefined {
  if (!isPlainRecord(value) || typeof value.provider !== 'string' || typeof value.model !== 'string') return undefined
  return {
    provider: value.provider,
    model: value.model,
    ...(typeof value.reasoningEffort === 'string' ? { reasoningEffort: value.reasoningEffort } : {}),
  }
}

/** Defensive mapping of the base catalog: unknown shapes are dropped, never guessed. */
function readCatalog(value: unknown): ModelCatalogRead | undefined {
  if (!isPlainRecord(value) || !Array.isArray(value.groups)) return undefined
  const groups = value.groups.flatMap((candidate) => {
    if (!isPlainRecord(candidate) || typeof candidate.id !== 'string' || !Array.isArray(candidate.models)) return []
    const models = candidate.models.flatMap((model) => {
      if (!isPlainRecord(model) || typeof model.id !== 'string') return []
      const reasoning = isPlainRecord(model.reasoning) && Array.isArray(model.reasoning.efforts)
        ? model.reasoning.efforts.flatMap((effort) => isPlainRecord(effort) && typeof effort.id === 'string'
          ? [{ id: effort.id, ...(typeof effort.name === 'string' ? { name: effort.name } : {}) }]
          : [])
        : undefined
      return [{
        id: model.id,
        ...(typeof model.name === 'string' ? { name: model.name } : {}),
        ...(reasoning === undefined || reasoning.length === 0 ? {} : { reasoningEfforts: reasoning }),
      }]
    })
    return [{
      id: candidate.id,
      name: typeof candidate.name === 'string' ? candidate.name : candidate.id,
      models,
    }]
  })
  const failures = Array.isArray(value.failures)
    ? value.failures.flatMap((failure) => isPlainRecord(failure) && typeof failure.id === 'string'
      ? [{
          id: failure.id,
          name: typeof failure.name === 'string' ? failure.name : failure.id,
          message: typeof failure.message === 'string' ? failure.message.slice(0, 300) : '不可用',
        }]
      : [])
    : []
  return { default: readSelection(value.default) ?? null, groups, failures }
}

function readTestVerdict(result: unknown): Omit<TestRecord, 'testedAt'> | undefined {
  if (!isPlainRecord(result)) return undefined
  const state = result.state
  if (state !== 'ok' && state !== 'failed' && state !== 'unknown' && state !== 'credential-missing' && state !== 'unsupported') return undefined
  return {
    state,
    ...(typeof result.latencyMs === 'number' ? { latencyMs: result.latencyMs } : {}),
    ...(typeof result.host === 'string' ? { host: result.host } : {}),
    ...(Array.isArray(result.modelIds) ? { modelIds: result.modelIds.filter((id): id is string => typeof id === 'string') } : {}),
    ...(typeof result.revision === 'number' && Number.isSafeInteger(result.revision) ? { revision: result.revision } : {}),
    credentialConfigured: result.credentialConfigured === true,
  }
}

export function createModelConfig(
  callBridge: BridgeCaller,
  identitySession: () => unknown | null,
  now: () => string = () => new Date().toISOString(),
) {
  // One in-flight test per route; latest result per route only (a rerun supersedes its record).
  const inFlight = new Set<string>()
  const results = new Map<string, TestRecord>()

  return async (request: ModelConfigRequest): Promise<ModelConfigOutcome> => {
    if (identitySession() === null) {
      return { state: 'refused', code: 'model-config-identity-unavailable', retryable: true }
    }

    if (request.action === 'list') {
      const described = await callBridgeAnswer(callBridge, 'settings/describe', [])
      if (!described.ok) return { state: 'refused', code: described.code, retryable: true }
      const listed = savedRoutes(described.result)
      if (listed === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised', retryable: true }
      const routes: ModelConfigRouteRead[] = []
      for (const route of listed.routes) {
        // Credential presence is a fact about the ACTIVE provider, not the settings document —
        // asked per declared ref through the same describe half the credential card uses.
        let credential: ModelConfigRouteRead['credential'] = null
        if (route.apiKeyEnv !== undefined) {
          const presence = await callBridgeAnswer(callBridge, 'credentials/describe', [{ name: route.apiKeyEnv }])
          const configured = presence.ok && isPlainRecord(presence.result) && presence.result.configured === true
          credential = { name: route.apiKeyEnv, configured }
        }
        const record = results.get(route.route)
        const test: ModelTestView | null = record === undefined ? null : {
          state: record.state,
          ...(record.latencyMs === undefined ? {} : { latencyMs: record.latencyMs }),
          ...(record.host === undefined ? {} : { host: record.host }),
          ...(record.modelIds === undefined ? {} : { modelIds: record.modelIds }),
          testedAt: record.testedAt,
          current: record.revision !== undefined && record.revision === listed.revision
            && record.credentialConfigured === (credential?.configured ?? false),
        }
        routes.push({ ...route, credential, test })
      }
      return { state: 'read', routes, namespaceRevision: listed.revision ?? null }
    }

    if (request.action === 'save-route') {
      const answer = await callBridgeAnswer(callBridge, 'modelConfig/save', [{
        route: request.route,
        profile: request.profile,
        ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }),
      }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: answer.code === 'bridge-settings-conflict' }
      return { state: 'saved', route: request.route ?? '' }
    }

    if (request.action === 'remove-route') {
      const answer = await callBridgeAnswer(callBridge, 'modelConfig/remove', [{
        route: request.route,
        ...(request.expectedRevision === undefined ? {} : { expectedRevision: request.expectedRevision }),
      }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: answer.code === 'bridge-settings-conflict' }
      const removed = request.route ?? ''
      results.delete(removed)
      return { state: 'removed', route: removed }
    }

    if (request.action === 'catalog') {
      const answer = await callBridgeAnswer(callBridge, 'modelConfig/catalog', [])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: true }
      const catalog = readCatalog(answer.result)
      if (catalog === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised', retryable: true }
      return { state: 'catalog', catalog }
    }

    if (request.action === 'set-default') {
      const provider = request.provider ?? ''
      const model = request.model ?? ''
      if (provider === '' || model === '') return { state: 'refused', code: 'model-config-selection-invalid', retryable: false }
      const answer = await callBridgeAnswer(callBridge, 'modelConfig/default', [{
        provider,
        model,
        ...(request.reasoningEffort === undefined ? {} : { reasoningEffort: request.reasoningEffort }),
      }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: answer.code === 'bridge-model-default-failed' }
      const selection = readSelection(isPlainRecord(answer.result) ? answer.result.current : undefined) ?? { provider, model }
      return { state: 'default-set', selection }
    }

    const route = request.route ?? ''
    if (route === '') return { state: 'refused', code: 'model-config-route-invalid', retryable: false }
    if (inFlight.has(route)) return { state: 'refused', code: 'model-test-in-flight', retryable: true }
    inFlight.add(route)
    try {
      const answer = await callBridgeAnswer(callBridge, 'modelConfig/test', [{ route }])
      if (!answer.ok) return { state: 'refused', code: answer.code, retryable: true }
      const verdict = readTestVerdict(answer.result)
      if (verdict === undefined) return { state: 'refused', code: 'bridge-answer-unrecognised', retryable: true }
      const record: TestRecord = { ...verdict, testedAt: now() }
      results.set(route, record)
      return {
        state: 'tested',
        route,
        // This attempt just ran against the configuration read microseconds ago — it IS current.
        test: {
          state: record.state,
          ...(record.latencyMs === undefined ? {} : { latencyMs: record.latencyMs }),
          ...(record.host === undefined ? {} : { host: record.host }),
          ...(record.modelIds === undefined ? {} : { modelIds: record.modelIds }),
          testedAt: record.testedAt,
          current: true,
        },
      }
    } finally {
      inFlight.delete(route)
    }
  }
}
