import { SAGE_REQUEST_TIMEOUT_MS, SAGE_STATE_PATH, type SageViewState } from '../../contracts.js'
import { parseDesktopSession, type DesktopSession } from './session.js'

export type DesktopRead =
  | { readonly kind: 'blocked'; readonly code: string }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'read'; readonly runtime: SageViewState; readonly session?: DesktopSession }

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
  return {
    kind: 'read',
    runtime: { status: runtime.status, message: RUNTIME_MESSAGES[runtime.status], retryable: runtime.retryable },
    ...(session === null ? {} : { session }),
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
